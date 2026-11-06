// Desktop replacement for src/lib/feed-server.ts.
//
// In the browser build the feed XML is fetched by a TanStack Start server
// function, so the request never hits CORS. The Electron build has no server,
// so the renderer fetches the feed itself; the main process relaxes CORS for
// the app window, which makes this behave like the server-side fetch.
const FETCH_TIMEOUT_MS = 15000;

export async function fetchFeedXml(options: { data: string }): Promise<string> {
  const target = typeof options?.data === "string" ? options.data : "";
  if (!target) throw new Error("A feed URL is required.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(target, {
      headers: { "User-Agent": "MarginaliaRSSReader/1.0" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`The feed service returned ${response.status}.`);
    const xml = await response.text();
    if (!xml.trim()) throw new Error("The feed returned an empty response.");
    return xml;
  } finally {
    clearTimeout(timer);
  }
}
