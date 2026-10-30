async function sendMessage(token, chatId, message) {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        disable_web_page_preview: true
      })
    }
  );

  if (!response.ok) {
    throw new Error("Telegram sendMessage failed");
  }
}

export async function onRequestPost({ request, env }) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const secret = env.TELEGRAM_WEBHOOK_SECRET;

  if (!token || !secret) {
    return new Response("Brak konfiguracji", { status: 503 });
  }

  const received = request.headers.get(
    "X-Telegram-Bot-Api-Secret-Token"
  );

  if (received !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  let update;

  try {
    update = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const chatId = update.message?.chat?.id;
  const message = String(update.message?.text || "").trim();

  if (!chatId || !message) {
    return new Response("OK");
  }

  const command = message.split(/\s+/)[0]
    .toLowerCase()
    .split("@")[0];

  let answer = "";

  if (command === "/start") {
    answer =
      "🤖 Witaj w Arturitto MoneyBot AI!\n\n" +
      "Pomagam wyszukiwać produkty z katalogów partnerskich.\n\n" +
      "🔎 /szukaj fotel — znajdź produkt\n" +
      "🛒 /oferty — pokaż dostępne oferty\n\n" +
      "🌐 https://arturitto-moneybot-ai.pages.dev\n\n" +
      "Niektóre linki są afiliacyjne.";

  } else if (
    command === "/szukaj" ||
    command === "/oferty"
  ) {
    const query = command === "/szukaj"
      ? message.substring(message.indexOf(" ") + 1)
          .trim()
          .toLocaleLowerCase("pl")
      : "";

    if (command === "/szukaj" &&
        (!message.includes(" ") || !query)) {
      answer = "Wpisz np. /szukaj fotel";
    } else {
      try {
        const response = await fetch(
          "https://arturitto-moneybot-ai.pages.dev/api/products"
        );

        if (!response.ok) {
          throw new Error("Catalog unavailable");
        }

        const data = await response.json();
        const products = Array.isArray(data.products)
          ? data.products
          : [];

        const found = products.filter(product =>
          String(product.name || "")
            .toLocaleLowerCase("pl")
            .includes(query)
        ).slice(0, 5);

        if (found.length === 0) {
          answer = "Nie znaleziono produktów.";
        } else {
          answer = "🛒 Oferty MoneyBot AI:\n\n";

          for (const product of found) {
            answer +=
              `${product.name}\n` +
              `https://arturitto-moneybot-ai.pages.dev/produkt/` +
              `${encodeURIComponent(product.id)}\n\n`;
          }

          answer +=
            "Ceny i dostępność sprawdź w sklepie.";
        }
      } catch {
        answer = "Katalog jest chwilowo niedostępny.";
      }
    }

  } else {
    answer =
      "Nie znam tej komendy.\n" +
      "Wpisz /start, /oferty lub /szukaj fotel.";
  }

  try {
    await sendMessage(token, chatId, answer);
    return new Response("OK");
  } catch {
    return new Response("Telegram error", { status: 502 });
  }
}
