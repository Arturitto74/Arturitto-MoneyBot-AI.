const bad = (message, status = 400) =>
  new Response('MoneyBot: ' + message, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });

function validTrackingUrl(raw) {
  try {
    const u = new URL(raw);

    if (
      u.protocol !== 'https:' ||
      !['webep1.com', 'www.webep1.com'].includes(u.hostname) ||
      u.username ||
      u.password ||
      !/^\/c\/\d+\/[a-z0-9]+\/?$/i.test(u.pathname)
    ) return null;

    const r = u.searchParams.get('r');

    if (!r || !/^[a-z0-9_-]+={0,2}$/i.test(r)) {
      return null;
    }

    const padded =
      r.replace(/-/g, '+').replace(/_/g, '/') +
      '='.repeat((4 - r.length % 4) % 4);

    const dest = new URL(atob(padded));

    if (
      dest.protocol !== 'https:' ||
      !['diablochairs.com', 'www.diablochairs.com']
        .includes(dest.hostname) ||
      dest.username ||
      dest.password
    ) return null;

    return u.href;
  } catch {
    return null;
  }
}

export async function onRequestGet({ request }) {
  const incoming = new URL(request.url);

  const id = incoming.searchParams.get('id');
  const raw = incoming.searchParams.get('url');

  if (
    (!id && !raw) ||
    (id && id.length > 100) ||
    (raw && raw.length > 4096)
  ) {
    return bad('Brak poprawnego identyfikatora lub adresu.');
  }

  try {
    const feed = await fetch(
      new URL('/api/products', incoming.origin),
      { headers: { Accept: 'application/json' } }
    );

    if (!feed.ok) {
      return bad('Katalog jest niedostępny.', 503);
    }

    const data = await feed.json();

    if (!Array.isArray(data.products)) {
      return bad('Błędny katalog.', 502);
    }

    const product = id
      ? data.products.find(p => String(p.id) === id)
      : data.products.find(p => p.url === raw);

    if (!product) {
      return bad('Nie znaleziono produktu w katalogu.', 404);
    }

    const tracking = validTrackingUrl(product.url);

    if (!tracking) {
      return bad('Nieprawidłowy link partnerski produktu.', 422);
    }

    return new Response(null, {
      status: 302,
      headers: {
        Location: tracking,
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer'
      }
    });
  } catch {
    return bad('Błąd odczytu katalogu.', 502);
  }
}
