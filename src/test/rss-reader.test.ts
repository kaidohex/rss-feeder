import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchFeedArticles,
  mergeFeeds,
  parseFeedSettings,
  type FeedSource,
} from "@/lib/rss-reader";

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
  it("surfaces the feed service message when a request is rate limited", async () => {
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

    await expect(fetchFeedArticles(defaults[0]!)).rejects.toThrow(
      "You are converting new feeds in a very short period, please use an API key.",
    );
  });
});
