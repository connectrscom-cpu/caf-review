import { invalidateReviewQueueSheetCache } from "@/lib/google-sheets";

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

export type QueueStatusTab = "in_review" | "approved" | "rejected";

let queueCache: { status: QueueStatusTab; data: CachedQueueData; expiresAt: number } | null = null;

export function getCachedSheetData(status: QueueStatusTab = "in_review"): CachedQueueData | null {
  if (!queueCache || Date.now() > queueCache.expiresAt || queueCache.status !== status) {
    return null;
  }
  return queueCache.data;
}

export function setCachedSheetData(data: CachedQueueData, status: QueueStatusTab = "in_review"): void {
  queueCache = {
    status,
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
}

export function invalidateSheetCache(): void {
  queueCache = null;
  invalidateReviewQueueSheetCache();
}
