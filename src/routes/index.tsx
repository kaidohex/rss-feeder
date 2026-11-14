import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronDown,
  Clock3,
  Download,
  ExternalLink,
  Link2,
  LoaderCircle,
  Moon,
  Plus,
  RefreshCw,
  Rss,
  Search,
  Settings2,
  Sun,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  EMPTY_FEED_SETTINGS,
  fetchFeedArticles,
  mergeFeeds,
  parseFeedSettings,
  parseImportedFeedSettings,
  type FeedSource,
  type RssArticle,
  type SavedFeedSettings,
} from "@/lib/rss-reader";
import { fetchFeedXml } from "@/lib/feed-server";
import { parseOpmlFeeds, toOpml, type OpmlFeed } from "@/lib/opml";
import { checkForUpdates, type UpdateResult } from "@/lib/update-check";
import {
  FEED_HEALTH_KEY,
  SAVED_IDS_KEY,
  STORY_CACHE_KEY,
  mergeFeedArticles,
  parseCachedArticles,
  parseFeedHealth,
  parseSavedIds,
  searchStories,
  trimStoryCache,
  type FeedHealth,
} from "@/lib/reading-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Marginalia — Your daily reading desk" },
      {
        name: "description",
        content: "A calm, personal reading desk for stories from the feeds you follow.",
      },
      { property: "og:title", content: "Marginalia — Your daily reading desk" },
      {
        property: "og:description",
        content: "A calm, personal reading desk for stories from the feeds you follow.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Reader,
});

type FeedStatus = Record<string, "loading" | "error">;
const SETTINGS_KEY = "marginalia-feed-settings";
const THEME_KEY = "marginalia-theme";
const AUTO_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
/** Internal name for the saved-stories view; never collides with a category. */
const SAVED_VIEW = "__saved__";

function lastSuccessLabel(timestamp?: number): string {
  return timestamp
    ? formatDistanceToNow(new Date(timestamp), { addSuffix: true })
    : "never fetched";
}

