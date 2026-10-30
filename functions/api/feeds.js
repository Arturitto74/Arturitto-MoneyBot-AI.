export async function onRequestGet({ env }) {
  const login = String(env.WEBEPARTNERS_API_LOGIN || "").trim();
  const key = String(env.WEBEPARTNERS_API_KEY || "").trim();

  if (!login || !key) {
    return Response.json({
      status: "configuration_error",
      loginConfigured: Boolean(login),
      keyConfigured: Boolean(key),
      message: "Brakuje loginu lub klucza API w Cloudflare"
    });
  }

  try {
    const auth = btoa(
      Array.from(
        new TextEncoder().encode(login + ":" + key),
        byte => String.fromCharCode(byte)
      ).join("")
    );

    const endpoints = {
      feeds: "https://api2.webepartners.pl/Wydawca/GetFeeds",
      programs: "https://api2.webepartners.pl/Wydawca/GetPrograms"
    };

    const results = {};

    for (const [name, url] of Object.entries(endpoints)) {
      const response = await fetch(url, {
        headers: {
          Authorization: "Basic " + auth,
          Accept: "application/json"
        },
        cache: "no-store"
      });

      results[name] = {
        httpStatus: response.status,
        success: response.ok
      };

      if (response.ok) {
        const data = await response.json();

        results[name].count =
          Array.isArray(data) ? data.length : null;

        if (name === "feeds" && Array.isArray(data)) {
          results[name].catalogs = data.map(item => ({
            programId: item.programId,
            programName: item.programName,
            feedName: item.feedName
          }));
        }
      }
    }

    return Response.json({
      status:
        results.feeds.success && results.programs.success
          ? "ok"
          : "api_error",
      credentialsPresent: true,
      results
    }, {
      headers: {
        "Cache-Control": "no-store"
      }
    });

  } catch (error) {
    console.error("WebePartners diagnostic failed:", error);

    return Response.json({
      status: "connection_error",
      message: "Nie udało się połączyć z API"
    }, { status: 502 });
  }
}
