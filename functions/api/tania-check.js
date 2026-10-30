export async function onRequestGet({ env }) {
  const url = env.TANIAKSIAZKA_XML_URL;

  const json = (data, status = 200) =>
    Response.json(data, {
      status,
      headers: { "Cache-Control": "no-store" }
    });

  if (!url) {
    return json({
      status: "error",
      stage: "configuration",
      message: "Brak zmiennej TANIAKSIAZKA_XML_URL"
    }, 503);
  }

  let stage = "start";

  try {
    stage = "address";

    const address = new URL(url.trim());

    if (
      address.protocol !== "https:" ||
      address.hostname !== "service.weben1.com"
    ) {
      return json({
        status: "error",
        stage,
        message: "Nieprawidłowy adres katalogu XML"
      });
    }

    stage = "fetch";

    const response = await fetch(address.toString(), {
      headers: {
        Accept: "application/xml, text/xml, */*"
      },
      signal: AbortSignal.timeout(25000)
    });

    if (!response.ok) {
      return json({
        status: "error",
        stage,
        httpStatus: response.status,
        message: "Serwer katalogu odrzucił żądanie"
      });
    }

    stage = "read";

    if (!response.body) {
      return json({
        status: "error",
        stage,
        message: "Brak danych XML w odpowiedzi"
      });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let sample = "";
    let bytesRead = 0;

    try {
      while (bytesRead < 65536) {
        const { done, value } = await reader.read();

        if (done) break;

        bytesRead += value.byteLength;
        sample += decoder.decode(value, { stream: true });
      }
    } finally {
      await reader.cancel().catch(() => {});
    }

    stage = "analysis";

    const tags = {};

    for (const match of sample.matchAll(
      /<([A-Za-z_][\w:.-]*)(?=[\s/>])/g
    )) {
      tags[match[1]] = (tags[match[1]] || 0) + 1;
    }

    return json({
      status: "ok",
      source: "TaniaKsiazka.pl",
      httpStatus: response.status,
      bytesRead,
      tags: Object.entries(tags)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25)
        .map(([name, count]) => ({ name, count }))
    });

  } catch (error) {
    return json({
      status: "error",
      stage,
      errorType: error.name || "UnknownError",
      message:
        error.name === "TimeoutError"
          ? "Przekroczono czas pobierania katalogu"
          : "Błąd połączenia lub odczytu katalogu"
    });
  }
}
