const SHOP = "diablo-chairs";

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
  if (value === null || value === undefined) return null;

  const amount = Number(
    String(value)
      .replace(/\s/g, "")
      .replace(",", ".")
  );

  return Number.isFinite(amount) &&
         amount > 0 &&
         amount < 10000000
    ? Math.round(amount * 100) / 100
    : null;
}

export async function onRequestPost({ request, env }) {
  // Dostęp wyłącznie z prawidłowym tokenem.
  const authorization = request.headers.get("Authorization");

  if (
    !env.PRICE_SYNC_TOKEN ||
    authorization !== `Bearer ${env.PRICE_SYNC_TOKEN}`
  ) {
    return json({
      status: "unauthorized",
      message: "Brak autoryzacji"
    }, 401);
  }

  if (!env.DB) {
    return json({
      status: "error",
      message: "Brak połączenia z bazą D1"
    }, 503);
  }

  try {
    // Pobieramy aktualny katalog MoneyBota.
    const response = await fetch(
      "https://arturitto-moneybot-ai.pages.dev/api/products",
      {
        headers: {
          Accept: "application/json"
        }
      }
    );

    if (!response.ok) {
      throw new Error("Nie można pobrać katalogu");
    }

    const data = await response.json();

    if (!Array.isArray(data.products)) {
      throw new Error("Nieprawidłowy katalog produktów");
    }

    // Odczytujemy zapamiętane ceny.
    const previous = await env.DB.prepare(`
      SELECT product_id, price
      FROM product_prices
      WHERE shop_id = ?
    `).bind(SHOP).all();

    const oldPrices = new Map(
      previous.results.map(row => [
        String(row.product_id),
        Number(row.price)
      ])
    );

    const statements = [];

    let added = 0;
    let changed = 0;
    let unchanged = 0;
    let skipped = 0;

    const seen = new Set();

    for (const product of data.products) {
      const id = String(product.id ?? "");
      const price = parsePrice(product.price);

      if (!/^[a-zA-Z0-9_.-]{1,100}$/.test(id) ||
          price === null ||
          seen.has(id)) {
        skipped++;
        continue;
      }

      seen.add(id);

      const name = String(product.name || "").slice(0, 500);
      const oldPrice = oldPrices.get(id);

      if (oldPrice !== undefined &&
          Math.round(oldPrice * 100) ===
          Math.round(price * 100)) {
        unchanged++;
        continue;
      }

      if (oldPrice === undefined) {
        added++;
      } else {
        changed++;
      }

      // Zapis nowej ceny do historii.
      statements.push(
        env.DB.prepare(`
          INSERT INTO price_history
          (product_id, shop_id, price)
          VALUES (?, ?, ?)
        `).bind(id, SHOP, price)
      );

      // Aktualizacja ostatniej znanej ceny.
      statements.push(
        env.DB.prepare(`
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

    // Zapisujemy dane partiami.
    for (let i = 0; i < statements.length; i += 40) {
      await env.DB.batch(statements.slice(i, i + 40));
    }

    return json({
      status: "ok",
      source: "Diablo Chairs",
      totalProducts: data.products.length,
      added,
      changed,
      unchanged,
      skipped,
      message: "Synchronizacja cen zakończona"
    });

  } catch (error) {
    console.error("Price sync failed:", error);

    return json({
      status: "error",
      message: "Synchronizacja nie powiodła się"
    }, 502);
  }
}
