export async function onRequestGet({ env }) {
  const login = env.WEBEPARTNERS_API_LOGIN;
  const key = env.WEBEPARTNERS_API_KEY;

  const result = (data, status = 200) =>
    Response.json(data, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });

  if (!login || !key) {
    return result({
      status: "error",
      message: "Brak konfiguracji API"
    }, 503);
  }

  try {
    const response = await fetch(
      "https://api2.webepartners.pl/Wydawca/GetHotPrice",
      {
        headers: {
          Authorization:
            "Basic " + btoa(login + ":" + key),
          Accept: "application/json"
        }
      }
    );

    if (!response.ok) {
      return result({
        status: "api_error",
        httpStatus: response.status
      }, 502);
    }

    const data = await response.json();

    const items = Array.isArray(data)
      ? data
      : Array.isArray(data.items)
        ? data.items
        : Array.isArray(data.products)
          ? data.products
          : null;

    return result({
      status: "ok",
      responseType: Array.isArray(data)
        ? "array"
        : typeof data,
      count: items ? items.length : null,
      fields: items?.length
        ? Object.keys(items[0])
        : Object.keys(data || {}),
      message: "Analiza struktury danych promocji"
    });

  } catch {
    return result({
      status: "error",
      message: "Nie udało się odczytać danych promocji"
    }, 502);
  }
}
