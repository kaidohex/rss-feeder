import { createServerFn } from "@tanstack/react-start";

const FETCH_TIMEOUT_MS = 15000;

export const fetchFeedXml = createServerFn({ method: "GET", strict: false }).handler(
  async ({ data }) => {
    const target = typeof data === "string" ? data : "";
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
  },
);
