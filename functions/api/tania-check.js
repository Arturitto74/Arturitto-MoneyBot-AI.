export async function onRequestGet({ env }) {
  const url = env.TANIAKSIAZKA_XML_URL;

  const json = (data, status = 200) =>
    Response.json(data, {
      status,
      headers: {
        "Cache-Control": "no-store"
      }
    });

  if (!url) {
    return json({
      status: "error",
      message: "Brak TANIAKSIAZKA_XML_URL w Cloudflare"
    }, 503);
  }

  try {
    const address = new URL(url);

    if (
      address.protocol !== "https:" ||
      address.hostname !== "service.weben1.com"
    ) {
      return json({
        status: "error",
        message: "Nieprawidłowe źródło katalogu XML"
      }, 400);
    }

    const response = await fetch(url, {
      headers: {
        Accept: "application/xml, text/xml, */*"
      },
      signal: AbortSignal.timeout(20000)
    });

    if (!response.ok) {
      return json({
        status: "error",
        sourceStatus: response.status,
        message: "Nie udało się pobrać XML"
      }, 502);
    }

    if (!response.body) {
      return json({
        status: "error",
        message: "Serwer nie zwrócił danych"
      }, 502);
    }

    // Czytamy tylko początek katalogu.
    // Nie pobieramy 287 tysięcy produktów do pamięci.
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    let sample = "";
    let bytesRead = 0;
    const limit = 65536;

    try {
      while (bytesRead < limit) {
        const { value, done } = await reader.read();

        if (done) break;

        bytesRead += value.byteLength;
        sample += decoder.decode(value, {
          stream: true
        });

        if (bytesRead >= limit) break;
      }
    } finally {
      await reader.cancel().catch(() => {});
    }

    // Pokazujemy tylko nazwy znaczników XML.
    // Nie pokazujemy adresów ani prywatnych danych katalogu.
    const counts = {};

    for (const match of sample.matchAll(
      /<([A-Za-z_][\w:.-]*)(?=[\s/>])/g
    )) {
      const tag = match[1];

      counts[tag] = (counts[tag] || 0) + 1;
    }

    const tags = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([name, occurrences]) => ({
        name,
        occurrences
      }));

    return json({
      status: "ok",
      source: "TaniaKsiazka.pl",
      xmlHttpStatus: response.status,
      bytesInspected: bytesRead,
      tags,
      message: "Wstępna analiza struktury XML zakończona"
    });

  } catch (error) {
    console.error("Tania XML check:", error.name);

    return json({
      status: "error",
      message: "Nie udało się sprawdzić katalogu"
    }, 502);
  }
}
