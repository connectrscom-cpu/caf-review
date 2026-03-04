const CACHE_TTL_MS =
  (typeof process.env.CACHE_TTL_SECONDS !== "undefined"
    ? Number(process.env.CACHE_TTL_SECONDS)
    : 15) * 1000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

type CachedQueueData = {
  headers: string[];
  keyToOriginal: Record<string, string>;
  keys: string[];
  rows: Record<string, string | undefined>[];
};

let queueCache: CacheEntry<CachedQueueData> | null = null;

export function getCachedSheetData(): CachedQueueData | null {
  if (!queueCache || Date.now() > queueCache.expiresAt) {
    return null;
  }
  return queueCache.data;
}

export function setCachedSheetData(data: CachedQueueData): void {
  queueCache = {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
}

export function invalidateSheetCache(): void {
  queueCache = null;
}
