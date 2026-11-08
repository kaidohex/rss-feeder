const LATEST_RELEASE_URL = "https://api.github.com/repos/kaidohex/rss-feeder/releases/latest";

export interface UpdateResult {
  status: "current" | "available" | "unknown";
  latest?: string;
  url?: string;
}

function versionParts(version: string): number[] {
  return version
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => !Number.isNaN(part));
}

/** Positive when a is newer than b, negative when older, 0 when equal. */
export function compareVersions(a: string, b: string): number {
  const left = versionParts(a);
  const right = versionParts(b);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const x = left[index] ?? 0;
    const y = right[index] ?? 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

/**
 * Asks GitHub for the newest published release. Network and rate-limit problems
 * come back as "unknown" so the UI can say so instead of claiming it is current.
 */
export async function checkForUpdates(
  currentVersion: string,
  fetcher: typeof fetch = fetch,
): Promise<UpdateResult> {
  try {
    const response = await fetcher(LATEST_RELEASE_URL, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) return { status: "unknown" };
    const release = (await response.json()) as {
      tag_name?: unknown;
      html_url?: unknown;
    };
    const tag = typeof release.tag_name === "string" ? release.tag_name : "";
    const latest = tag.replace(/^v/i, "");
    if (!latest) return { status: "unknown" };
    if (compareVersions(latest, currentVersion) > 0) {
      return {
        status: "available",
        latest,
        url:
          typeof release.html_url === "string" && release.html_url.startsWith("https://")
            ? release.html_url
            : LATEST_RELEASE_URL,
      };
    }
    return { status: "current", latest };
  } catch {
    return { status: "unknown" };
  }
}
