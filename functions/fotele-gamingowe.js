const SITE = "https://arturitto-moneybot-ai.pages.dev";

const esc = x => String(x ?? "").replace(
  /[&<>"']/g,
  c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c])
);

function money(value) {
  const n = Number(value);

  if (
    value == null ||
    value === "" ||
    !Number.isFinite(n) ||
    n <= 0
  ) {
    return "Sprawdź cenę";
  }

  return n.toLocaleString("pl-PL", {
    style: "currency",
    currency: "PLN"
  });
}

function safeImage(input) {
  try {
    const url = new URL(String(input));
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

export async function onRequestGet() {
  let products = [];

  try {
    const response = await fetch(`${SITE}/api/products`);

    if (!response.ok) {
      throw new Error(`API ${response.status}`);
    }

    const payload = await response.json();

    if (!Array.isArray(payload.products)) {
      throw new Error("Nieprawidłowy katalog");
    }

    products = payload.products
      .filter(p =>
        p &&
        p.id != null &&
        String(p.name || "").trim()
      )
      .slice(0, 500);

  } catch (error) {
    console.error("MoneyBot:", error.message);
  }

  const cards = products.map(product => {
    const name = String(product.name || "Produkt");
    const image = safeImage(product.image);

    const link =
      `${SITE}/produkt/` +
      encodeURIComponent(String(product.id));

    return `
      <article
        class="card"
        data-name="${esc(name.toLocaleLowerCase("pl"))}"
      >
        <a class="picture" href="${esc(link)}">
          ${
            image
              ? `<img
                   src="${esc(image)}"
                   loading="lazy"
                   alt="${esc(name)}"
                   referrerpolicy="no-referrer"
                 >`
              : "<span>🪑</span>"
          }
        </a>

        <div class="info">
          <h2>${esc(name)}</h2>
          <p class="price">${esc(money(product.price))}</p>

          <a class="button" href="${esc(link)}">
            Sprawdź ofertę →
          </a>
        </div>
      </article>
    `;
  }).join("");

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Fotele gamingowe i biurowe – MoneyBot AI",
    url: `${SITE}/fotele-gamingowe`,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: products.slice(0, 100).map(
        (product, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: String(product.name || "Produkt"),
          url:
            `${SITE}/produkt/` +
            encodeURIComponent(String(product.id))
        })
      )
    }
  };

  const html = `
<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >

  <title>
    Fotele gamingowe i biurowe | MoneyBot AI
  </title>

  <meta
    name="description"
    content="Przeglądaj fotele gamingowe i biurowe. Sprawdź zdjęcia, ceny oraz dostępne oferty."
  >

  <meta
    name="robots"
    content="index,follow"
  >

  <link
    rel="canonical"
    href="${SITE}/fotele-gamingowe"
  >

  <script type="application/ld+json">
    ${JSON.stringify(structuredData).replace(/</g, "\\u003c")}
  </script>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: #0b1020;
      color: #eef2ff;
      font: 16px system-ui, Arial, sans-serif;
    }

    header,
    main,
    footer {
      max-width: 1150px;
      margin: auto;
      padding: 24px;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 15px;
    }

    a {
      color: inherit;
      text-decoration: none;
    }

    .brand {
      font-size: 22px;
      font-weight: 800;
    }

    .brand span {
      color: #fa5757;
    }

    .pill {
      padding: 10px 16px;
      border-radius: 999px;
      background: #242e4a;
    }

    h1 {
      font-size: clamp(30px, 5vw, 54px);
      margin-bottom: 10px;
      line-height: 1.1;
    }

    .lead {
      color: #b4c2de;
      max-width: 760px;
      line-height: 1.7;
    }

    input {
      width: 100%;
      max-width: 610px;
      border: 1px solid #3a486a;
      border-radius: 14px;
      background: #161e34;
      color: white;
      font-size: 18px;
      padding: 17px;
      margin: 20px 0 30px;
    }

    .grid {
      display: grid;
      grid-template-columns:
        repeat(auto-fit, minmax(220px, 1fr));
      gap: 18px;
    }

    .card {
      background: #17213a;
      border: 1px solid #2d3d5b;
      border-radius: 16px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .card[hidden] {
      display: none;
    }

    .picture {
      height: 205px;
      background: white;
      display: grid;
      place-items: center;
    }

    .picture img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .picture span {
      font-size: 80px;
    }

    .info {
      padding: 16px;
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .info h2 {
      font-size: 16px;
      line-height: 1.35;
      margin: 0;
      min-height: 62px;
    }

    .price {
      font-size: 21px;
      font-weight: bold;
      color: #86efac;
      margin: 16px 0;
    }

    .button {
      display: block;
      text-align: center;
      margin-top: auto;
      padding: 13px;
      border-radius: 10px;
      background: #e84152;
      color: white;
      font-weight: 700;
    }

    .button:hover {
      background: #f15c69;
    }

    .muted,
    footer {
      color: #aab8d4;
      font-size: 14px;
    }

    .empty {
      padding: 24px;
      background: #17213a;
      border-radius: 12px;
    }
  </style>
</head>

<body>

  <header>
    <a class="brand" href="${SITE}">
      🤖 MoneyBot <span>AI</span>
    </a>

    <a class="pill" href="${SITE}">
      Strona główna →
    </a>
  </header>

  <main>
    <h1>Fotele gamingowe i biurowe</h1>

    <p class="lead">
      Znajdź idealny fotel gamingowy lub biurowy.
      Przeglądaj modele, zdjęcia i ceny.
      Wybierz produkt, aby sprawdzić ofertę w sklepie.
    </p>

    <label for="search">
      🔎 Wyszukaj produkt
    </label>

    <br>

    <input
      id="search"
      type="search"
      placeholder="Np. fotel Diablo, gamingowy, biurowy..."
      autocomplete="off"
    >

    <p class="muted" id="count">
      Produkty: ${products.length}
    </p>

    ${
      products.length
        ? `
          <section class="grid" id="products">
            ${cards}
          </section>

          <p class="empty" id="none" hidden>
            Nie znaleziono pasujących produktów.
          </p>
        `
        : `
          <p class="empty">
            Katalog jest chwilowo niedostępny.
            Spróbuj ponownie później.
          </p>
        `
    }
  </main>

  <footer>
    MoneyBot AI · Oferty mogą zawierać linki afiliacyjne.
    Możemy otrzymać prowizję od zakupów.
    Cena i dostępność mogą się zmienić.
  </footer>

  <script>
    const input = document.querySelector("#search");
    const cards = [...document.querySelectorAll(".card")];
    const count = document.querySelector("#count");
    const none = document.querySelector("#none");

    if (input) {
      input.addEventListener("input", () => {
        const query = input.value
          .trim()
          .toLocaleLowerCase("pl");

        let visible = 0;

        for (const card of cards) {
          const show = card.dataset.name.includes(query);
          card.hidden = !show;

          if (show) {
            visible++;
          }
        }

        count.textContent = "Znaleziono: " + visible;

        if (none) {
          none.hidden = visible !== 0;
        }
      });
    }
  </script>

</body>
</html>
`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300"
    }
  });
}
