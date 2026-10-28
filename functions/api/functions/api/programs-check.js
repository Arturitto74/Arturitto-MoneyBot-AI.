export async function onRequestGet({ env }) {
  const login = env.WEBEPARTNERS_API_LOGIN;
  const key = env.WEBEPARTNERS_API_KEY;

  if (!login || !key) {
    return Response.json(
      { error: "Brak konfiguracji API WebePartners" },
      { status: 503 }
    );
  }

  const headers = {
    Authorization: "Basic " + btoa(`${login}:${key}`),
    Accept: "application/json"
  };

  async function getData(endpoint) {
    const response = await fetch(
      `https://api2.webepartners.pl/Wydawca/${endpoint}`,
      { headers }
    );

    if (!response.ok) {
      throw new Error(`${endpoint}: HTTP ${response.status}`);
    }

    return response.json();
  }

  try {
    const [programs, feeds] = await Promise.all([
      getData("GetPrograms"),
      getData("GetFeeds")
    ]);

    if (!Array.isArray(programs) || !Array.isArray(feeds)) {
      return Response.json({
        status: "unexpected_format",
        programsIsArray: Array.isArray(programs),
        feedsIsArray: Array.isArray(feeds),
        programFields: Array.isArray(programs)
          ? Object.keys(programs[0] || {})
          : Object.keys(programs || {})
      });
    }

    const programMap = new Map();

    for (const program of programs) {
      const id = program.programId ?? program.id;

      if (id !== undefined && id !== null) {
        programMap.set(String(id), program);
      }
    }

    const availableFeeds = feeds.map(feed => {
      const program = programMap.get(String(feed.programId));

      return {
        programId: feed.programId,
        programName: feed.programName,
        feedName: feed.feedName,
        updateDate: feed.updateDate,
        listedInPrograms: Boolean(program)
      };
    });

    return Response.json({
      status: "ok",
      programsCount: programs.length,
      feedsCount: feeds.length,
      feeds: availableFeeds,
      programFields: Object.keys(programs[0] || {}),
      message: "Dane diagnostyczne. Statusy akceptacji wymagają weryfikacji."
    }, {
      headers: {
        "Cache-Control": "no-store"
      }
    });

  } catch (error) {
    return Response.json({
      status: "error",
      message: error.message
    }, { status: 502 });
  }
}
