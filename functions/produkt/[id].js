const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[c]));

function reply(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=120',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

export async function onRequestGet({ request, params }) {
  const id = String(params.id || '');

  if (!/^[a-zA-Z0-9_.-]{1,100}$/.test(id)) {
    return reply('Nieprawidłowy identyfikator', 400);
  }

  try {
    const origin = new URL(request.url).origin;

    const res = await fetch(origin + '/api/products', {
      headers: { Accept: 'application/json' }
    });

    if (!res.ok) {
      return reply('Katalog chwilowo niedostępny', 503);
    }

    const data = await res.json();

    const item = (data.products || [])
      .find(p => String(p.id) === id);

    if (!item) {
      return reply('Nie znaleziono produktu', 404);
    }

    const name = esc(item.name);
    const description = esc(
      (item.description || '').slice(0, 450)
    );

    const title = esc(
      (item.name + ' — cena i informacje | Arturitto MoneyBot AI')
        .slice(0, 180)
    );

    const canonical = origin + '/produkt/' +
      encodeURIComponent(id);

    const price = Number(item.price);

    const priceValid =
      item.price !== '' &&
      item.price != null &&
      Number.isFinite(price) &&
      price > 0;

    const image = (() => {
      try {
        const x = new URL(item.image);
        return x.protocol === 'https:' ? x.href : '';
      } catch {
        return '';
      }
    })();

    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: item.name,
      ...(item.description
        ? { description: item.description }
        : {}),
      ...(image ? { image: [image] } : {})
    };

    const json = JSON.stringify(structuredData)
      .replace(/</g, '\\u003c');

    return reply(`
<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">

<title>${title}</title>

<meta name="description"
content="${esc(('Sprawdź produkt: ' + item.name + '. ' +
  (item.description || '')).slice(0, 155))}">

<link rel="canonical" href="${esc(canonical)}">

<meta name="robots" content="index,follow">

<script type="application/ld+json">${json}</script>

<style>
body {
  font: 17px system-ui, Arial;
  margin: 0;
  background: #0d1626;
  color: #f4f7ff;
}

header, main, footer {
  max-width: 980px;
  margin: auto;
  padding: 25px;
}

a { color: #9eeac8; }

.box {
  background: #18263e;
  border-radius: 20px;
  padding: 25px;
}

.layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

img {
  width: 100%;
  max-height: 420px;
  object-fit: contain;
  background: white;
  border-radius: 14px;
}

h1 {
  font-size: clamp(23px, 4vw, 38px);
}

p { line-height: 1.6; }

.price {
  font-size: 27px;
  color: #9eeac8;
  font-weight: bold;
}

.btn {
  background: #55cca0;
  color: #10201b;
  text-decoration: none;
  border-radius: 11px;
  padding: 13px 19px;
  display: inline-block;
  font-weight: bold;
}

@media(max-width:720px) {
  .layout { grid-template-columns: 1fr; }
}
</style>
</head>

<body>
<header>
  <a href="/">← Wszystkie produkty</a>
</header>

<main>
<article class="box">

<h1>${name}</h1>

<div class="layout">

<div>
${image
  ? `<img src="${esc(image)}" alt="${name}">`
  : ''}
</div>

<div>

${priceValid
  ? `<p class="price">Cena w katalogu:
     ${esc(price.toFixed(2))} zł</p>`
  : ''}

<p>${description || 'Szczegóły produktu sprawdź w sklepie.'}</p>

<p>
<a class="btn"
href="/api/go?id=${encodeURIComponent(id)}"
rel="sponsored nofollow">
Sprawdź ofertę w sklepie ↗
</a>
</p>

<p>
<small>
Link partnerski. Cena i dostępność mogą się zmienić.
Potwierdź je przed zakupem.
</small>
</p>

</div>
</div>
</article>
</main>

<footer>
Arturitto MoneyBot AI · Źródło:
${esc(data.source || 'katalog partnerski')}
</footer>

</body>
</html>
    `);

  } catch {
    return reply(
      'Nie można teraz wyświetlić produktu',
      503
    );
  }
}
