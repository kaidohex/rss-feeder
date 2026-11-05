import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock3,
  ExternalLink,
  LoaderCircle,
  Moon,
  Plus,
  RefreshCw,
  Rss,
  Search,
  Settings2,
  Sun,
  Trash2,
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
  type FeedSource,
  type RssArticle,
  type SavedFeedSettings,
} from "@/lib/rss-reader";
import { fetchFeedXml } from "@/lib/feed-server";

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
          (selectedCategory === "All stories" || feed.category === selectedCategory),
      ),
    [feeds, selectedCategory],
  );
  const visibleArticles = useMemo(
    () =>
      libraryArticles
        .filter(
          (article) => selectedCategory === "All stories" || article.category === selectedCategory,
        )
        .filter(
          (article) =>
            !query ||
            `${article.title} ${article.description} ${article.source}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()),
    [libraryArticles, query, selectedCategory],
  );
  const loading = Object.keys(feedStatus).some((id) => feedStatus[id] === "loading");
  const failedFeeds = feeds.filter((feed) => feedErrors[feed.id]);
  const hasError = failedFeeds.length > 0;
  const failedNames = failedFeeds.map((feed) => feed.name);
  const failedLabel =
    failedNames.length === 1
      ? failedNames[0]
      : `${failedNames.slice(0, -1).join(", ")} and ${failedNames.at(-1)}`;

  const refresh = useCallback(async (sources: FeedSource[]) => {
    const enabled = sources.filter((feed) => feed.enabled);
    if (!enabled.length) {
      setArticles([]);
      setFeedStatus({});
      setFeedErrors({});
      setLastUpdated(new Date());
      return;
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
    setArticles((current) => [
      ...current.filter((article) => !successfulIds.has(article.feedId)),
      ...nextArticles,
    ]);
    setFeedStatus(nextStatus);
    setFeedErrors(nextErrors);
    setLastUpdated(new Date());
    if (Object.keys(nextErrors).length) {
      const names = enabled.filter((feed) => nextErrors[feed.id]).map((feed) => feed.name);
      toast.error(`${names.join(", ")} could not be refreshed.`);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const storedSettings = parseFeedSettings(window.localStorage.getItem(SETTINGS_KEY));
    setSettings(storedSettings);
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
    if (!categories.includes(selectedCategory)) setSelectedCategory("All stories");
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

  const chooseCategory = (value: string) => {
    if (value === "__create__") {
      setEditingFeedId(null);
      setSettingsOpen(true);
      return;
    }
    setSelectedCategory(value);
  };

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
          <div className="category-list-select">
            <Select value={selectedCategory} onValueChange={chooseCategory}>
              <SelectTrigger
                aria-label="Choose a category"
                className="h-9 w-full bg-card text-foreground"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All stories">All stories</SelectItem>
                {categories
                  .filter((category) => category !== "All stories")
                  .map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                <SelectSeparator />
                <SelectItem value="__create__">Create new category</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
              .map((feed) => (
                <button
                  className="source-row"
                  key={feed.id}
                  onClick={() => setSelectedCategory(feed.category)}
                  title={`Show ${feed.category} stories`}
                >
                  <span className="source-avatar">{feed.name.slice(0, 1)}</span>
                  <span className="source-name">{feed.name}</span>
                  <span className="source-dot" />
                </button>
              ))}
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
              <h1>{selectedCategory === "All stories" ? "Your reading desk" : selectedCategory}</h1>
              <p>A considered collection of the stories you follow.</p>
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
                  placeholder="Find a story..."
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
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">
                <Rss size={21} />
              </div>
              <h2>
                {query
                  ? "No stories found"
                  : activeFeeds.length
                    ? "Nothing new to read"
                    : "Your library is quiet"}
              </h2>
              <p>
                {query
                  ? "Try another title, source, or keyword."
                  : activeFeeds.length
                    ? "There are no stories in this category right now."
                    : "Add a feed to start collecting stories here."}
              </p>
              {!activeFeeds.length && (
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
      />
    </main>
  );
}

function StoryCard({ article, index }: { article: RssArticle; index: number }) {
  const date = new Date(article.publishedAt);
  const time = Number.isNaN(date.getTime())
    ? "Recently"
    : formatDistanceToNow(date, { addSuffix: true });
  const excerpt = article.description.replace(/\s+/g, " ").slice(0, 185);
  return (
    <article className={cn("story-card", index === 0 && "story-card-featured")}>
      <div className="story-card-top">
        <Badge variant="outline" className="story-source">
          {article.source}
        </Badge>
        <span className="story-category">{article.category}</span>
      </div>
      {article.image && <img className="story-image" src={article.image} alt="" loading="lazy" />}
      <a className="story-title-link" href={article.link} target="_blank" rel="noreferrer">
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
          <Clock3 size={13} />
          {time}
        </span>
        <a href={article.link} target="_blank" rel="noreferrer" className="read-link">
          Read story <ArrowUpRight size={14} />
        </a>
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feeds: FeedSource[];
  editingFeedId: string | null;
  setEditingFeedId: (id: string | null) => void;
  onSave: (feed: FeedSource) => void;
  onToggle: (feed: FeedSource, enabled: boolean) => void;
  onRemove: (feed: FeedSource) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const editingFeed = feeds.find((feed) => feed.id === editingFeedId);

  useEffect(() => {
    if (editingFeed) {
      setName(editingFeed.name);
      setUrl(editingFeed.url);
      setCategory(editingFeed.category);
      setError("");
      setShowForm(true);
    } else if (open && !showForm) {
      setName("");
      setUrl("");
      setCategory("");
      setError("");
    }
  }, [editingFeed, open, showForm]);

  const resetForm = () => {
    setShowForm(false);
    setEditingFeedId(null);
    setName("");
    setUrl("");
    setCategory("");
    setError("");
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
              <Input
                required
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="e.g. Culture"
              />
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
              {feeds.map((feed) => (
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
                  </div>
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
              ))}
            </div>
            <div className="dialog-bottom">
              <span>{feeds.length} publications in your library</span>
              <Button
                variant="outline"
                onClick={() => {
                  setEditingFeedId(null);
                  setShowForm(true);
                }}
              >
                <Plus /> Add a feed
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