function Reader() {
  const [baseFeeds, setBaseFeeds] = useState<FeedSource[]>([]);
  const [settings, setSettings] = useState<SavedFeedSettings>(EMPTY_FEED_SETTINGS);
  const [articles, setArticles] = useState<RssArticle[]>([]);
  const [feedStatus, setFeedStatus] = useState<FeedStatus>({});
  const [feedErrors, setFeedErrors] = useState<Record<string, string>>({});
  const [selectedCategory, setSelectedCategory] = useState("All stories");
  const [query, setQuery] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingFeedId, setEditingFeedId] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [searchOpen, setSearchOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [readingArticle, setReadingArticle] = useState<RssArticle | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(new Set<string>());
  const [savedIds, setSavedIds] = useState<ReadonlySet<string>>(new Set<string>());
  const [health, setHealth] = useState<FeedHealth>({});

  const feeds = useMemo(() => mergeFeeds(baseFeeds, settings), [baseFeeds, settings]);
  const categories = useMemo(
    () => [
      "All stories",
      ...new Set(feeds.filter((feed) => feed.enabled).map((feed) => feed.category)),
    ],
    [feeds],
  );
  const enabledFeedIds = useMemo(
    () => new Set(feeds.filter((feed) => feed.enabled).map((feed) => feed.id)),
    [feeds],
  );
  const libraryArticles = useMemo(
    () => articles.filter((article) => enabledFeedIds.has(article.feedId)),
    [articles, enabledFeedIds],
  );
  const activeFeeds = useMemo(
    () =>
      feeds.filter(
        (feed) =>
          feed.enabled &&
          (selectedSourceId
            ? feed.id === selectedSourceId
            : selectedCategory === "All stories" ||
              selectedCategory === SAVED_VIEW ||
              feed.category === selectedCategory),
      ),
    [feeds, selectedCategory, selectedSourceId],
  );
  const savedArticles = useMemo(
    () =>
      articles
        .filter((article) => savedIds.has(article.id))
        .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()),
    [articles, savedIds],
  );
  const trimmedQuery = query.trim();
  const searching = trimmedQuery.length > 0;
  // Search runs over the local archive, not just the stories loaded this session.
  const searchResults = useMemo(
    () => (searching ? searchStories(articles, trimmedQuery) : []),
    [articles, searching, trimmedQuery],
  );
  const visibleArticles = useMemo(() => {
    if (searching) return searchResults;
    if (selectedCategory === SAVED_VIEW) return savedArticles;
    return libraryArticles
      .filter((article) =>
        selectedSourceId
          ? article.feedId === selectedSourceId
          : selectedCategory === "All stories" || article.category === selectedCategory,
      )
      .filter((article) => !readIds.has(article.id))
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  }, [
    libraryArticles,
    readIds,
    savedArticles,
    searchResults,
    searching,
    selectedCategory,
    selectedSourceId,
  ]);
  const loading = Object.keys(feedStatus).some((id) => feedStatus[id] === "loading");
  const failedFeeds = feeds.filter((feed) => feedErrors[feed.id]);
  const hasError = failedFeeds.length > 0;
  const failedNames = failedFeeds.map((feed) => feed.name);
  const failedLabel =
    failedNames.length === 1
      ? failedNames[0]
      : `${failedNames.slice(0, -1).join(", ")} and ${failedNames.at(-1)}`;

  const refresh = useCallback(async (sources: FeedSource[]): Promise<Record<string, string>> => {
    const enabled = sources.filter((feed) => feed.enabled);
    if (!enabled.length) {
      setArticles([]);
      setFeedStatus({});
      setFeedErrors({});
      setLastUpdated(new Date());
      return {};
    }
    setFeedStatus(Object.fromEntries(enabled.map((feed) => [feed.id, "loading"])));
    const settled = await Promise.allSettled(enabled.map((feed) => fetchFeedArticles(feed)));
    const nextStatus: FeedStatus = {};
    const nextErrors: Record<string, string> = {};
    const nextArticles: RssArticle[] = [];
    const successfulIds = new Set<string>();
    settled.forEach((result, index) => {
      const feed = enabled[index];
      if (!feed) return;
      if (result.status === "fulfilled") {
        successfulIds.add(feed.id);
        nextArticles.push(...result.value);
      } else {
        nextStatus[feed.id] = "error";
        nextErrors[feed.id] =
          result.reason instanceof Error ? result.reason.message : "The feed could not be loaded.";
      }
    });
    setArticles((current) => mergeFeedArticles(current, nextArticles, successfulIds));
    setFeedStatus(nextStatus);
    setFeedErrors(nextErrors);
    const checkedAt = Date.now();
    setHealth((current) => {
      const next: FeedHealth = { ...current };
      for (const feed of enabled) {
        if (successfulIds.has(feed.id)) {
          next[feed.id] = { lastSuccess: checkedAt, lastChecked: checkedAt };
          continue;
        }
        const error = nextErrors[feed.id];
        if (error) next[feed.id] = { ...next[feed.id], lastError: error, lastChecked: checkedAt };
      }
      return next;
    });
    setLastUpdated(new Date());
    if (Object.keys(nextErrors).length) {
      const names = enabled.filter((feed) => nextErrors[feed.id]).map((feed) => feed.name);
      toast.error(`${names.join(", ")} could not be refreshed.`);
    }
    return nextErrors;
  }, []);

  const retryFeed = async (feed: FeedSource) => {
    const errors = await refresh([feed]);
    if (!errors[feed.id]) toast.success(`${feed.name} is back`);
  };

  useEffect(() => {
    let cancelled = false;
    const storedSettings = parseFeedSettings(window.localStorage.getItem(SETTINGS_KEY));
    setSettings(storedSettings);
    setArticles(parseCachedArticles(window.localStorage.getItem(STORY_CACHE_KEY)));
    setSavedIds(parseSavedIds(window.localStorage.getItem(SAVED_IDS_KEY)));
    setHealth(parseFeedHealth(window.localStorage.getItem(FEED_HEALTH_KEY)));
    const savedTheme = window.localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initialTheme =
      savedTheme === "dark" || savedTheme === "light" ? savedTheme : prefersDark ? "dark" : "light";
    setTheme(initialTheme);
    document.documentElement.classList.toggle("dark", initialTheme === "dark");

    void fetch("/feeds.json")
      .then((response) => {
        if (!response.ok) throw new Error("Could not load the default feeds.");
        return response.json() as Promise<FeedSource[]>;
      })
      .then((loadedFeeds) => {
        if (cancelled) return;
        setBaseFeeds(loadedFeeds);
        const combined = mergeFeeds(loadedFeeds, storedSettings);
        setIsReady(true);
        void refresh(combined);
      })
      .catch(() => {
        if (!cancelled) {
          setIsReady(true);
          toast.error("Your feeds could not be loaded. Try refreshing the page.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    if (isReady) window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [isReady, settings]);

  useEffect(() => {
    if (!isReady) return;
    window.localStorage.setItem(SAVED_IDS_KEY, JSON.stringify([...savedIds]));
  }, [isReady, savedIds]);

  useEffect(() => {
    if (!isReady) return;
    window.localStorage.setItem(FEED_HEALTH_KEY, JSON.stringify(health));
  }, [isReady, health]);

  useEffect(() => {
    if (!isReady) return;
    // Keep a rolling archive for search, but always keep saved stories.
    const cache = trimStoryCache(articles, savedIds);
    try {
      window.localStorage.setItem(STORY_CACHE_KEY, JSON.stringify(cache));
    } catch {
      // A full quota should never break reading; the in-memory list still works.
    }
  }, [isReady, articles, savedIds]);

  useEffect(() => {
    if (selectedCategory !== SAVED_VIEW && !categories.includes(selectedCategory)) {
      setSelectedCategory("All stories");
    }
  }, [categories, selectedCategory]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => {
      if (window.localStorage.getItem(THEME_KEY)) return;
      setTheme(event.matches ? "dark" : "light");
      document.documentElement.classList.toggle("dark", event.matches);
    };
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (!isReady) return;
    const intervalId = window.setInterval(() => {
      void refresh(feeds);
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [isReady, refresh, feeds]);

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    window.localStorage.setItem(THEME_KEY, nextTheme);
  };

  const toggleFeed = (feed: FeedSource, enabled: boolean) => {
    setSettings((current) =>
      feed.custom
        ? {
            ...current,
            customFeeds: current.customFeeds.map((item) =>
              item.id === feed.id ? { ...item, enabled } : item,
            ),
          }
        : {
            ...current,
            overrides: {
              ...current.overrides,
              [feed.id]: { ...current.overrides[feed.id], enabled },
            },
          },
    );
    const updated = feeds.map((item) => (item.id === feed.id ? { ...item, enabled } : item));
    void refresh(updated);
  };

  const saveFeed = (feed: FeedSource) => {
    if (editingFeedId !== null) {
      const original = feeds.find((item) => item.id === editingFeedId);
      if (!original) return;
      setSettings((current) =>
        original.custom
          ? {
              ...current,
              customFeeds: current.customFeeds.map((item) =>
                item.id === original.id ? { ...feed, id: item.id, custom: true } : item,
              ),
            }
          : {
              ...current,
              overrides: {
                ...current.overrides,
                [original.id]: {
                  name: feed.name,
                  url: feed.url,
                  category: feed.category,
                  enabled: feed.enabled,
                },
              },
            },
      );
      const updated: FeedSource = {
        ...original,
        ...feed,
        id: original.id,
        custom: Boolean(original.custom),
      };
      setArticles((current) => current.filter((article) => article.feedId !== original.id));
      setEditingFeedId(null);
      if (updated.enabled)
        void refresh([...feeds.filter((item) => item.id !== original.id), updated]);
      toast.success("Feed updated");
      return;
    }
    const id = `custom-${Date.now()}`;
    const custom: FeedSource = { ...feed, id, custom: true };
    setSettings((current) => ({ ...current, customFeeds: [...current.customFeeds, custom] }));
    setEditingFeedId(null);
    if (custom.enabled) void refresh([...feeds, custom]);
    toast.success("Feed added");
  };

  const removeFeed = (feed: FeedSource) => {
    setSettings((current) =>
      feed.custom
        ? { ...current, customFeeds: current.customFeeds.filter((item) => item.id !== feed.id) }
        : { ...current, removedIds: [...new Set([...current.removedIds, feed.id])] },
    );
    setArticles((current) => current.filter((article) => article.feedId !== feed.id));
    toast.success(`${feed.name} removed`);
  };

  const downloadFile = (name: string, contents: string, type: string) => {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportSettings = useCallback(() => {
    downloadFile("marginalia-feeds.json", JSON.stringify(settings, null, 2), "application/json");
    toast.success("Feeds exported");
  }, [settings]);

  const exportOpml = useCallback(() => {
    downloadFile("marginalia-feeds.opml", toOpml(feeds), "text/x-opml");
    toast.success("Feeds exported as OPML");
  }, [feeds]);

  const importFeeds = useCallback(
    (incoming: SavedFeedSettings) => {
      const normalize = (value: string) => value.trim().replace(/\/+$/, "").toLowerCase();
      const knownUrls = new Set(feeds.map((feed) => normalize(feed.url)));
      const newFeeds = incoming.customFeeds.filter((feed) => {
        const key = normalize(feed.url);
        if (knownUrls.has(key)) return false;
        knownUrls.add(key);
        return true;
      });
      const newOverrides = Object.fromEntries(
        Object.entries(incoming.overrides).filter(
          ([id]) => feeds.some((feed) => feed.id === id) && !(id in settings.overrides),
        ),
      );

      if (!newFeeds.length && !Object.keys(newOverrides).length) {
        toast.info("That file has no feeds you do not already have.");
        return;
      }

      const nextSettings: SavedFeedSettings = {
        customFeeds: [...settings.customFeeds, ...newFeeds],
        overrides: { ...newOverrides, ...settings.overrides },
        // Importing never removes the feeds you already have in this app.
        removedIds: settings.removedIds,
      };
      setSettings(nextSettings);
      void refresh(mergeFeeds(baseFeeds, nextSettings));
      const count = newFeeds.length;
      toast.success(
        count ? `${count} feed${count === 1 ? "" : "s"} imported` : "Feed settings imported",
      );
    },
    [baseFeeds, feeds, refresh, settings],
  );

  const importOpml = useCallback(
    (entries: OpmlFeed[]) => {
      // OPML has no notion of the built-in sources, so everything it carries
      // arrives as a custom feed. importFeeds still skips URLs already known.
      importFeeds({
        customFeeds: entries.map((entry, index) => ({
          id: `custom-opml-${Date.now()}-${index}`,
          name: entry.name,
          url: entry.url,
          category: entry.category,
          enabled: true,
          custom: true,
        })),
        overrides: {},
        removedIds: [],
      });
    },
    [importFeeds],
  );

  const markAsRead = (article: RssArticle) => {
    setReadIds((current) => new Set(current).add(article.id));
    setReadingArticle(null);
  };

  const toggleSaved = (article: RssArticle) => {
    const wasSaved = savedIds.has(article.id);
    setSavedIds((current) => {
      const next = new Set(current);
      if (wasSaved) next.delete(article.id);
      else next.add(article.id);
      return next;
    });
    if (wasSaved) toast.success("Removed from saved stories");
    else toast.success("Saved for later");
  };

  const openCategory = (category: string) => {
    setSelectedSourceId(null);
    setSelectedCategory(category);
    setQuery("");
  };

  const updatedLabel = lastUpdated
    ? formatDistanceToNow(lastUpdated, { addSuffix: true })
    : "Just now";

  return (
    <main className="reader-shell min-h-screen bg-background text-foreground">
      <header className="topbar">
        <a className="brand-lockup" href="/" aria-label="Marginalia home">
          <span className="brand-mark">
            <Rss size={19} strokeWidth={2.3} />
          </span>
          <span>
            marginalia<span className="brand-period">.</span>
          </span>
        </a>
        <span className="brand-divider" />
        <span className="brand-caption">YOUR READING DESK</span>
        <div className="top-actions">
          <Button
            variant="ghost"
            size="icon"
            aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
            title="Change appearance"
            onClick={toggleTheme}
          >
            {theme === "light" ? <Moon /> : <Sun />}
          </Button>
          <Button
            variant="outline"
            className="settings-trigger"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 /> <span>Manage feeds</span>
          </Button>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-label">YOUR LIBRARY</div>
          <nav className="category-list" aria-label="Feed categories">
            {categories.map((category) => {
              const count =
                category === "All stories"
                  ? libraryArticles.length
                  : libraryArticles.filter((article) => article.category === category).length;
              return (
                <button
                  key={category}
                  className={cn(
                    "category-tab",
                    selectedCategory === category && "category-tab-active",
                  )}
                  onClick={() => openCategory(category)}
                  aria-current={selectedCategory === category ? "page" : undefined}
                >
                  <span className="category-dot" /> <span>{category}</span>
                  <span className="category-count">{count || "—"}</span>
                </button>
              );
            })}
            <button
              className={cn(
                "category-tab",
                selectedCategory === SAVED_VIEW && "category-tab-active",
              )}
              onClick={() => openCategory(SAVED_VIEW)}
              aria-current={selectedCategory === SAVED_VIEW ? "page" : undefined}
            >
              <Bookmark size={13} className="saved-tab-icon" /> <span>Saved</span>
              <span className="category-count">{savedArticles.length || "—"}</span>
            </button>
          </nav>
          <div className="sidebar-separator" />
          <div className="sidebar-label source-heading">
            <span>YOUR SOURCES</span>
            <button
              className="icon-action"
              aria-label="Add a feed"
              title="Add a feed"
              onClick={() => {
                setEditingFeedId(null);
                setSettingsOpen(true);
              }}
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="source-list">
            {feeds
              .filter((feed) => feed.enabled)
              .map((feed) => {
                const failing = Boolean(health[feed.id]?.lastError);
                return (
                  <button
                    className="source-row"
                    key={feed.id}
                    onClick={() => {
                      setSelectedSourceId(feed.id);
                      setQuery("");
                    }}
                    title={
                      failing
                        ? `${feed.name} is not updating. Last success ${lastSuccessLabel(health[feed.id]?.lastSuccess)}.`
                        : `Show only ${feed.name} stories`
                    }
                  >
                    <span className="source-avatar">{feed.name.slice(0, 1)}</span>
                    <span className="source-name">{feed.name}</span>
                    <span className={cn("source-dot", failing && "source-dot-error")} />
                  </button>
                );
              })}
          </div>
          <div className="sidebar-note">
            <span className="live-pip" /> <span>Quietly collecting your reads</span>
          </div>
        </aside>

        <section className="main-panel">
          <div className="content-head">
            <div className="heading-copy">
              <div className="eyebrow">
                <span className="eyebrow-rule" /> THE DAILY EDITION
              </div>
              <h1>
                {searching
                  ? "Search results"
                  : selectedSourceId
                    ? (feeds.find((feed) => feed.id === selectedSourceId)?.name ?? selectedCategory)
                    : selectedCategory === "All stories"
                      ? "Your reading desk"
                      : selectedCategory === SAVED_VIEW
                        ? "Saved stories"
                        : selectedCategory}
              </h1>
              <p>
                {searching
                  ? `Matches for “${trimmedQuery}” in your saved story archive.`
                  : selectedCategory === SAVED_VIEW
                    ? "Stories you kept for later, even after they leave the feed."
                    : "A considered collection of the stories you follow."}
              </p>
            </div>
            <div className="head-tools">
              <div className={cn("search-box", searchOpen && "search-box-active")}>
                <Search size={16} />
                <Input
                  value={query}
                  onFocus={() => setSearchOpen(true)}
                  onBlur={() => {
                    if (!query) setSearchOpen(false);
                  }}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search your archive..."
                  aria-label="Search stories"
                />
                {query && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Clear search"
                    onClick={() => {
                      setQuery("");
                      setSearchOpen(false);
                    }}
                  >
                    <X size={15} />
                  </Button>
                )}
              </div>
              <Button
                variant="outline"
                size="icon"
                aria-label="Refresh feeds"
                title="Refresh feeds"
                disabled={loading || !isReady}
                onClick={() => void refresh(feeds)}
              >
                <RefreshCw className={cn(loading && "spin-icon")} />
              </Button>
            </div>
          </div>

          <div className="feed-meta">
            <span>{activeFeeds.length} SOURCES</span>
            <span className="meta-divider">/</span>
            <span>{visibleArticles.length} STORIES</span>
            <span className="meta-spacer" />
            <span className="update-indicator">
              <Clock3 size={14} /> Updated {updatedLabel}
            </span>
          </div>
          {hasError && (
            <div className="feed-warning" role="status">
              <span
                title={failedFeeds.map((feed) => `${feed.name}: ${feedErrors[feed.id]}`).join("\n")}
              >
                Couldn’t reach {failedLabel}.
              </span>
              <Button variant="ghost" size="sm" onClick={() => void refresh(feeds)}>
                Try again <ArrowUpRight />
              </Button>
            </div>
          )}

          {!isReady || (loading && articles.length === 0) ? (
            <div className="story-grid" aria-label="Loading stories">
              {Array.from({ length: 6 }, (_, i) => (
                <div className="story-skeleton" key={i}>
                  <div />
                  <div />
                  <div />
                  <div />
                </div>
              ))}
            </div>
          ) : visibleArticles.length > 0 ? (
            <div className="story-grid">
              {visibleArticles.map((article, index) => (
                <StoryCard
                  key={`${article.id}-${article.source}`}
                  article={article}
                  index={index}
                  saved={savedIds.has(article.id)}
                  onToggleSaved={toggleSaved}
                  onOpen={setReadingArticle}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">
                {selectedCategory === SAVED_VIEW ? <Bookmark size={21} /> : <Rss size={21} />}
              </div>
              <h2>
                {searching
                  ? "No stories found"
                  : selectedCategory === SAVED_VIEW
                    ? "Nothing saved yet"
                    : activeFeeds.length
                      ? "Nothing new to read"
                      : "Your library is quiet"}
              </h2>
              <p>
                {searching
                  ? "Try another title, source, or keyword. Search covers your whole local archive."
                  : selectedCategory === SAVED_VIEW
                    ? "Use the Save button on any story to keep it here for later."
                    : activeFeeds.length
                      ? "There are no stories in this category right now."
                      : "Add a feed to start collecting stories here."}
              </p>
              {!activeFeeds.length && selectedCategory !== SAVED_VIEW && (
                <Button variant="outline" onClick={() => setSettingsOpen(true)}>
                  <Plus /> Add your first feed
                </Button>
              )}
            </div>
          )}

          <footer className="desk-footer">
            <span>MADE FOR THE LONG READ</span>
            <span className="footer-star">✳</span>
            <span>EST. TODAY</span>
          </footer>
        </section>
      </div>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        feeds={feeds}
        editingFeedId={editingFeedId}
        setEditingFeedId={setEditingFeedId}
        onSave={saveFeed}
        onToggle={toggleFeed}
        onRemove={removeFeed}
        onExportJson={exportSettings}
        onExportOpml={exportOpml}
        onImport={importFeeds}
        onImportOpml={importOpml}
        health={health}
        onRetry={(feed) => void retryFeed(feed)}
      />
      <Dialog
        open={readingArticle !== null}
        onOpenChange={(open) => {
          if (!open) setReadingArticle(null);
        }}
      >
        <DialogContent className="settings-dialog reader-dialog">
          {readingArticle && (
            <>
              <DialogHeader>
                <div className="dialog-kicker">YOUR READING DESK</div>
                <DialogTitle className="reader-title">{readingArticle.title}</DialogTitle>
                <DialogDescription>
                  {readingArticle.source} · {readingArticle.category}
                </DialogDescription>
              </DialogHeader>
              {readingArticle.image && (
                <img className="story-image" src={readingArticle.image} alt="" />
              )}
              <div className="reader-body">
                {readingArticle.description
                  ? readingArticle.description
                      .split(/\n\s*\n|\n+/)
                      .map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)
                  : null}
              </div>
              <div className="reader-actions">
                <div className="reader-actions-left">
                  <Button variant="outline" size="sm" onClick={() => markAsRead(readingArticle)}>
                    <Check /> Mark as read
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleSaved(readingArticle)}
                    aria-pressed={savedIds.has(readingArticle.id)}
                  >
                    {savedIds.has(readingArticle.id) ? (
                      <>
                        <BookmarkCheck /> Saved
                      </>
                    ) : (
                      <>
                        <Bookmark /> Save
                      </>
                    )}
                  </Button>
                </div>
                <div className="reader-actions-right">
                  <a
                    href={readingArticle.link}
                    target="_blank"
                    rel="noreferrer"
                    className="read-link"
                  >
                    Read story <ExternalLink size={13} />
                  </a>
                  <Button variant="outline" size="sm" onClick={() => setReadingArticle(null)}>
                    <X size={14} /> Close
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}

/** Clipboard access needs a secure origin; the fallback covers anything else. */
async function copyToClipboard(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // fall through to the textarea approach
  }
  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  } catch {
    return false;
  }
}

function StoryCard({
  article,
  index,
  saved,
  onToggleSaved,
  onOpen,
}: {
  article: RssArticle;
  index: number;
  saved: boolean;
  onToggleSaved: (article: RssArticle) => void;
  onOpen?: (article: RssArticle) => void;
}) {
  const date = new Date(article.publishedAt);
  const time = Number.isNaN(date.getTime())
    ? "Recently"
    : formatDistanceToNow(date, { addSuffix: true });
  const ageMs = date.getTime() ? Date.now() - date.getTime() : Number.POSITIVE_INFINITY;
  const isNew = ageMs < 24 * 60 * 60 * 1000;
  const excerpt = article.description.replace(/\s+/g, " ").slice(0, 185);
  const shareStory = async () => {
    const copied = await copyToClipboard(article.link);
    if (copied) toast.success("Link copied to clipboard");
    else toast.error("Could not copy the link");
  };
  return (
    <article className={cn("story-card", index === 0 && "story-card-featured")}>
      <div className="story-card-top">
        <Badge variant="outline" className="story-source">
          {article.source}
        </Badge>
        <span className="story-category">{article.category}</span>
      </div>
      {article.image && <img className="story-image" src={article.image} alt="" loading="lazy" />}
      <a
        className="story-title-link"
        href={article.link}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => {
          if (!onOpen) return;
          event.preventDefault();
          onOpen(article);
        }}
      >
        <h2 className="story-title">{article.title}</h2>
        <ExternalLink className="story-open" size={15} />
      </a>
      {excerpt && (
        <p className="story-excerpt">
          {excerpt}
          {article.description.length > excerpt.length ? "…" : ""}
        </p>
      )}
      <div className="story-card-bottom">
        <span className="story-time">
          {isNew && <span className="story-new-dot" aria-hidden="true" />}
          <Clock3 size={13} />
          {time}
        </span>
        <div className="story-actions">
          <button
            type="button"
            className={cn("share-link", saved && "share-link-saved")}
            onClick={() => onToggleSaved(article)}
            aria-label={saved ? `Remove ${article.title} from saved` : `Save ${article.title}`}
            aria-pressed={saved}
            title={saved ? "Remove from saved" : "Save for later"}
          >
            {saved ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
            {saved ? "Saved" : "Save"}
          </button>
          <button
            type="button"
            className="share-link"
            onClick={shareStory}
            aria-label={`Copy link to ${article.title}`}
            title="Copy link"
          >
            <Link2 size={13} /> Share
          </button>
          <a href={article.link} target="_blank" rel="noreferrer" className="read-link">
            Read story <ArrowUpRight size={14} />
          </a>
        </div>
      </div>
    </article>
  );
}

function SettingsDialog({
  open,
  onOpenChange,
  feeds,
  editingFeedId,
  setEditingFeedId,
  onSave,
  onToggle,
  onRemove,
  onExportJson,
  onExportOpml,
  onImport,
  onImportOpml,
  health,
  onRetry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feeds: FeedSource[];
  editingFeedId: string | null;
  setEditingFeedId: (id: string | null) => void;
  onSave: (feed: FeedSource) => void;
  onToggle: (feed: FeedSource, enabled: boolean) => void;
  onRemove: (feed: FeedSource) => void;
  onExportJson: () => void;
  onExportOpml: () => void;
  onImport: (settings: SavedFeedSettings) => void;
  onImportOpml: (entries: OpmlFeed[]) => void;
  health: FeedHealth;
  onRetry: (feed: FeedSource) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [error, setError] = useState("");
  const [importError, setImportError] = useState("");
  const [updateCheck, setUpdateCheck] = useState<UpdateResult | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editingFeed = feeds.find((feed) => feed.id === editingFeedId);

  useEffect(() => {
    if (editingFeed) {
      setName(editingFeed.name);
      setUrl(editingFeed.url);
      setCategory(editingFeed.category);
      setCreatingCategory(false);
      setError("");
      setShowForm(true);
    } else if (open && !showForm) {
      setName("");
      setUrl("");
      setCategory("");
      setCreatingCategory(false);
      setError("");
    }
  }, [editingFeed, open, showForm]);

  const resetForm = () => {
    setShowForm(false);
    setEditingFeedId(null);
    setName("");
    setUrl("");
    setCategory("");
    setCreatingCategory(false);
    setError("");
    setImportError("");
  };
  const close = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) resetForm();
  };
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      setError("Enter a valid feed URL.");
      return;
    }
    if (parsed.protocol !== "https:") {
      setError("Use an HTTPS feed URL for a secure connection.");
      return;
    }
    if (!category.trim()) {
      setError("Enter a category.");
      return;
    }
    onSave({
      id: editingFeed?.id ?? "",
      name: name.trim(),
      url: parsed.href,
      category: category.trim(),
      enabled: editingFeed?.enabled ?? true,
      custom: editingFeed?.custom ?? true,
    });
    resetForm();
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const contents = await file.text();
      // OPML is XML, so the first meaningful character tells the two apart.
      if (contents.trimStart().startsWith("<")) {
        const entries = parseOpmlFeeds(contents);
        if (!entries) {
          setImportError("That file is not an OPML feed list.");
          return;
        }
        if (!entries.length) {
          setImportError("That OPML file has no feeds with an HTTPS address.");
          return;
        }
        setImportError("");
        onImportOpml(entries);
        return;
      }
      const parsed = parseImportedFeedSettings(contents);
      if (!parsed) {
        setImportError("That file is not a Marginalia feeds export.");
        return;
      }
      setImportError("");
      onImport(parsed);
    } catch {
      setImportError("That file could not be read.");
    }
  };

  const runUpdateCheck = async () => {
    setCheckingUpdate(true);
    setUpdateCheck(await checkForUpdates(__APP_VERSION__));
    setCheckingUpdate(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="settings-dialog">
        <DialogHeader>
          <div className="dialog-kicker">YOUR READING DESK</div>
          <DialogTitle>
            {showForm ? (editingFeedId ? "Edit source" : "Add a source") : "Manage your feeds"}
          </DialogTitle>
          <DialogDescription>
            {showForm
              ? "Bring another publication into your daily edition."
              : "Choose which publications make it into your reading desk."}
          </DialogDescription>
        </DialogHeader>
        {showForm ? (
          <form className="feed-form" onSubmit={submit}>
            <label className="form-label">
              Publication name
              <Input
                autoFocus
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. The Atlantic"
              />
            </label>
            <label className="form-label">
              RSS feed URL
              <Input
                type="url"
                required
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://publication.com/feed"
              />
            </label>
            <label className="form-label">
              Category
              <Select
                value={creatingCategory ? "" : category}
                onValueChange={(value) => {
                  if (value === "__create__") {
                    setCreatingCategory(true);
                    setCategory("");
                    return;
                  }
                  setCreatingCategory(false);
                  setCategory(value);
                }}
              >
                <SelectTrigger className="w-full" aria-label="Category">
                  <SelectValue placeholder="e.g. Culture" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from(new Set(feeds.map((feed) => feed.category).filter(Boolean))).map(
                    (cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ),
                  )}
                  <SelectSeparator />
                  <SelectItem value="__create__">Create new category</SelectItem>
                </SelectContent>
              </Select>
              {creatingCategory && (
                <Input
                  autoFocus
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder="New category name"
                />
              )}
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancel
              </Button>
              <Button type="submit">
                <Check /> {editingFeedId ? "Save changes" : "Add feed"}
              </Button>
            </div>
          </form>
        ) : (
          <>
            <div className="settings-feed-list">
              {feeds.map((feed) => {
                const entry = health[feed.id];
                const failing = Boolean(entry?.lastError);
                return (
                  <div className="settings-feed-row" key={feed.id}>
                    <Switch
                      checked={feed.enabled}
                      onCheckedChange={(checked) => onToggle(feed, checked)}
                      aria-label={`${feed.enabled ? "Disable" : "Enable"} ${feed.name}`}
                    />
                    <div className="settings-feed-info">
                      <span className="settings-feed-name">{feed.name}</span>
                      <span className="settings-feed-detail">
                        {feed.category}
                        {feed.custom ? " · Custom feed" : " · Included feed"}
                      </span>
                      {failing && (
                        <span
                          className="feed-health feed-health-error"
                          title={entry?.lastError}
                          role="status"
                        >
                          <AlertCircle size={11} />
                          Not updating · last success {lastSuccessLabel(entry?.lastSuccess)}
                        </span>
                      )}
                    </div>
                    {failing && feed.enabled && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Retry ${feed.name}`}
                        title="Retry this feed"
                        onClick={() => onRetry(feed)}
                      >
                        <RefreshCw />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${feed.name}`}
                      title="Edit feed"
                      onClick={() => {
                        setEditingFeedId(feed.id);
                      }}
                    >
                      <Settings2 />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${feed.name}`}
                      title="Remove feed"
                      onClick={() => onRemove(feed)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                );
              })}
            </div>
            {importError && (
              <p className="form-error form-error-import" role="alert">
                {importError}
              </p>
            )}
            <div className="dialog-bottom">
              <span>{feeds.length} publications in your library</span>
              <div className="dialog-actions">
                <Button
                  className="add-feed-button"
                  variant="outline"
                  onClick={() => {
                    setEditingFeedId(null);
                    setCreatingCategory(false);
                    setShowForm(true);
                  }}
                >
                  <Plus /> Add a feed
                </Button>
                <div className="dialog-transfer">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setImportError("");
                      fileInputRef.current?.click();
                    }}
                    title="Import a Marginalia export or an OPML file"
                  >
                    <Upload /> Import
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="sm">
                        <Download /> Export
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" side="top">
                      <DropdownMenuItem onSelect={onExportOpml}>
                        OPML for other readers
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={onExportJson}>
                        Marginalia backup (JSON)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <div className="dialog-about">
                <span>Marginalia v{__APP_VERSION__}</span>
                <span className="dialog-about-sep" aria-hidden="true">
                  ·
                </span>
                {updateCheck?.status === "available" ? (
                  <a href={updateCheck.url} target="_blank" rel="noreferrer">
                    v{updateCheck.latest} is available <ExternalLink size={11} />
                  </a>
                ) : (
                  <button type="button" onClick={runUpdateCheck} disabled={checkingUpdate}>
                    {checkingUpdate
                      ? "Checking for updates…"
                      : updateCheck?.status === "current"
                        ? `Up to date (v${updateCheck.latest})`
                        : updateCheck?.status === "unknown"
                          ? "Could not check — retry"
                          : "Check for updates"}
                  </button>
                )}
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.opml,.xml,application/json,text/xml,text/x-opml"
              className="hidden"
              onChange={handleImportFile}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
