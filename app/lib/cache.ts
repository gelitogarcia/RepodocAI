const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  value: string;
  expiresAt: number;
}

export function cacheSet(key: string, value: string) {
  try {
    const entry: CacheEntry = { value, expiresAt: Date.now() + TTL_MS };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // localStorage may be unavailable (SSR, private mode quota)
  }
}

export function cacheGet(key: string): string | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() > entry.expiresAt) {
      localStorage.removeItem(key);
      return null;
    }
    return entry.value;
  } catch {
    return null;
  }
}

export function cacheDel(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function cacheAge(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() > entry.expiresAt) return null;
    return Date.now() - (entry.expiresAt - TTL_MS);
  } catch {
    return null;
  }
}

export function docCacheKey(owner: string, repo: string, docType: string) {
  return `repodoc:${owner}/${repo}:${docType}`;
}
