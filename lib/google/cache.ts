const CACHE_TTL_MS =
  (typeof process.env.CACHE_TTL_SECONDS !== "undefined"
    ? Number(process.env.CACHE_TTL_SECONDS)
    : 15) * 1000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

let sheetCache: CacheEntry<{
  headers: string[];
  keyToOriginal: Record<string, string>;
  keys: string[];
  rows: Record<string, string | undefined>[];
}> | null = null;

type CachedSheetData = {
  headers: string[];
  keyToOriginal: Record<string, string>;
  keys: string[];
  rows: Record<string, string | undefined>[];
};

export function getCachedSheetData(): CachedSheetData | null {
  if (!sheetCache || Date.now() > sheetCache.expiresAt) {
    return null;
  }
  return sheetCache.data;
}

export function setCachedSheetData(data: {
  headers: string[];
  keyToOriginal: Record<string, string>;
  keys: string[];
  rows: Record<string, string | undefined>[];
}): void {
  sheetCache = {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
}

export function invalidateSheetCache(): void {
  sheetCache = null;
}
