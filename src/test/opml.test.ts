import { describe, expect, it } from "vitest";

import { parseOpmlFeeds, toOpml } from "@/lib/opml";
import { compareVersions, checkForUpdates } from "@/lib/update-check";
import type { FeedSource } from "@/lib/rss-reader";

const library: FeedSource[] = [
  {
    id: "a",
    name: "The Verge",
    category: "Technology",
    url: "https://example.com/verge",
    enabled: true,
  },
  {
    id: "b",
    name: "BBC World",
    category: "World",
    url: "https://example.com/bbc?a=1&b=2",
    enabled: true,
  },
  {
    id: "c",
    name: "Phoronix",
    category: "Technology",
    url: "https://example.com/phoronix",
    enabled: false,
  },
];

describe("OPML export", () => {
  it("writes one folder per category and keeps feed names and URLs", () => {
    const xml = toOpml(library);

    expect(xml).toContain('<outline text="Technology" title="Technology">');
    expect(xml).toContain('<outline text="World" title="World">');
    expect(xml).toContain('xmlUrl="https://example.com/bbc?a=1&amp;b=2"');
    // Both Technology feeds share one folder.
    expect(xml.match(/text="Technology"/g)).toHaveLength(1);
  });

  it("round-trips through the parser", () => {
    const entries = parseOpmlFeeds(toOpml(library));

    expect(entries).toEqual([
      { name: "The Verge", url: "https://example.com/verge", category: "Technology" },
      { name: "Phoronix", url: "https://example.com/phoronix", category: "Technology" },
      { name: "BBC World", url: "https://example.com/bbc?a=1&b=2", category: "World" },
    ]);
  });
});

describe("OPML import", () => {
  it("reads nested folders and uses the nearest folder as the category", () => {
    const xml = [
      '<?xml version="1.0"?>',
      '<opml version="2.0"><body>',
      '<outline text="News"><outline text="World">',
      '<outline type="rss" text="Reuters" xmlUrl="https://reuters.com/rss"/>',
      "</outline></outline>",
      '<outline type="rss" title="Loose feed" xmlUrl="https://example.com/loose"/>',
      "</body></opml>",
    ].join("");

    expect(parseOpmlFeeds(xml)).toEqual([
      { name: "Reuters", url: "https://reuters.com/rss", category: "World" },
      { name: "Loose feed", url: "https://example.com/loose", category: "Imported" },
    ]);
  });

  it("drops insecure and duplicate feed URLs", () => {
    const xml = [
      "<opml><body>",
      '<outline text="A" xmlUrl="http://insecure.example.com/rss"/>',
      '<outline text="B" xmlUrl="https://secure.example.com/rss"/>',
      '<outline text="C" xmlUrl="https://secure.example.com/rss/"/>',
      "</body></opml>",
    ].join("");

    expect(parseOpmlFeeds(xml)).toEqual([
      { name: "B", url: "https://secure.example.com/rss", category: "Imported" },
    ]);
  });

  it("rejects files that are not OPML", () => {
    expect(parseOpmlFeeds('{"customFeeds":[]}')).toBeNull();
    expect(parseOpmlFeeds("<html><body><p>hello</p></body></html>")).toBeNull();
  });
});

describe("update check", () => {
  it("orders versions numerically", () => {
    expect(compareVersions("1.2.0", "1.10.0")).toBe(-1);
    expect(compareVersions("v2.0.0", "1.9.9")).toBe(1);
    expect(compareVersions("1.0.0", "1.0")).toBe(0);
  });

  it("reports a newer release and its page", async () => {
    const fetcher = (async () =>
      new Response(
        JSON.stringify({
          tag_name: "v1.2.0",
          html_url: "https://github.com/kaidohex/rss-feeder/releases/tag/v1.2.0",
        }),
        { status: 200 },
      )) as typeof fetch;

    await expect(checkForUpdates("1.0.0", fetcher)).resolves.toEqual({
      status: "available",
      latest: "1.2.0",
      url: "https://github.com/kaidohex/rss-feeder/releases/tag/v1.2.0",
    });
  });

  it("reports the current version and survives a failed request", async () => {
    const fetcher = (async () =>
      new Response(JSON.stringify({ tag_name: "v1.0.0" }), { status: 200 })) as typeof fetch;
    await expect(checkForUpdates("1.0.0", fetcher)).resolves.toEqual({
      status: "current",
      latest: "1.0.0",
    });

    const failing = (async () => new Response("nope", { status: 403 })) as typeof fetch;
    await expect(checkForUpdates("1.0.0", failing)).resolves.toEqual({ status: "unknown" });
  });
});
