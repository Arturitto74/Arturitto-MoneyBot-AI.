export async function onRequestGet() {
  const xmlUrl = "https://service.weben1.com/xml/b32955e7-e3bf-49d0-b2e4-8da83e0f0e41.xml";

  try {
    const response = await fetch(xmlUrl);

    if (!response.ok) {
      return Response.json({
        status: "error",
        httpStatus: response.status
      });
    }

    const xml = await response.text();

    return Response.json({
      status: "ok",
      bytes: xml.length,
      startsWith: xml.substring(0, 300)
    });
  } catch (error) {
    return Response.json({
      status: "error",
      message: error.message
    });
  }
}
