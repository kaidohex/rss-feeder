export interface FeedSource {
  id: string;
  name: string;
  category: string;
  url: string;
  enabled: boolean;
  custom?: boolean;
}

export interface SavedFeedSettings {
  customFeeds: FeedSource[];
  overrides: Record<string, Partial<FeedSource>>;
  removedIds: string[];
}

export interface RssArticle {
  id: string;
  feedId: string;
  title: string;
  description: string;
  link: string;
  publishedAt: string;
  source: string;
  category: string;
  image?: string;
}

export const EMPTY_FEED_SETTINGS: SavedFeedSettings = {
  customFeeds: [],
  overrides: {},
  removedIds: [],
};

export function mergeFeeds(baseFeeds: FeedSource[], saved: SavedFeedSettings): FeedSource[] {
  const removedIds = new Set(saved.removedIds);
  const base = baseFeeds
    .filter((feed) => !removedIds.has(feed.id))
    .map((feed) => ({ ...feed, ...saved.overrides[feed.id], custom: false }));
  const custom = saved.customFeeds.filter((feed) => !removedIds.has(feed.id));
  return [...base, ...custom];
}

export function parseFeedSettings(value: string | null): SavedFeedSettings {
  if (!value) return EMPTY_FEED_SETTINGS;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return EMPTY_FEED_SETTINGS;
    const settings = parsed as Partial<SavedFeedSettings>;
    return {
      customFeeds: Array.isArray(settings.customFeeds) ? settings.customFeeds : [],
      overrides:
        settings.overrides && typeof settings.overrides === "object" ? settings.overrides : {},
      removedIds: Array.isArray(settings.removedIds) ? settings.removedIds : [],
    };
  } catch {
    return EMPTY_FEED_SETTINGS;
  }
}

function plainText(html: string): string {
  if (typeof DOMParser === "undefined") return html.replace(/<[^>]*>/g, " ").trim();
  return new DOMParser().parseFromString(html, "text/html").body.textContent?.trim() ?? "";
}

function safeImageUrl(value: unknown): string | undefined {
  return safeUrl(value, ["https:"]);
}

function safeLinkUrl(value: unknown): string | undefined {
  return safeUrl(value, ["http:", "https:"]);
}

function safeUrl(value: unknown, protocols: string[]): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

interface Rss2JsonItem {
  guid?: unknown;
  link?: unknown;
  title?: unknown;
  pubDate?: unknown;
  description?: unknown;
  content?: unknown;
  thumbnail?: unknown;
  enclosure?: { link?: unknown } | null;
}

export async function fetchFeedArticles(feed: FeedSource): Promise<RssArticle[]> {
  const endpoint = new URL("https://api.rss2json.com/v1/api.json");
  endpoint.searchParams.set("rss_url", feed.url);
  const response = await fetch(endpoint.toString());
  if (!response.ok) {
    let message = `The feed service returned ${response.status}.`;
    try {
      const body: unknown = await response.json();
      if (
        body &&
        typeof body === "object" &&
        typeof (body as { message?: unknown }).message === "string"
      ) {
        message = (body as { message: string }).message;
      }
    } catch {
      // Keep the status-based message when the error body is not JSON.
    }
    throw new Error(message);
  }

  const data: unknown = await response.json();
  if (!data || typeof data !== "object")
    throw new Error("The feed returned an unreadable response.");
  const result = data as {
    status?: string;
    message?: string;
    items?: Rss2JsonItem[];
  };
  if (result.status !== "ok") throw new Error(result.message || "This feed could not be loaded.");

  return (result.items ?? []).slice(0, 12).map((item, index) => {
    const date = typeof item.pubDate === "string" ? item.pubDate : "";
    const description =
      typeof item.description === "string"
        ? item.description
        : typeof item.content === "string"
          ? item.content
          : "";
    const image = safeImageUrl(item.thumbnail) ?? safeImageUrl(item.enclosure?.link);
    return {
      id: `${feed.id}:${String(item.guid || item.link || index)}`,
      feedId: feed.id,
      title: plainText(typeof item.title === "string" ? item.title : "Untitled story"),
      description: plainText(description),
      link: safeLinkUrl(item.link) ?? feed.url,
      publishedAt: date,
      source: feed.name,
      category: feed.category,
      ...(image ? { image } : {}),
    };
  });
}
