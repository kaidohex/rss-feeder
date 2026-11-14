import type { RssArticle } from "./rss-reader";

export const STORY_CACHE_KEY = "marginalia-story-cache";
export const SAVED_IDS_KEY = "marginalia-saved-stories";
export const FEED_HEALTH_KEY = "marginalia-feed-health";

/** Enough history for search to feel like an archive without filling localStorage. */
export const STORY_CACHE_LIMIT = 600;

export interface FeedHealthEntry {
  /** When the feed last returned stories, as a timestamp. */
  lastSuccess?: number;
  /** Why the latest attempt failed. Cleared by the next success. */
  lastError?: string;
  /** When the newest attempt finished. */
  lastChecked?: number;
}

export type FeedHealth = Record<string, FeedHealthEntry>;

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isArticle(value: unknown): value is RssArticle {
  if (!value || typeof value !== "object") return false;
  const article = value as Record<string, unknown>;
  const required = [
    "id",
    "feedId",
    "title",
    "description",
    "link",
    "publishedAt",
    "source",
    "category",
  ];
  return (
    required.every((key) => isString(article[key])) &&
    (article["image"] === undefined || isString(article["image"]))
  );
}

/** Reads the stored archive, dropping anything that no longer looks like a story. */
export function parseCachedArticles(value: string | null): RssArticle[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isArticle);
  } catch {
    return [];
  }
}

export function parseSavedIds(value: string | null): Set<string> {
  if (!value) return new Set();
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter(isString));
  } catch {
    return new Set();
  }
}

export function parseFeedHealth(value: string | null): FeedHealth {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const health: FeedHealth = {};
    for (const [id, entry] of Object.entries(parsed as Record<string, unknown>)) {
      if (!entry || typeof entry !== "object") continue;
      const candidate = entry as Record<string, unknown>;
      const clean: FeedHealthEntry = {};
      if (
        typeof candidate["lastSuccess"] === "number" &&
        Number.isFinite(candidate["lastSuccess"])
      ) {
        clean.lastSuccess = candidate["lastSuccess"];
      }
      if (
        typeof candidate["lastChecked"] === "number" &&
        Number.isFinite(candidate["lastChecked"])
      ) {
        clean.lastChecked = candidate["lastChecked"];
      }
      if (isString(candidate["lastError"]) && candidate["lastError"].trim()) {
        clean.lastError = candidate["lastError"];
      }
      if (Object.keys(clean).length) health[id] = clean;
    }
    return health;
  } catch {
    return {};
  }
}

/**
 * Keeps saved stories no matter how old they are, then the newest of the rest.
 * Saved entries come first so a long archive never silently drops them.
 */
export function trimStoryCache(
  articles: RssArticle[],
  savedIds: ReadonlySet<string>,
  limit = STORY_CACHE_LIMIT,
): RssArticle[] {
  const sorted = [...articles].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
  const saved = sorted.filter((article) => savedIds.has(article.id));
  const rest = sorted.filter((article) => !savedIds.has(article.id));
  return [...saved, ...rest.slice(0, Math.max(0, limit - saved.length))];
}

/** Replaces the stories of feeds that just loaded and keeps every other cached feed. */
export function mergeFeedArticles(
  current: RssArticle[],
  incoming: RssArticle[],
  refreshedFeedIds: ReadonlySet<string>,
): RssArticle[] {
  const byId = new Map<string, RssArticle>();
  for (const article of current) {
    if (!refreshedFeedIds.has(article.feedId)) byId.set(article.id, article);
  }
  for (const article of incoming) byId.set(article.id, article);
  return [...byId.values()];
}

/** Every word must appear somewhere in the title, excerpt, source or category. */
export function matchesStoryQuery(article: RssArticle, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return false;
  const haystack =
    `${article.title} ${article.description} ${article.source} ${article.category}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export function searchStories(articles: RssArticle[], query: string): RssArticle[] {
  if (!query.trim()) return [];
  return articles
    .filter((article) => matchesStoryQuery(article, query))
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}
