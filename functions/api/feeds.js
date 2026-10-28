export async function onRequestGet({ env }) {
  const login = env.WEBEPARTNERS_API_LOGIN;
  const key = env.WEBEPARTNERS_API_KEY;

  if (!login || !key) {
    return Response.json({
      error: "Brak konfiguracji API WebePartners"
    }, { status: 503 });
  }

  try {
    const authorization = btoa(`${login}:${key}`);

    const response = await fetch(
      "https://api2.webepartners.pl/Wydawca/GetFeeds",
      {
        headers: {
          Authorization: `Basic ${authorization}`,
          Accept: "application/json"
        },
        cache: "no-store"
      }
    );

    if (!response.ok) {
      return Response.json({
        error: "Błąd WebePartners API",
        status: response.status
      }, { status: 502 });
    }

    const feeds = await response.json();

    if (!Array.isArray(feeds)) {
      throw new Error("Nieoczekiwany format odpowiedzi");
    }

    // Nie ujawniamy publicznie adresów katalogów XML.
    return Response.json({
      status: "ok",
      count: feeds.length,
      programs: feeds.map(feed => ({
        programId: feed.programId,
        programName: feed.programName,
        feedName: feed.feedName,
        updateDate: feed.updateDate
      }))
    }, {
      headers: { "Cache-Control": "no-store" }
    });

  } catch {
    return Response.json({
      error: "Nie udało się odczytać katalogów"
    }, { status: 502 });
  }
}
