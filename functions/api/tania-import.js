const SHOP = "taniaksiazka";
const LIMIT = 100;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

function decodeXML(text) {
  return String(text || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function field(xml, name) {
  const match = xml.match(
    new RegExp(
      "<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/" +
      name + "\\s*>",
      "i"
    )
  );

  return match ? decodeXML(match[1]) : "";
}

function parsePrice(value) {
  const number = Number(
    String(value || "")
      .replace(/\s/g, "")
      .replace(",", ".")
  );

  return Number.isFinite(number) &&
    number > 0 &&
    number < 10000000
      ? Math.round(number * 100) / 100
      : null;
}

export async function onRequestPost({ request, env }) {
  const authorization = request.headers.get("Authorization");

  if (
    !env.PRICE_SYNC_TOKEN ||
    authorization !== `Bearer ${env.PRICE_SYNC_TOKEN}`
  ) {
    return json({
      status: "unauthorized"
    }, 401);
  }

  if (!env.DB || !env.TANIAKSIAZKA_XML_URL) {
    return json({
      status: "error",
      message: "Brak bazy D1 lub adresu XML"
    }, 503);
  }

  try {
    const address = new URL(env.TANIAKSIAZKA_XML_URL.trim());

    if (
      address.protocol !== "https:" ||
      address.hostname !== "service.weben1.com"
    ) {
      return json({
        status: "error",
        message: "Nieprawidłowy adres XML"
      }, 400);
    }

    const response = await fetch(address.toString(), {
      headers: {
        Accept: "application/xml, text/xml, */*"
      },
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok || !response.body) {
      return json({
        status: "error",
        sourceStatus: response.status,
        message: "Nie można pobrać katalogu"
      }, 502);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";
    let processed = 0;
    let skipped = 0;
    let bytesRead = 0;

    const products = [];
    const linkHosts = {};

    try {
      while (processed < LIMIT && bytesRead < 4000000) {
        const { value, done } = await reader.read();

        if (done) break;

        bytesRead += value.byteLength;

        buffer += decoder.decode(value, {
          stream: true
        });

        let start;

        while (
          processed < LIMIT &&
          (start = buffer.search(/<offer(?:\s[^>]*)?>/i)) !== -1
        ) {
          const endMatch = /<\/offer\s*>/i.exec(buffer.slice(start));

          if (!endMatch) {
            buffer = buffer.slice(start);
            break;
          }

          const end = start + endMatch.index +
            endMatch[0].length;

          const xml = buffer.slice(start, end);
          buffer = buffer.slice(end);

          processed++;

          const id = field(xml, "id");
          const name = field(xml, "name");
          const description = field(xml, "description");
          const image = field(xml, "image");
          const url = field(xml, "url");
          const category = field(xml, "category");
          const price = parsePrice(field(xml, "price"));

          if (
            !id ||
            !name ||
            price === null ||
            id.length > 150
          ) {
            skipped++;
            continue;
          }

          if (url) {
            try {
              const host = new URL(url).hostname.toLowerCase();
              linkHosts[host] = (linkHosts[host] || 0) + 1;
            } catch {
              linkHosts["invalid"] =
                (linkHosts["invalid"] || 0) + 1;
            }
          }

          products.push({
            id,
            name: name.slice(0, 500),
            description: description.slice(0, 1500),
            image: image.slice(0, 1500),
            price,
            url: url.slice(0, 2000),
            category: category.slice(0, 300)
          });
        }

        if (buffer.length > 1000000) {
          throw new Error("XML buffer exceeded limit");
        }
      }
    } finally {
      await reader.cancel().catch(() => {});
    }

    let saved = 0;

    for (let i = 0; i < products.length; i += 10) {
      const batch = products.slice(i, i + 10);

      const placeholders = batch.map(
        () => "(?,?,?,?,?,?,?,?)"
      ).join(",");

      const values = [];

      for (const p of batch) {
        values.push(
          SHOP,
          p.id,
          p.name,
          p.description,
          p.image,
          p.price,
          p.url,
          p.category
        );
      }

      await env.DB.prepare(`
        INSERT INTO catalog_products
          (shop_id, product_id, name, description,
           image, price, url, category)
        VALUES ${placeholders}
        ON CONFLICT(shop_id, product_id)
        DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          image = excluded.image,
          price = excluded.price,
          url = excluded.url,
          category = excluded.category,
          updated_at = CURRENT_TIMESTAMP
      `).bind(...values).run();

      saved += batch.length;
    }

    return json({
      status: "ok",
      shop: "TaniaKsiazka.pl",
      mode: "pilot",
      processed,
      saved,
      skipped,
      bytesRead,
      linkHosts,
      message: "Import testowy zakończony"
    });

  } catch (error) {
    console.error("Tania import:", error);

    return json({
      status: "error",
      message: "Import nie powiódł się"
    }, 502);
  }
}
