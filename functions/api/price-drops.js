const SHOP = "diablo-chairs";

export async function onRequestGet({ env }) {
  if (!env.DB) {
    return Response.json(
      { status: "error", message: "Brak połączenia z bazą D1" },
      { status: 503 }
    );
  }

  try {
    const query = `
      WITH ranked AS (
        SELECT
          product_id,
          shop_id,
          price,
          recorded_at,
          ROW_NUMBER() OVER (
            PARTITION BY shop_id, product_id
            ORDER BY id DESC
          ) AS rn
        FROM price_history
        WHERE shop_id = ?
      )
      SELECT
        p.product_id AS id,
        p.product_name AS name,
        p.price AS currentPrice,
        previous.price AS previousPrice,
        p.checked_at AS checkedAt
      FROM product_prices p
      JOIN ranked latest
        ON latest.product_id = p.product_id
        AND latest.shop_id = p.shop_id
        AND latest.rn = 1
      JOIN ranked previous
        ON previous.product_id = p.product_id
        AND previous.shop_id = p.shop_id
        AND previous.rn = 2
      WHERE p.shop_id = ?
        AND p.price = latest.price
        AND p.price < previous.price
      ORDER BY
        (previous.price - p.price) / previous.price DESC
      LIMIT 100
    `;

    const result = await env.DB.prepare(query)
      .bind(SHOP, SHOP)
      .all();

    const promotions = result.results.map((row) => {
      const oldPrice = Number(row.previousPrice);
      const newPrice = Number(row.currentPrice);

      const discountPercent = Math.round(
        ((oldPrice - newPrice) / oldPrice) * 100
      );

      return {
        id: String(row.id),
        name: row.name,
        oldPrice,
        newPrice,
        discountPercent,
        saving: Math.round((oldPrice - newPrice) * 100) / 100,
        url: `/produkt/${encodeURIComponent(row.id)}`,
        checkedAt: row.checkedAt
      };
    });

    return Response.json(
      {
        status: "ok",
        source: "Diablo Chairs",
        count: promotions.length,
        promotions
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );

  } catch (error) {
    console.error("Price drops error:", error);

    return Response.json(
      {
        status: "error",
        message: "Nie udało się sprawdzić obniżek"
      },
      { status: 500 }
    );
  }
}
