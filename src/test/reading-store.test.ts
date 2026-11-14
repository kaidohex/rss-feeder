import { describe, expect, it } from "vitest";

import {
  mergeFeedArticles,
  parseCachedArticles,
  parseFeedHealth,
  parseSavedIds,
  searchStories,
  trimStoryCache,
  type FeedHealth,
} from "@/lib/reading-store";
import type { RssArticle } from "@/lib/rss-reader";

const story = (id: string, feedId = "world", publishedAt = "2026-11-05"): RssArticle => ({
  id,
  feedId,
  title: `Story ${id}`,
  description: `Excerpt for ${id}`,
  link: `https://example.com/${id}`,
  publishedAt,
  source: "World",
  category: "News",
});

describe("cached article archive", () => {
  it("reads back what was stored and drops junk entries", () => {
    const stored = JSON.stringify([story("a"), { id: "b", feedId: "world" }, "not a story", null]);

    expect(parseCachedArticles(stored)).toEqual([story("a")]);
    expect(parseCachedArticles(null)).toEqual([]);
    expect(parseCachedArticles("{broken")).toEqual([]);
    expect(parseCachedArticles("[1,2,3]")).toEqual([]);
  });

  it("replaces refreshed feeds and keeps every other cached feed", () => {
    const merged = mergeFeedArticles(
      [story("old", "world"), story("design", "design")],
      [story("new", "world")],
      new Set(["world"]),
    );

    expect(merged.map((article) => article.id)).toEqual(["design", "new"]);
  });

  it("keeps saved stories and fills the rest with the newest", () => {
    const articles = [
      story("newest", "world", "2026-11-10"),
      story("mid", "world", "2026-11-07"),
      story("old", "world", "2026-11-01"),
      story("oldest", "world", "2026-10-01"),
    ];

    const trimmed = trimStoryCache(articles, new Set(["oldest"]), 3);
    expect(trimmed.map((article) => article.id)).toEqual(["oldest", "newest", "mid"]);
  });
});

describe("saved ids", () => {
  it("keeps only strings and survives broken input", () => {
    expect(parseSavedIds(JSON.stringify(["a", "b", 3, null]))).toEqual(new Set(["a", "b"]));
    expect(parseSavedIds(null)).toEqual(new Set());
    expect(parseSavedIds("oops")).toEqual(new Set());
    expect(parseSavedIds('{"a":1}')).toEqual(new Set());
  });
});

describe("feed health", () => {
  it("keeps valid entries and discards malformed ones", () => {
    const stored = JSON.stringify({
      world: { lastSuccess: 1000, lastChecked: 2000, lastError: "boom" },
      junk: "nope",
      empty: {},
    });

    expect(parseFeedHealth(stored)).toEqual({
      world: { lastSuccess: 1000, lastChecked: 2000, lastError: "boom" },
    });
    expect(parseFeedHealth(null)).toEqual<FeedHealth>({});
    expect(parseFeedHealth("[]")).toEqual({});
  });
});

describe("story search", () => {
  const archive = [
    story("quantum-physics", "science"),
    {
      ...story("gardening", "life"),
      title: "Slow gardening",
      description: "About the Guardian archive",
      source: "The Guardian",
      category: "Culture",
    },
    story("plain", "world", "2026-11-06"),
  ];

  it("requires every word to match across title, excerpt, source and category", () => {
    expect(searchStories(archive, "guardian archive").map((a) => a.id)).toEqual(["gardening"]);
    expect(searchStories(archive, "story quantum").map((a) => a.id)).toEqual(["quantum-physics"]);
  });

  it("sorts newest first and returns nothing for empty input", () => {
    expect(searchStories(archive, "").map((a) => a.id)).toEqual([]);
    expect(searchStories([], "anything")).toEqual([]);
    expect(searchStories(archive, "story").map((a) => a.id)).toEqual(["plain", "quantum-physics"]);
  });
});
