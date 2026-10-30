const escapeXml = value => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

export async function onRequestGet({ request }) {
  const origin = new URL(request.url).origin;

  try {
    const response = await fetch(`${origin}/api/products`);

    if (!response.ok) {
      return new Response("Katalog niedostępny", { status: 503 });
    }

    const data = await response.json();

    if (!Array.isArray(data.products)) {
      return new Response("Nieprawidłowy katalog", { status: 502 });
    }

    const products = data.products
      .filter(p => p.id != null && p.name)
      .slice(0, 30);

    const items = products.map(product => {
      const productUrl =
        `${origin}/produkt/${encodeURIComponent(product.id)}`;

      const description = [
        product.description || "",
        product.price != null ? `Cena: ${product.price}` : ""
      ].filter(Boolean).join(" | ");

      return `
        <item>
          <title>${escapeXml(product.name)}</title>
          <link>${escapeXml(productUrl)}</link>
          <guid isPermaLink="true">${escapeXml(productUrl)}</guid>
          <description>${escapeXml(description)}</description>
        </item>`;
    }).join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>Arturitto MoneyBot AI - Oferty</title>
          <link>${escapeXml(origin)}</link>
          <description>Aktualny katalog ofert MoneyBot AI</description>
          <language>pl-PL</language>
          ${items}
        </channel>
      </rss>`;

    return new Response(xml, {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600"
      }
    });
  } catch {
    return new Response("Błąd generowania RSS", { status: 502 });
  }
}
