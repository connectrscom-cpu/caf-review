/**
 * Normalize sheet headers for consistent reads/writes.
 * - Trim whitespace
 * - Lowercase for key lookup
 * - Preserve original header for writing back
 */
export function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, "_");
}

export interface NormalizedHeadersResult {
  /** Normalized key → original header (for sheet writes) */
  keyToOriginal: Record<string, string>;
  /** Normalized keys in column order */
  keys: string[];
}

/**
 * Build normalized header map from raw header row (cell values).
 */
export function buildNormalizedHeaders(rawHeaders: string[]): NormalizedHeadersResult {
  const keyToOriginal: Record<string, string> = {};
  const keys: string[] = [];

  for (const raw of rawHeaders) {
    const trimmed = raw.trim();
    const key = trimmed.toLowerCase().replace(/\s+/g, "_");
    if (!key) continue;
    keyToOriginal[key] = trimmed;
    keys.push(key);
  }

  return { keyToOriginal, keys };
}

/**
 * Map a row of cell values to an object keyed by normalized header.
 */
export function rowToObject(
  cells: string[],
  keys: string[]
): Record<string, string | undefined> {
  const obj: Record<string, string | undefined> = {};
  for (let i = 0; i < keys.length; i++) {
    obj[keys[i]] = cells[i]?.trim() ?? undefined;
  }
  return obj;
}
