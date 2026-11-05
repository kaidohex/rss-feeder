import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchFeedArticles,
  mergeFeeds,
  parseFeedXml,
  parseFeedSettings,
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
});
