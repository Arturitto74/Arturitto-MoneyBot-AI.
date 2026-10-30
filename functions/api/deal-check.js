const SITE = "https://arturitto-moneybot-ai.pages.dev";

export async function onRequestPost({ request, env }) {
  const kv = env.MONEYBOT_SUBSCRIBERS;
  const token = env.TELEGRAM_BOT_TOKEN;
  const jobSecret = env.DEAL_JOB_SECRET;

  if (!kv || !token || !jobSecret) {
    return Response.json(
      { error: "Brak konfiguracji" },
      { status: 503 }
    );
  }

  if (
    request.headers.get("X-MoneyBot-Job-Secret") !== jobSecret
  ) {
    return Response.json(
      { error: "Brak dostępu" },
      { status: 401 }
    );
  }

  try {
    const response = await fetch(`${SITE}/api/products`);

    if (!response.ok) {
      throw new Error("Katalog niedostępny");
    }

    const data = await response.json();
    const products = data.products;

    if (!Array.isArray(products)) {
      throw new Error("Nieprawidłowy katalog");
    }

    const drops = [];

    for (const product of products) {
      const id = String(product.id ?? "");
      const current = Number(product.price);

      if (
        !/^[a-zA-Z0-9_.-]{1,100}$/.test(id) ||
        product.price == null ||
        product.price === "" ||
        !Number.isFinite(current) ||
        current <= 0
      ) {
        continue;
      }

      const key = `deal-price:13117:${id}`;
      const previousText = await kv.get(key);
      const previous = Number(previousText);

      if (
        previousText !== null &&
        previous > current
      ) {
        const saving = previous - current;
        const percent = (saving / previous) * 100;

        if (saving >= 10 && percent >= 5) {
          drops.push({
            id,
            name: String(product.name || "Produkt"),
            oldPrice: previous,
            price: current,
            percent: Math.round(percent)
          });
        }
      }

      await kv.put(key, String(current));
    }

    drops.sort((a, b) => b.percent - a.percent);

    const selected = drops.slice(0, 3);

    if (!selected.length) {
      return Response.json({
        status: "ok",
        products: products.length,
        promotions: 0,
        sent: 0
      });
    }

    let cursor;
    let sent = 0;

    do {
      const page = await kv.list({
        prefix: "subscriber:",
        limit: 1000,
        ...(cursor ? { cursor } : {})
      });

      for (const item of page.keys) {
        const chatId = item.name.replace("subscriber:", "");

        if (!/^\d+$/.test(chatId)) continue;

        for (const deal of selected) {
          const message =
            "🔥 MONEYBOT AI — OBNIŻKA CENY!\n\n" +
            `${deal.name}\n\n` +
            `💰 Poprzednio: ${deal.oldPrice.toFixed(2)} zł\n` +
            `✅ Teraz: ${deal.price.toFixed(2)} zł\n` +
            `📉 Obniżka: ${deal.percent}%\n\n` +
            "Cena porównana z poprzednim odczytem katalogu.\n" +
            "Sprawdź aktualną cenę i dostępność w sklepie.\n" +
            "Link afiliacyjny.";

          const result = await fetch(
            `https://api.telegram.org/bot${token}/sendMessage`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                chat_id: chatId,
                text: message,
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: "🛒 Zobacz ofertę",
                        url: `${SITE}/produkt/${encodeURIComponent(deal.id)}`
                      }
                    ]
                  ]
                }
              })
            }
          );

          if (result.ok) {
            sent++;
          } else {
            console.warn("Nie udało się wysłać powiadomienia");
          }
        }
      }

      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);

    return Response.json({
      status: "ok",
      products: products.length,
      promotions: drops.length,
      selected: selected.length,
      sent
    });

  } catch (error) {
    console.error("MoneyBot:", error.message);

    return Response.json(
      { error: "Błąd monitorowania cen" },
      { status: 502 }
    );
  }
}
