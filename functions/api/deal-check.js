const SITE = "https://arturitto-moneybot-ai.pages.dev";

const MIN_DROP_PERCENT = 5;
const MIN_DROP_AMOUNT = 10;
const MAX_DEALS_PER_RUN = 3;

const PENDING_TTL = 60 * 60 * 48;
const SENT_TTL = 60 * 60 * 24 * 30;

// =====================================
// ODPOWIEDZI JSON
// =====================================

function json(data, status = 200) {
  return Response.json(data, { status });
}

// =====================================
// WALIDACJA CENY
// =====================================

function validPrice(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }

  return number;
}

function money(value) {
  return Number(value).toLocaleString("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + " zł";
}

// =====================================
// POBIERANIE PRODUKTÓW
// =====================================

async function getProducts() {
  const response = await fetch(`${SITE}/api/products`);

  if (!response.ok) {
    throw new Error(
      `Nie można pobrać katalogu: ${response.status}`
    );
  }

  const result = await response.json();

  if (!Array.isArray(result.products)) {
    throw new Error("Nieprawidłowy katalog produktów");
  }

  return result.products;
}

// =====================================
// TELEGRAM
// =====================================

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
      result.description || `Telegram HTTP ${response.status}`
    );
  }

  return result;
}

// =====================================
// WYSYŁANIE PROMOCJI
// =====================================

async function sendDeal(token, chatId, deal) {
  const text =
    "🔥 MONEYBOT AI — OBNIŻKA CENY!\n\n" +
    `🛒 ${deal.name}\n\n` +
    `💰 Poprzednia cena: ${money(deal.oldPrice)}\n` +
    `✅ Aktualna cena: ${money(deal.price)}\n` +
    `📉 Obniżka: ${deal.percent}%\n\n` +
    "Cena porównana z wcześniejszym odczytem.\n" +
    "Sprawdź aktualną cenę i dostępność w sklepie.\n" +
    "Link afiliacyjny.";

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: "🛍️ ZOBACZ PROMOCJĘ",
          url:
            `${SITE}/produkt/` +
            encodeURIComponent(deal.id)
        }
      ]
    ]
  };

  // Najpierw próbujemy wysłać zdjęcie.
  if (deal.image) {
    try {
      const imageUrl = new URL(deal.image);

      if (imageUrl.protocol === "https:") {
        await telegram(token, "sendPhoto", {
          chat_id: chatId,
          photo: imageUrl.href,
          caption: text.slice(0, 1000),
          reply_markup: keyboard
        });

        return true;
      }
    } catch (error) {
      console.warn(
        "Nie udało się wysłać zdjęcia:",
        String(error.message).slice(0, 100)
      );
    }
  }

  // Jeśli zdjęcie jest niedostępne, wysyłamy tekst.
  await telegram(token, "sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    reply_markup: keyboard
  });

  return true;
}

// =====================================
// SPRAWDZANIE ZMIAN CEN
// =====================================

async function checkPrices(kv, products) {
  let checked = 0;
  let newDrops = 0;
  let initialized = 0;

  for (const product of products) {
    const id = String(product.id ?? "");

    if (!id || id.length > 100) {
      continue;
    }

    const current = validPrice(product.price);

    if (current === null) {
      continue;
    }

    const safeId = encodeURIComponent(id);

    const priceKey = `deal-price:13117:${safeId}`;
    const pendingKey = `deal-pending:${safeId}`;

    const previousText = await kv.get(priceKey);

    checked++;

    // Pierwszy odczyt jest wyłącznie punktem odniesienia.
    if (previousText === null) {
      await kv.put(priceKey, String(current));
      initialized++;
      continue;
    }

    const previous = validPrice(previousText);

    if (previous === null) {
      await kv.put(priceKey, String(current));
      continue;
    }

    // Cena bez zmian.
    if (previous === current) {
      continue;
    }

    const saving = previous - current;
    const percent = (saving / previous) * 100;

    if (
      saving >= MIN_DROP_AMOUNT &&
      percent >= MIN_DROP_PERCENT
    ) {
      const deal = {
        id,
        name: String(product.name || "Produkt"),
        image: String(product.image || ""),
        oldPrice: previous,
        price: current,
        percent: Math.round(percent),
        createdAt: new Date().toISOString()
      };

      // Zapisujemy promocję przed aktualizacją ceny.
      await kv.put(
        pendingKey,
        JSON.stringify(deal),
        { expirationTtl: PENDING_TTL }
      );

      newDrops++;
    } else {
      // Starsza promocja przestaje być aktualna,
      // jeśli cena zmieniła się ponownie.
      await kv.delete(pendingKey);
    }

    // Aktualizacja ceny odniesienia.
    await kv.put(priceKey, String(current));
  }

  return {
    checked,
    initialized,
    newDrops
  };
}

// =====================================
// POBIERANIE OCZEKUJĄCYCH PROMOCJI
// =====================================

