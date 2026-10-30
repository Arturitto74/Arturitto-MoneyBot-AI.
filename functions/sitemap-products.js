const escapeXml = (value) =>
  String(value).replace(/[<>&"']/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    '"': "&quot;",
    "'": "&apos;"
  })[char]);

export async function onRequestGet({ request }) {
  try {
    const origin = new URL(request.url).origin;

    const response = await fetch(origin + "/api/products", {
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      throw new Error("Katalog niedostępny");
    }

    const data = await response.json();

    if (!Array.isArray(data.products)) {
      throw new Error("Nieprawidłowy katalog");
    }

    const ids = new Set();

    for (const product of data.products) {
      const id = String(product.id ?? "");

      if (/^[a-zA-Z0-9_.-]{1,100}$/.test(id)) {
        ids.add(id);
      }
    }

    const entries = [...ids].map((id) => {
      const url = origin + "/produkt/" +
        encodeURIComponent(id);

      return `  <url>
    <loc>${escapeXml(url)}</loc>
  </url>`;
    });

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...entries,
      '</urlset>'
    ].join("\n");

    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff"
      }
    });

  } catch {
    return new Response("Mapa chwilowo niedostępna", {
      status: 503
    });
  }
}
export function onRequestHead() {
  return new Response(null, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
