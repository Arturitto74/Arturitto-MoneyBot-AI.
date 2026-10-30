// ==================================================
// ARTURITTO MONEYBOT AI v1.3.1
// JEDEN SYSTEM MONITOROWANIA CEN
// Baza cen: Cloudflare D1
// Subskrypcje i wysylki: Cloudflare KV
// ==================================================

const SITE = "https://arturitto-moneybot-ai.pages.dev";
const SHOP = "diablo-chairs";

const MIN_PERCENT = 5;
const MIN_SAVING = 10;
const MAX_MESSAGES_PER_USER = 3;

// ==================================================
// NARZEDZIA
// ==================================================

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function parsePrice(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(
    String(value)
      .replace(/\s/g, "")
      .replace(",", ".")
  );

  if (
    !Number.isFinite(number) ||
    number <= 0 ||
    number >= 10000000
  ) {
    return null;
  }

  return Math.round(number * 100) / 100;
}

function money(value) {
  return Number(value).toLocaleString("pl-PL", {
    style: "currency",
    currency: "PLN"
  });
}

function validImage(value) {
  try {
    const url = new URL(String(value));

    return url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

// ==================================================
// POBIERANIE KATALOGU
// ==================================================

async function getCatalog() {
  const response = await fetch(
    `${SITE}/api/products`,
    {
      headers: {
        Accept: "application/json"
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      `Nie mozna pobrac katalogu: HTTP ${response.status}`
    );
  }

  const result = await response.json();

  if (!Array.isArray(result.products)) {
    throw new Error("Nieprawidlowy katalog");
  }

  return result.products;
}

// ==================================================
// SYNCHRONIZACJA CEN Z D1
// ==================================================

async function synchronizePrices(db, products) {
  const previousResult = await db.prepare(`
    SELECT product_id, price
    FROM product_prices
    WHERE shop_id = ?
  `).bind(SHOP).all();

  const previousPrices = new Map(
    previousResult.results.map(row => [
      String(row.product_id),
      Number(row.price)
    ])
  );

  const statements = [];
  const seen = new Set();

  let added = 0;
  let changed = 0;
  let unchanged = 0;
  let skipped = 0;

  for (const product of products) {
    const id = String(product.id ?? "");
    const price = parsePrice(product.price);

    if (
      !/^[a-zA-Z0-9_.-]{1,100}$/.test(id) ||
      price === null ||
      seen.has(id)
    ) {
      skipped++;
      continue;
    }

    seen.add(id);

    const oldPrice = previousPrices.get(id);

    if (
      oldPrice !== undefined &&
      Math.round(oldPrice * 100) ===
      Math.round(price * 100)
    ) {
      unchanged++;
      continue;
    }

    const name = String(
      product.name || "Produkt"
    ).slice(0, 500);

    if (oldPrice === undefined) {
      added++;
    } else {
      changed++;
    }

    // Historia: zapisujemy tylko nowa cene.
    statements.push(
      db.prepare(`
        INSERT INTO price_history
        (product_id, shop_id, price)
        VALUES (?, ?, ?)
      `).bind(id, SHOP, price)
    );

    // Aktualna cena produktu.
    statements.push(
      db.prepare(`
        INSERT INTO product_prices
        (product_id, shop_id, product_name, price)
        VALUES (?, ?, ?, ?)

        ON CONFLICT(product_id, shop_id)
        DO UPDATE SET
          product_name = excluded.product_name,
          price = excluded.price,
          checked_at = CURRENT_TIMESTAMP
      `).bind(id, SHOP, name, price)
    );
  }

  // Zapis wsadowy. Brak zmian = brak zapisu.
  for (
    let i = 0;
    i < statements.length;
    i += 40
  ) {
    await db.batch(
      statements.slice(i, i + 40)
    );
  }

  return {
    added,
    changed,
    unchanged,
    skipped
  };
}

// ==================================================
// WYKRYWANIE OBNIZEK Z HISTORII D1
// ==================================================

async function getPriceDrops(db) {
  const result = await db.prepare(`
    WITH ranked AS (
      SELECT
        id,
        product_id,
        shop_id,
        price,
        ROW_NUMBER() OVER (
          PARTITION BY shop_id, product_id
          ORDER BY id DESC
        ) AS rn
      FROM price_history
      WHERE shop_id = ?
    )

    SELECT
      p.product_id AS productId,
      p.product_name AS name,
      p.price AS currentPrice,
      previous.price AS previousPrice,
      latest.id AS eventId

    FROM product_prices p

    JOIN ranked latest
      ON latest.product_id = p.product_id
      AND latest.shop_id = p.shop_id
      AND latest.rn = 1

    JOIN ranked previous
      ON previous.product_id = p.product_id
      AND previous.shop_id = p.shop_id
      AND previous.rn = 2

    WHERE
      p.shop_id = ?
      AND p.price = latest.price
      AND p.price < previous.price

    ORDER BY
      (previous.price - p.price) /
      previous.price DESC

    LIMIT 100
  `).bind(SHOP, SHOP).all();

  const deals = [];

  for (const row of result.results) {
    const previous = parsePrice(row.previousPrice);
    const current = parsePrice(row.currentPrice);

    if (
      previous === null ||
      current === null ||
      current >= previous
    ) {
      continue;
    }

    const saving = previous - current;
    const percent = saving / previous * 100;

    if (
      saving < MIN_SAVING ||
      percent < MIN_PERCENT
    ) {
      continue;
    }

    deals.push({
      id: String(row.productId),
      eventId: String(row.eventId),
      name: String(row.name || "Produkt"),
      oldPrice: previous,
      price: current,
      saving,
      percent: Math.round(percent)
    });
  }

  return deals;
}

// ==================================================
// TELEGRAM API
// ==================================================

async function telegram(token, method, payload) {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(
      result.description || "Telegram API error"
    );
  }

  return result;
}

// ==================================================
// WIADOMOSC O PROMOCJI
// ==================================================

async function sendPromotion(
  token,
  chatId,
  deal,
  product
) {
  const text =
    "🔥 ARTURITTO MONEYBOT AI\n" +
    "📉 WYKRYTO OBNIZKE CENY!\n\n" +

    `🛒 ${deal.name}\n\n` +

    `💰 Bylo: ${money(deal.oldPrice)}\n` +
    `✅ Jest: ${money(deal.price)}\n` +
    `💵 Oszczedzasz: ${money(deal.saving)}\n` +
    `📉 Obnizka: ${deal.percent}%\n\n` +

    "Cena porownana z poprzednim odczytem.\n" +
    "Sprawdz aktualna cene w sklepie.\n\n" +
    "Link afiliacyjny.";

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: "🛍️ SPRAWDZ OFERTE",
          url:
            `${SITE}/produkt/` +
            encodeURIComponent(deal.id)
        }
      ]
    ]
  };

  const image = validImage(product?.image);

  if (image) {
    try {
      await telegram(token, "sendPhoto", {
        chat_id: chatId,
        photo: image,
        caption: text.slice(0, 1000),
        reply_markup: keyboard
      });

      return;
    } catch (error) {
      console.warn(
        "MoneyBot: zdjecie niedostepne",
        String(error.message).slice(0, 100)
      );
    }
  }

  // Jesli nie uda sie wyslac zdjecia,
  // wysylamy normalna wiadomosc.
  await telegram(token, "sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    reply_markup: keyboard
  });
}

