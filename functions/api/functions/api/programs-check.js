export async function onRequestGet({ env }) {
  const login = env.WEBEPARTNERS_API_LOGIN;
  const key = env.WEBEPARTNERS_API_KEY;

  const json = (data, status = 200) =>
    Response.json(data, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });

  if (!login || !key) {
    return json({
      status: "error",
      message: "Brak konfiguracji API"
    }, 503);
  }

  const headers = {
    Authorization: "Basic " + btoa(`${login}:${key}`),
    Accept: "application/json"
  };

  async function fetchApi(method) {
    const response = await fetch(
      `https://api2.webepartners.pl/Wydawca/${method}`,
      { headers, cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error(`${method}: HTTP ${response.status}`);
    }

    return response.json();
  }

  try {
    const [programs, feeds] = await Promise.all([
      fetchApi("GetPrograms"),
      fetchApi("GetFeeds")
    ]);

    if (!Array.isArray(programs) || !Array.isArray(feeds)) {
      return json({
        status: "error",
        message: "Nieoczekiwany format API"
      }, 502);
    }

    const withXml = programs.filter(p => p.isXml === true);
    const withFeedUrl = programs.filter(
      p => typeof p.feedUrl === "string" &&
           p.feedUrl.trim().length > 0
    );

    const withDeeplink = programs.filter(
      p => p.isDeeplink === true
    );

    const withRelation = programs.filter(
      p => p.relationId !== null &&
           p.relationId !== undefined &&
           p.relationId !== 0 &&
           p.relationId !== "0" &&
           p.relationId !== ""
    );

    const feedIds = new Set(
      feeds.map(f => String(f.programId))
    );

    const candidates = programs
      .filter(p =>
        p.isXml === true ||
        (typeof p.feedUrl === "string" && p.feedUrl.trim())
      )
      .slice(0, 30)
      .map(p => ({
        programId: p.programId,
        programName: p.programName,
        isXml: p.isXml === true,
        hasFeedUrl: Boolean(
          typeof p.feedUrl === "string" && p.feedUrl.trim()
        ),
        isDeeplink: p.isDeeplink === true,
        hasRelationId: p.relationId != null &&
                       p.relationId !== 0 &&
                       p.relationId !== "0" &&
                       p.relationId !== "",
        hasExistingFeed: feedIds.has(String(p.programId))
      }));

    return json({
      status: "ok",
      totalPrograms: programs.length,
      xmlSupported: withXml.length,
      programsWithFeedUrl: withFeedUrl.length,
      deeplinkSupported: withDeeplink.length,
      programsWithRelationId: withRelation.length,
      existingFeeds: feeds.length,
      candidatesShown: candidates.length,
      candidates,
      note: "Relacja nie jest jeszcze potwierdzeniem akceptacji. Prywatne adresy XML nie sa ujawniane."
    });

  } catch {
    return json({
      status: "error",
      message: "Nie udalo sie pobrac danych API"
    }, 502);
  }
}
