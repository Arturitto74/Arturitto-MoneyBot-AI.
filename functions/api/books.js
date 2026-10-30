export async function onRequestGet({ env }) {
  if (!env.DB) {
    return Response.json(
      { status: "error", message: "Brak bazy D1" },
      { status: 503 }
    );
  }

  try {
    const result = await env.DB.prepare(`
      SELECT
        product_id AS id,
        name,
        image,
        price,
        url,
        category
      FROM catalog_products
      WHERE shop_id = ?
      ORDER BY name COLLATE NOCASE
      LIMIT 100
    `).bind("taniaksiazka").all();

    const products = (result.results || []).map(p => ({
      id: String(p.id),
      name: p.name,
      image: p.image,
      price: Number(p.price),
      url: p.url,
      category: p.category
    }));

    return Response.json({
      status: "ok",
      shop: "TaniaKsiazka.pl",
      count: products.length,
      products
    }, {
      headers: {
        "Cache-Control": "public, max-age=300"
      }
    });

  } catch (error) {
    console.error("Books API:", error);

    return Response.json({
      status: "error",
      message: "Nie udało się pobrać książek"
    }, { status: 500 });
  }
}