// ==================================================
// WYSYLKA BEZ POWTARZANIA PROMOCJI
// ==================================================

async function notifySubscribers(
  kv,
  token,
  deals,
  products
) {
  const productMap = new Map(
    products.map(product => [
      String(product.id),
      product
    ])
  );

  let cursor;
  let subscribers = 0;
  let sent = 0;
  let failed = 0;
  let duplicatesSkipped = 0;

  do {
    const page = await kv.list({
      prefix: "subscriber:",
      limit: 1000,
      ...(cursor ? { cursor } : {})
    });

    for (const item of page.keys) {
      const chatId = item.name.slice(
        "subscriber:".length
      );

      if (!/^-?\d+$/.test(chatId)) {
        continue;
      }

      subscribers++;

      let userSent = 0;

      for (const deal of deals) {
        if (userSent >= MAX_MESSAGES_PER_USER) {
          break;
        }

        // Unikalna promocja jest rozpoznawana
        // po identyfikatorze wpisu historii D1.
        const sentKey =
          `deal-sent-d1:${chatId}:` +
          `${SHOP}:${deal.eventId}`;

        const alreadySent = await kv.get(sentKey);

        if (alreadySent !== null) {
          duplicatesSkipped++;
          continue;
        }

        // Uzytkownik mogl wylaczyc subskrypcje
        // podczas trwania sprawdzania.
        const subscription = await kv.get(
          `subscriber:${chatId}`
        );

        if (subscription === null) {
          break;
        }

        try {
          await sendPromotion(
            token,
            chatId,
            deal,
            productMap.get(deal.id)
          );

          // Dopiero po potwierdzeniu Telegrama
          // zapisujemy informacje o wysylce.
          await kv.put(
            sentKey,
            new Date().toISOString()
          );

          sent++;
          userSent++;

        } catch (error) {
          failed++;

          console.error(
            "MoneyBot Telegram:",
            String(error.message).slice(0, 150)
          );

          // Nie oznaczamy promocji jako wyslanej.
          // Kolejny przebieg moze ponowic probe.
        }
      }
    }

    cursor = page.list_complete
      ? undefined
      : page.cursor;

  } while (cursor);

  return {
    subscribers,
    sent,
    failed,
    duplicatesSkipped
  };
}

