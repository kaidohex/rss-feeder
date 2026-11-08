import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchFeedArticles,
  mergeFeeds,
  parseFeedXml,
  parseFeedSettings,
  parseImportedFeedSettings,
  type FeedSource,
} from "@/lib/rss-reader";
import { fetchFeedXml } from "@/lib/feed-server";

vi.mock("@/lib/feed-server", () => ({
  fetchFeedXml: vi.fn(async () =>
    [
      '<?xml version="1.0"?>',
      '<rss version="2.0"><channel><title>Example feed</title><item>',
      "<title>Story one</title>",
      "<link>https://example.com/one</link>",
      "<pubDate>2026-11-05</pubDate>",
      "<description>Hello world</description>",
      "</item></channel></rss>",
    ].join(""),
  ),
}));

const defaults: FeedSource[] = [
  { id: "world", name: "World", category: "News", url: "https://example.com/rss", enabled: true },
  {
    id: "design",
    name: "Design",
    category: "Design",
    url: "https://example.com/design",
    enabled: true,
  },
];

describe("RSS feed preferences", () => {
  it("merges edits and custom feeds while removing feeds the reader deleted", () => {
    const feeds = mergeFeeds(defaults, {
      customFeeds: [
        {
          id: "custom-1",
          name: "My feed",
          category: "Reading",
          url: "https://example.com/my-feed",
          enabled: true,
          custom: true,
        },
      ],
      overrides: { world: { name: "World briefing", enabled: false } },
      removedIds: ["design"],
    });

    expect(feeds).toEqual([
      { ...defaults[0], name: "World briefing", enabled: false, custom: false },
      {
        id: "custom-1",
        name: "My feed",
        category: "Reading",
        url: "https://example.com/my-feed",
        enabled: true,
        custom: true,
      },
    ]);
  });

  it("falls back safely when saved preferences are not valid JSON", () => {
    expect(parseFeedSettings("not-json")).toEqual({
      customFeeds: [],
      overrides: {},
      removedIds: [],
    });
  });

  it("drops removed custom feeds and ignores overrides for removed feeds", () => {
    const feeds = mergeFeeds(defaults, {
      customFeeds: [
        {
          id: "custom-2",
          name: "Gone",
          category: "Reading",
          url: "https://example.com/gone",
          enabled: true,
          custom: true,
        },
      ],
      overrides: { design: { name: "Stale override" } },
      removedIds: ["design", "custom-2"],
    });

    expect(feeds).toEqual([{ ...defaults[0], custom: false }]);
  });

  it("keeps base feed ids and marks overridden feeds as included", () => {
    const feeds = mergeFeeds(defaults, {
      customFeeds: [],
      overrides: { world: { name: "World briefing", category: "Briefings", enabled: false } },
      removedIds: [],
    });

    expect(feeds[0]).toMatchObject({
      id: "world",
      name: "World briefing",
      category: "Briefings",
      enabled: false,
      custom: false,
    });
  });

  it("reads an exported settings file and keeps only safe feed data", () => {
    const parsed = parseImportedFeedSettings(
      JSON.stringify({
        customFeeds: [
          {
            id: "custom-imported",
            name: "  Imported feed  ",
            category: "Culture",
            url: "https://example.com/imported/",
            enabled: false,
          },
          {
            id: "custom-imported",
            name: "Duplicate",
            category: "Culture",
            url: "https://example.com/imported",
            enabled: true,
          },
          {
            id: "plain-id",
            category: "",
            url: "https://example.com/no-name",
            enabled: true,
          },
          { id: "bad-url", name: "Bad", category: "Misc", url: "http://example.com/feed" },
        ],
        overrides: {
          world: { name: "World briefing", enabled: false, injected: "nope" },
        },
        removedIds: ["design", 42],
      }),
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.customFeeds).toHaveLength(2);
    expect(parsed?.customFeeds[0]).toMatchObject({
      id: "custom-imported",
      name: "Imported feed",
      category: "Culture",
      url: "https://example.com/imported/",
      enabled: false,
      custom: true,
    });
    expect(parsed?.customFeeds[1]).toMatchObject({
      name: "https://example.com/no-name",
      category: "Imported",
      enabled: true,
      custom: true,
    });
    expect(parsed?.customFeeds[1]?.id).toMatch(/^custom-import-/);
    expect(parsed?.overrides).toEqual({ world: { name: "World briefing", enabled: false } });
    expect(parsed?.removedIds).toEqual(["design"]);
  });

  it("rejects files that are not feed settings exports", () => {
    expect(parseImportedFeedSettings("not-json")).toBeNull();
    expect(parseImportedFeedSettings("[]")).toBeNull();
    expect(parseImportedFeedSettings(JSON.stringify({ hello: "world" }))).toBeNull();
  });

  it("reads valid saved preferences and ignores malformed sections", () => {
    expect(
      parseFeedSettings(
        JSON.stringify({
          customFeeds: [
            {
              id: "custom-3",
              name: "Saved",
              category: "Reading",
              url: "https://example.com/saved",
              enabled: true,
              custom: true,
            },
          ],
          overrides: { world: { enabled: false } },
          removedIds: ["design"],
        }),
      ),
    ).toEqual({
      customFeeds: [
        {
          id: "custom-3",
          name: "Saved",
          category: "Reading",
          url: "https://example.com/saved",
          enabled: true,
          custom: true,
        },
      ],
      overrides: { world: { enabled: false } },
      removedIds: ["design"],
    });

    expect(
      parseFeedSettings(JSON.stringify({ customFeeds: "nope", overrides: 7, removedIds: null })),
    ).toEqual({
      customFeeds: [],
      overrides: {},
      removedIds: [],
    });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RSS article fetching", () => {
  it("falls back to direct feed parsing when the feed service rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "error",
            message: "You are converting new feeds in a very short period, please use an API key.",
          }),
          { status: 429, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const articles = await fetchFeedArticles(defaults[0]!);
    expect(articles).toHaveLength(1);
    expect(articles[0]).toMatchObject({ title: "Story one", link: "https://example.com/one" });
  });

  it("parses rss xml into articles", () => {
    const xml = [
      '<?xml version="1.0"?>',
      '<rss version="2.0"><channel><title>Example feed</title><item>',
      "<title>Story one</title>",
      "<link>https://example.com/one</link>",
      "<pubDate>2026-11-05</pubDate>",
      "<description>Hello world</description>",
      "</item></channel></rss>",
    ].join("");

    const articles = parseFeedXml(xml, defaults[0]!);
    expect(articles).toHaveLength(1);
    expect(articles[0]).toMatchObject({
      feedId: "world",
      title: "Story one",
      description: "Hello world",
      link: "https://example.com/one",
      publishedAt: "2026-11-05",
      source: "World",
      category: "News",
    });
  });

  it("drops descriptions that are only a URL or image link", () => {
    const xml = [
      '<?xml version="1.0"?>',
      '<rss version="2.0"><channel><title>IndianExpress</title>',
      "<item><title>Photo story</title><link>https://example.com/photo</link>",
      "<description>https://images.indianexpress.com/2026/11/photo.jpg</description></item>",
      "<item><title>Linked story</title><link>https://example.com/linked</link>",
      '<description><![CDATA[<a href="https://example.com/x.jpg">https://example.com/x.jpg</a>]]></description></item>',
      "<item><title>Real story</title><link>https://example.com/real</link>",
      "<description>See https://example.com for the full report</description></item>",
      "</channel></rss>",
    ].join("");

    const articles = parseFeedXml(xml, defaults[0]!);
    expect(articles.map((article) => article.description)).toEqual([
      "",
      "",
      "See https://example.com for the full report",
    ]);
  });
});
