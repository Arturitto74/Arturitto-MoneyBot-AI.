const SITE = "https://arturitto-moneybot-ai.pages.dev";
const LIMIT = 5;

async function tg(token, method, data) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const j = await r.json();
  if (!r.ok || !j.ok) throw Error(j.description || "Telegram API error");
  return j;
}

const send = (token, chat, text, keyboard) =>
  tg(token, "sendMessage", {
    chat_id: chat,
    text,
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {})
  });

const productUrl = id =>
  `${SITE}/produkt/${encodeURIComponent(id)}`;

const menu = [
  [
    { text: "🛒 Oferty", callback_data: "list:0" },
    { text: "🔎 Wyszukiwanie", callback_data: "help" }
  ],
  [
    { text: "🔔 Powiadomienia", callback_data: "notify" },
    { text: "🌐 MoneyBot", url: SITE }
  ]
];

async function catalog() {
  const r = await fetch(`${SITE}/api/products`);
  if (!r.ok) throw Error("Katalog niedostępny");
  const j = await r.json();
  if (!Array.isArray(j.products)) throw Error("Błędny katalog");
  return j.products;
}

function price(p) {
  const n = Number(p.price);
  return p.price != null && p.price !== "" &&
    Number.isFinite(n) && n > 0
      ? n.toLocaleString("pl-PL", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }) + " zł"
      : "Sprawdź w sklepie";
}

async function list(token, chat, items, page = 0, query = "") {
  const pages = Math.max(1, Math.ceil(items.length / LIMIT));
  page = Math.min(Math.max(page, 0), pages - 1);
  const selected = items.slice(page * LIMIT, (page + 1) * LIMIT);

  let text = `🛒 MONEYBOT AI\n`;
  text += `Znaleziono: ${items.length} · Strona ${page + 1}/${pages}\n\n`;

  for (const p of selected) {
    text += `🪑 ${p.name}\n`;
    text += `💰 ${price(p)}\n\n`;
  }

  if (!selected.length) text += "Brak produktów.\n";

  text += "Linki mogą mieć charakter afiliacyjny.";

  const buttons = selected.map(p => [
    {
      text: "📷 " + String(p.name).slice(0, 25),
      callback_data: "p:" + String(p.id).slice(0, 40)
    },
    {
      text: "🔗 Oferta",
      url: productUrl(p.id)
    }
  ]);

  if (!query) {
    const nav = [];
    if (page > 0)
      nav.push({ text: "⬅️", callback_data: `list:${page - 1}` });
    if (page + 1 < pages)
      nav.push({ text: "➡️", callback_data: `list:${page + 1}` });
    if (nav.length) buttons.push(nav);
  }

  buttons.push([{ text: "🏠 Menu", callback_data: "home" }]);

  await send(token, chat, text, buttons);
}

async function photo(token, chat, p) {
  const caption =
    `🛒 ${p.name}\n\n` +
    `💰 ${price(p)}\n\n` +
    `${String(p.description || "").slice(0, 450)}\n\n` +
    `Link afiliacyjny. Cena i dostępność mogą się zmienić.`;

  const buttons = [
    [{ text: "🛍️ Zobacz ofertę", url: productUrl(p.id) }],
    [{ text: "⬅️ Więcej ofert", callback_data: "list:0" }]
  ];

  try {
    const u = new URL(p.image);
    if (u.protocol !== "https:") throw Error("Invalid image");

    await tg(token, "sendPhoto", {
      chat_id: chat,
      photo: u.href,
      caption: caption.slice(0, 1000),
      reply_markup: { inline_keyboard: buttons }
    });
  } catch {
    await send(token, chat, caption, buttons);
  }
}

async function notifications(token, chat, env, action) {
  const kv = env.MONEYBOT_SUBSCRIBERS;

  if (!kv) {
    return send(
      token,
      chat,
      "🔔 Powiadomienia nie są jeszcze skonfigurowane.\n" +
      "Najpierw podłączymy bazę subskrybentów w Cloudflare.",
      menu
    );
  }

  const key = `subscriber:${chat}`;

  if (action === "on")
    await kv.put(key, new Date().toISOString());

  if (action === "off")
    await kv.delete(key);

  const active = Boolean(await kv.get(key));

  await send(
    token,
    chat,
    `🔔 Powiadomienia: ${active ? "WŁĄCZONE" : "WYŁĄCZONE"}\n` +
    "Automatyczna wysyłka ofert zostanie uruchomiona osobno.",
    [
      [
        { text: "✅ Włącz", callback_data: "sub:on" },
        { text: "❌ Wyłącz", callback_data: "sub:off" }
      ],
      [{ text: "🏠 Menu", callback_data: "home" }]
    ]
  );
}

export async function onRequestPost({ request, env }) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const secret = env.TELEGRAM_WEBHOOK_SECRET;

  if (!token || !secret)
    return new Response("Brak konfiguracji", { status: 503 });

  if (
    request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== secret
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  let update;
  try {
    update = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const callback = update.callback_query;
  const message = update.message;
  const chat = callback?.message?.chat?.id ?? message?.chat?.id;

  if (!chat) return new Response("OK");

  if (callback) {
    await tg(token, "answerCallbackQuery", {
      callback_query_id: callback.id
    }).catch(() => {});
  }

  const text = String(message?.text || "").trim().slice(0, 200);
  const command = text.split(/\s+/)[0].toLowerCase().split("@")[0];
  const data = String(callback?.data || "");

  try {
    if (
      command === "/start" ||
      command === "/pomoc" ||
      data === "home" ||
      data === "help"
    ) {
      await send(
        token,
        chat,
        "🤖 ARTURITTO MONEYBOT AI\n\n" +
        "🛒 /oferty — przeglądaj produkty\n" +
        "🔎 /szukaj fotel — wyszukaj produkty\n" +
        "📷 /produkt 1051 — zdjęcie i szczegóły\n" +
        "🔔 /powiadomienia — ustaw powiadomienia\n\n" +
        "Możesz też wpisać samą nazwę produktu.\n\n" +
        "Oferty zawierają linki afiliacyjne.",
        menu
      );

    } else if (
      data === "notify" ||
      data.startsWith("sub:") ||
      command === "/powiadomienia"
    ) {
      await notifications(token, chat, env, data.slice(4));

    } else if (
      command === "/produkt" ||
      data.startsWith("p:")
    ) {
      const id = data.startsWith("p:")
        ? data.slice(2)
        : text.split(/\s+/)[1];

      const p = (await catalog()).find(
        x => String(x.id) === String(id)
      );

      if (p) await photo(token, chat, p);
      else await send(token, chat, "Nie znaleziono produktu.");

    } else if (
      command === "/oferty" ||
      data.startsWith("list:")
    ) {
      const page = Number(data.split(":")[1]) || 0;
      await list(token, chat, await catalog(), page);

    } else if (
      command === "/szukaj" ||
      (text && !text.startsWith("/"))
    ) {
      const query = command === "/szukaj"
        ? text.slice(7).trim()
        : text;

      if (!query) {
        await send(token, chat, "Wpisz np. /szukaj fotel");
      } else {
        const items = (await catalog()).filter(p =>
          `${p.name} ${p.description || ""}`
            .toLocaleLowerCase("pl")
            .includes(query.toLocaleLowerCase("pl"))
        );

        await list(token, chat, items, 0, query);
      }

    } else {
      await send(token, chat, "Wpisz /start, aby otworzyć menu.");
    }

    return new Response("OK");

  } catch (error) {
    console.error("MoneyBot Telegram:", String(error.message).slice(0, 150));
    return new Response("Bot error", { status: 502 });
  }
}