async function getPendingDeals(kv) {
  const deals = [];
  let cursor;

  do {
    const page = await kv.list({
      prefix: "deal-pending:",
      limit: 1000,
      ...(cursor ? { cursor } : {})
    });

    for (const item of page.keys) {
      const raw = await kv.get(item.name);

      if (!raw) {
        continue;
      }

      try {
        const deal = JSON.parse(raw);

        if (deal.id && validPrice(deal.price) !== null) {
          deals.push({
            ...deal,
            pendingKey: item.name
          });
        }
      } catch {
        console.warn("Nieprawidłowy zapis promocji");
      }
    }

    cursor = page.list_complete
      ? undefined
      : page.cursor;

  } while (cursor);

  deals.sort((a, b) => b.percent - a.percent);

  return deals;
}

// =====================================
// LISTA SUBSKRYBENTÓW
// =====================================

async function getSubscribers(kv) {
  const subscribers = [];
  let cursor;

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

      if (/^-?\d+$/.test(chatId)) {
        subscribers.push(chatId);
      }
    }

    cursor = page.list_complete
      ? undefined
      : page.cursor;

  } while (cursor);

  return subscribers;
}

// =====================================
// WYSYŁANIE BEZ POWTARZANIA WIADOMOŚCI
// =====================================

async function distributeDeals(kv, token, deals) {
  const subscribers = await getSubscribers(kv);

  let sent = 0;
  let failed = 0;
  let duplicatesSkipped = 0;

  const selected = deals.slice(0, MAX_DEALS_PER_RUN);

  for (const deal of selected) {
    let completed = true;

    const eventId = encodeURIComponent(
      `${deal.id}:${deal.price}:${deal.createdAt}`
    );

    for (const chatId of subscribers) {
      // Sprawdzamy, czy użytkownik nadal ma subskrypcję.
      const subscription = await kv.get(
        `subscriber:${chatId}`
      );

      if (subscription === null) {
        continue;
      }

      const sentKey =
        `deal-sent:${chatId}:${eventId}`;

      const alreadySent = await kv.get(sentKey);

      if (alreadySent !== null) {
        duplicatesSkipped++;
        continue;
      }

      try {
        await sendDeal(token, chatId, deal);

        // Oznaczamy jako wysłane dopiero po
        // potwierdzeniu sukcesu przez Telegram.
        await kv.put(
          sentKey,
          new Date().toISOString(),
          { expirationTtl: SENT_TTL }
        );

        sent++;

      } catch (error) {
        failed++;
        completed = false;

        console.error(
          "Błąd wysyłki Telegram:",
          String(error.message).slice(0, 150)
        );
      }
    }

    // Usuwamy promocję z kolejki tylko wtedy,
    // gdy nie ma nieobsłużonych błędów.
    if (completed) {
      await kv.delete(deal.pendingKey);
    }
  }

  return {
    subscribers: subscribers.length,
    processedDeals: selected.length,
    sent,
    failed,
    duplicatesSkipped
  };
}

// =====================================
// GŁÓWNA FUNKCJA CLOUDFLARE PAGES
// =====================================

export async function onRequestPost({ request, env }) {
  const kv = env.MONEYBOT_SUBSCRIBERS;
  const token = env.TELEGRAM_BOT_TOKEN;
  const secret = env.DEAL_JOB_SECRET;

  // Weryfikacja konfiguracji.
  if (!kv || !token || !secret) {
    return json({
      status: "error",
      message: "Brak konfiguracji MoneyBota"
    }, 503);
  }

  // Żądanie musi pochodzić od uprawnionego Workera.
  const receivedSecret = request.headers.get(
    "X-MoneyBot-Job-Secret"
  );

  if (receivedSecret !== secret) {
    return json({
      status: "unauthorized"
    }, 401);
  }

  try {
    console.log("MoneyBot: rozpoczęto kontrolę cen");

    const products = await getProducts();

    const prices = await checkPrices(
      kv,
      products
    );

    const pending = await getPendingDeals(kv);

    const delivery = await distributeDeals(
      kv,
      token,
      pending
    );

    const result = {
      status: delivery.failed
        ? "partial"
        : "ok",
      products: products.length,
      checked: prices.checked,
      initialized: prices.initialized,
      promotions: prices.newDrops,
      pendingPromotions: pending.length,
      sent: delivery.sent,
      failed: delivery.failed,
      subscribers: delivery.subscribers,
      duplicatesSkipped: delivery.duplicatesSkipped,
      checkedAt: new Date().toISOString()
    };

    console.log(
      "MoneyBot: wynik",
      JSON.stringify(result)
    );

    return json(result);

  } catch (error) {
    console.error(
      "MoneyBot: błąd automatu",
      String(error.message).slice(0, 200)
    );

    return json({
      status: "error",
      message: "Nie udało się sprawdzić promocji"
    }, 502);
  }
}
