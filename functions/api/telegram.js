const SITE = "https://arturitto-moneybot-ai.pages.dev";
const LIMIT = 5;

// ============================================
// TELEGRAM API
// ============================================

async function tg(token, method, data) {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
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

async function send(token, chat, text, keyboard = null) {
  return tg(token, "sendMessage", {
    chat_id: chat,
    text,
    disable_web_page_preview: true,
    ...(keyboard
      ? {
          reply_markup: {
            inline_keyboard: keyboard
          }
        }
      : {})
  });
}

function productUrl(id) {
  return `${SITE}/produkt/${encodeURIComponent(id)}`;
}

// ============================================
// MENU GŁÓWNE
// ============================================

const menu = [
  [
    {
      text: "🛒 Oferty",
      callback_data: "list:0"
    },
    {
      text: "🔎 Wyszukiwanie",
      callback_data: "help"
    }
  ],
  [
    {
      text: "🔔 Powiadomienia",
      callback_data: "notify"
    },
    {
      text: "🌐 MoneyBot",
      url: SITE
    }
  ]
];

async function showMenu(token, chat) {
  await send(
    token,
    chat,
    "🤖 ARTURITTO MONEYBOT AI\n\n" +
    "🛒 /oferty — przeglądaj produkty\n" +
    "🔎 /szukaj fotel — wyszukaj produkty\n" +
    "📷 /produkt 1051 — szczegóły produktu\n" +
    "🔔 /powiadomienia — ustawienia powiadomień\n" +
    "✅ /wlacz — włącz powiadomienia\n" +
    "❌ /wylacz — wyłącz powiadomienia\n\n" +
    "Możesz też wpisać samą nazwę produktu.\n\n" +
    "Oferty mogą zawierać linki afiliacyjne.",
    menu
  );
}

// ============================================
// KATALOG PRODUKTÓW
// ============================================

async function catalog() {
  const response = await fetch(`${SITE}/api/products`);

  if (!response.ok) {
    throw new Error("Katalog niedostępny");
  }

  const data = await response.json();

  if (!Array.isArray(data.products)) {
    throw new Error("Nieprawidłowy katalog");
  }

  return data.products;
}

function price(product) {
  const value = Number(product.price);

  if (
    product.price == null ||
    product.price === "" ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return "Sprawdź w sklepie";
  }

  return (
    value.toLocaleString("pl-PL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + " zł"
  );
}

// ============================================
// LISTA PRODUKTÓW
// ============================================

async function list(
  token,
  chat,
  products,
  page = 0,
  query = ""
) {
  const pages = Math.max(
    1,
    Math.ceil(products.length / LIMIT)
  );

  page = Math.min(
    Math.max(Number(page) || 0, 0),
    pages - 1
  );

  const selected = products.slice(
    page * LIMIT,
    (page + 1) * LIMIT
  );

  let text = "🛒 ARTURITTO MONEYBOT AI\n\n";

  text += `Znaleziono: ${products.length}\n`;
  text += `Strona: ${page + 1}/${pages}\n\n`;

  for (const product of selected) {
    text += `🪑 ${product.name}\n`;
    text += `💰 ${price(product)}\n\n`;
  }

  if (!selected.length) {
    text += "Nie znaleziono produktów.\n\n";
  }

  text += "Linki mogą mieć charakter afiliacyjny.";

  const buttons = selected.map(product => [
    {
      text: "📷 " + String(product.name).slice(0, 25),
      callback_data: "p:" + String(product.id).slice(0, 40)
    },
    {
      text: "🔗 Oferta",
      url: productUrl(product.id)
    }
  ]);

  if (!query) {
    const navigation = [];

    if (page > 0) {
      navigation.push({
        text: "⬅️ Poprzednia",
        callback_data: `list:${page - 1}`
      });
    }

    if (page + 1 < pages) {
      navigation.push({
        text: "Następna ➡️",
        callback_data: `list:${page + 1}`
      });
    }

    if (navigation.length) {
      buttons.push(navigation);
    }
  }

  buttons.push([
    {
      text: "🏠 Menu główne",
      callback_data: "home"
    }
  ]);

  await send(token, chat, text, buttons);
}

// ============================================
// ZDJĘCIE I SZCZEGÓŁY PRODUKTU
// ============================================

async function photo(token, chat, product) {
  const caption =
    `🛒 ${product.name}\n\n` +
    `💰 ${price(product)}\n\n` +
    `${String(product.description || "").slice(0, 450)}\n\n` +
    "Link afiliacyjny. Cena i dostępność mogą się zmienić.";

  const buttons = [
    [
      {
        text: "🛍️ Zobacz ofertę",
        url: productUrl(product.id)
      }
    ],
    [
      {
        text: "⬅️ Więcej ofert",
        callback_data: "list:0"
      }
    ]
  ];

  try {
    const image = new URL(product.image);

    if (image.protocol !== "https:") {
      throw new Error("Nieprawidłowy obraz");
    }

    await tg(token, "sendPhoto", {
      chat_id: chat,
      photo: image.href,
      caption: caption.slice(0, 1000),
      reply_markup: {
        inline_keyboard: buttons
      }
    });

  } catch {
    await send(token, chat, caption, buttons);
  }
}

// ============================================
// POWIADOMIENIA — CLOUDFLARE KV
// ============================================

async function notifications(
  token,
  chat,
  env,
  action = ""
) {
  const kv = env.MONEYBOT_SUBSCRIBERS;

  if (!kv) {
    await send(
      token,
      chat,
      "⚠️ Baza powiadomień nie jest dostępna.\n" +
      "Sprawdź powiązanie MONEYBOT_SUBSCRIBERS w Cloudflare."
    );

    return;
  }

  const key = `subscriber:${chat}`;

  // WŁĄCZANIE POWIADOMIEŃ
  if (action === "on") {
    await kv.put(
      key,
      JSON.stringify({
        chatId: String(chat),
        enabled: true,
        createdAt: new Date().toISOString()
      })
    );
  }

  // WYŁĄCZANIE POWIADOMIEŃ
  if (action === "off") {
    await kv.delete(key);
  }

  // ODCZYT STANU SUBSKRYPCJI
  const stored = await kv.get(key);
  const active = stored !== null;

  const keyboard = [
    [
      {
        text: "✅ Włącz",
        callback_data: "sub:on"
      },
      {
        text: "❌ Wyłącz",
        callback_data: "sub:off"
      }
    ],
    [
      {
        text: "🏠 Menu główne",
        callback_data: "home"
      }
    ]
  ];

  let text =
    `🔔 POWIADOMIENIA MONEYBOT AI\n\n` +
    `Status: ${active ? "✅ WŁĄCZONE" : "❌ WYŁĄCZONE"}\n\n`;

  if (action === "on" && active) {
    text += "✅ Zapisano subskrypcję.\n\n";
  }

  if (action === "off" && !active) {
    text += "✅ Wyłączono subskrypcję.\n\n";
  }

  text +=
    "Automatyczna wysyłka ofert zostanie " +
    "uruchomiona osobno.\n\n" +
    "Powiadomienia będą dotyczyć wyłącznie " +
    "ofert dostępnych w MoneyBocie.";

  await send(token, chat, text, keyboard);
}

// ============================================
// WEBHOOK TELEGRAM
// ============================================

export async function onRequestPost({ request, env }) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const secret = env.TELEGRAM_WEBHOOK_SECRET;

  // SPRAWDZENIE KONFIGURACJI
  if (!token || !secret) {
    return new Response(
      "Brak konfiguracji Telegrama",
      { status: 503 }
    );
  }

  // ZABEZPIECZENIE WEBHOOKA
  const receivedSecret = request.headers.get(
    "X-Telegram-Bot-Api-Secret-Token"
  );

  if (receivedSecret !== secret) {
    return new Response(
      "Unauthorized",
      { status: 401 }
    );
  }

  let update;

  try {
    update = await request.json();
  } catch {
    return new Response(
      "Invalid JSON",
      { status: 400 }
    );
  }

  const callback = update.callback_query;
  const message = update.message;

  const chat =
    callback?.message?.chat?.id ??
    message?.chat?.id;

  if (!chat) {
    return new Response("OK");
  }

  // POTWIERDZENIE KLIKNIĘCIA PRZYCISKU
  if (callback) {
    await tg(
      token,
      "answerCallbackQuery",
      {
        callback_query_id: callback.id
      }
    ).catch(() => {});
  }

  const text = String(
    message?.text || ""
  ).trim().slice(0, 200);

  const command = text
    .split(/\s+/)[0]
    .toLowerCase()
    .split("@")[0];

  const data = String(
    callback?.data || ""
  );

  try {

    // ========================================
    // START I MENU
    // ========================================

    if (
      command === "/start" ||
      command === "/pomoc" ||
      data === "home" ||
      data === "help"
    ) {
      await showMenu(token, chat);
    }

    // ========================================
    // POWIADOMIENIA
    // ========================================

    else if (
      data === "notify" ||
      data.startsWith("sub:") ||
      command === "/powiadomienia" ||
      command === "/wlacz" ||
      command === "/wylacz"
    ) {
      let action = "";

      if (command === "/wlacz") {
        action = "on";
      }

      else if (command === "/wylacz") {
        action = "off";
      }

      else if (data === "sub:on") {
        action = "on";
      }

      else if (data === "sub:off") {
        action = "off";
      }

      await notifications(
        token,
        chat,
        env,
        action
      );
    }

    // ========================================
    // SZCZEGÓŁY PRODUKTU
    // ========================================

    else if (
      command === "/produkt" ||
      data.startsWith("p:")
    ) {
      const id = data.startsWith("p:")
        ? data.slice(2)
        : text.split(/\s+/)[1];

      const products = await catalog();

      const product = products.find(
        p => String(p.id) === String(id)
      );

      if (product) {
        await photo(token, chat, product);
      } else {
        await send(
          token,
          chat,
          "Nie znaleziono produktu."
        );
      }
    }

    // ========================================
    // PRZEGLĄDANIE OFERT
    // ========================================

    else if (
      command === "/oferty" ||
      data.startsWith("list:")
    ) {
      const page = data.startsWith("list:")
        ? Number(data.slice(5)) || 0
        : 0;

      const products = await catalog();

      await list(
        token,
        chat,
        products,
        page
      );
    }

    // ========================================
    // WYSZUKIWANIE
    // ========================================

    else if (
      command === "/szukaj" ||
      (text && !text.startsWith("/"))
    ) {
      const query = command === "/szukaj"
        ? text.slice(7).trim()
        : text;

      if (!query) {
        await send(
          token,
          chat,
          "🔎 Wpisz np. /szukaj fotel"
        );
      } else {
        const products = await catalog();

        const found = products.filter(product =>
          `${product.name} ${product.description || ""}`
            .toLocaleLowerCase("pl")
            .includes(
              query.toLocaleLowerCase("pl")
            )
        );

        await list(
          token,
          chat,
          found,
          0,
          query
        );
      }
    }

    // ========================================
    // NIEZNANA KOMENDA
    // ========================================

    else {
      await send(
        token,
        chat,
        "Nie znam tej komendy.\n" +
        "Wpisz /start, aby otworzyć menu."
      );
    }

    return new Response("OK");

  } catch (error) {
    console.error(
      "MoneyBot Telegram:",
      String(error.message).slice(0, 150)
    );

    return new Response(
      "Bot error",
      { status: 502 }
    );
  }
}