// ==================================================
// GLOWNY AUTOMAT MONEYBOT AI
// ==================================================

export async function onRequestPost({ request, env }) {
  const secret = env.DEAL_JOB_SECRET;
  const receivedSecret = request.headers.get(
    "X-MoneyBot-Job-Secret"
  );

  if (!secret || receivedSecret !== secret) {
    return json({
      status: "unauthorized"
    }, 401);
  }

  if (
    !env.DB ||
    !env.MONEYBOT_SUBSCRIBERS ||
    !env.TELEGRAM_BOT_TOKEN
  ) {
    return json({
      status: "error",
      message: "Brak wymaganych polaczen"
    }, 503);
  }

  try {
    console.log(
      "MoneyBot v1.3.1: rozpoczynam synchronizacje D1"
    );

    // 1. Pobieramy aktualne ceny.
    const products = await getCatalog();

    // 2. Aktualizujemy historie D1.
    const sync = await synchronizePrices(
      env.DB,
      products
    );

    // 3. Odczytujemy promocje z tej samej bazy,
    // z ktorej korzysta strona MoneyBota.
    const deals = await getPriceDrops(env.DB);

    // 4. Wysylamy brakujace powiadomienia.
    const delivery = await notifySubscribers(
      env.MONEYBOT_SUBSCRIBERS,
      env.TELEGRAM_BOT_TOKEN,
      deals,
      products
    );

    const result = {
      status: delivery.failed ? "partial" : "ok",
      version: "1.3.1",
      source: "Cloudflare D1",
      shop: SHOP,

      products: products.length,

      added: sync.added,
      changed: sync.changed,
      unchanged: sync.unchanged,
      skipped: sync.skipped,

      promotions: deals.length,

      subscribers: delivery.subscribers,
      sent: delivery.sent,
      failed: delivery.failed,

      duplicatesSkipped:
        delivery.duplicatesSkipped,

      checkedAt: new Date().toISOString()
    };

    console.log(
      "MoneyBot: sprawdzanie zakończone",
      JSON.stringify(result)
    );

    return json(result);

  } catch (error) {
    console.error(
      "MoneyBot v1.3.1:",
      String(error.message).slice(0, 200)
    );

    return json({
      status: "error",
      message: "Nie udalo sie wykonac monitoringu"
    }, 502);
  }
}
