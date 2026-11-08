import type { FeedSource } from "./rss-reader";

export interface OpmlFeed {
  name: string;
  url: string;
  category: string;
}

const FALLBACK_CATEGORY = "Imported";

function httpsUrl(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Writes the current library as OPML 2.0, the format other readers import.
 * Categories become nested outlines, so the grouping survives the trip.
 */
export function toOpml(feeds: FeedSource[], title = "Marginalia feeds"): string {
  const groups = new Map<string, FeedSource[]>();
  for (const feed of feeds) {
    const category = feed.category.trim() || FALLBACK_CATEGORY;
    const list = groups.get(category);
    if (list) list.push(feed);
    else groups.set(category, [feed]);
  }

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    "  <head>",
    `    <title>${escapeXml(title)}</title>`,
    "  </head>",
    "  <body>",
  ];
  for (const [category, list] of groups) {
    const label = escapeXml(category);
    lines.push(`    <outline text="${label}" title="${label}">`);
    for (const feed of list) {
      const name = escapeXml(feed.name);
      lines.push(
        `      <outline type="rss" text="${name}" title="${name}" xmlUrl="${escapeXml(feed.url)}" />`,
      );
    }
    lines.push("    </outline>");
  }
  lines.push("  </body>", "</opml>", "");
  return lines.join("\n");
}

/**
 * Reads an OPML document into plain feed entries. Returns null when the file is
 * not OPML at all, and silently drops outlines without a usable HTTPS feed URL.
 * Only the nearest folder becomes the category; deeper grouping is flattened.
 */
export function parseOpmlFeeds(xml: string): OpmlFeed[] | null {
  if (typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.getElementsByTagName("parsererror").length) return null;
  if (doc.documentElement.localName.toLowerCase() !== "opml") return null;
  const body = doc.getElementsByTagName("body")[0];
  if (!body) return null;

  const feeds: OpmlFeed[] = [];
  const seen = new Set<string>();

  const walk = (parent: Element, category: string) => {
    for (const outline of Array.from(parent.children)) {
      if (outline.localName !== "outline") continue;
      const label = (outline.getAttribute("text") ?? outline.getAttribute("title") ?? "").trim();
      const url = httpsUrl(outline.getAttribute("xmlUrl") ?? outline.getAttribute("xmlurl"));
      if (url) {
        const key = url.replace(/\/+$/, "").toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        feeds.push({
          name: label || url,
          url,
          category: category || FALLBACK_CATEGORY,
        });
        continue;
      }
      walk(outline, label || category);
    }
  };

  walk(body, "");
  return feeds;
}
