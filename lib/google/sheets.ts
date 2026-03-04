import { getSheetsClient } from "./auth";
import { buildNormalizedHeaders, rowToObject } from "./normalize";
import { getCachedSheetData, setCachedSheetData, invalidateSheetCache } from "./cache";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const TAB_NAME = process.env.REVIEW_QUEUE_TAB ?? "Review_Queue";

export interface SheetData {
  keyToOriginal: Record<string, string>;
  keys: string[];
  rows: Record<string, string | undefined>[];
  rawHeaders: string[];
  missing_columns?: string[];
}

export async function readReviewQueue(): Promise<SheetData> {
  const cached = getCachedSheetData();
  if (cached) {
    return {
      ...cached,
      rawHeaders: cached.headers,
    };
  }

  if (!SHEET_ID) {
    throw new Error("Missing GOOGLE_SHEET_ID");
  }

  const sheets = getSheetsClient();
  const range = `${TAB_NAME}!A:ZZ`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range,
  });

  const rawRows = (res.data.values ?? []) as string[][];
  if (rawRows.length === 0) {
    const empty = { keyToOriginal: {}, keys: [], rows: [], rawHeaders: [] };
    setCachedSheetData({ ...empty, headers: [] });
    return empty;
  }

  const rawHeaders = rawRows[0].map((c) => String(c ?? ""));
  const { keyToOriginal, keys } = buildNormalizedHeaders(rawHeaders);
  const rows: Record<string, string | undefined>[] = [];

  for (let i = 1; i < rawRows.length; i++) {
    const cells = rawRows[i];
    const padded = [...cells];
    while (padded.length < keys.length) padded.push("");
    rows.push(rowToObject(padded, keys));
  }

  const data = {
    headers: rawHeaders,
    keyToOriginal,
    keys,
    rows,
  };
  setCachedSheetData(data);

  return {
    keyToOriginal,
    keys,
    rows,
    rawHeaders,
  };
}

/** Convert 1-based column index to A1 column letter (1 -> A, 27 -> AA). */
export function columnToLetter(col: number): string {
  let letter = "";
  let n = col;
  while (n > 0) {
    const r = (n - 1) % 26;
    letter = String.fromCharCode(65 + r) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

/** Get column index (1-based) for a normalized header key. */
export function getColumnIndex(
  key: string,
  keys: string[]
): number | undefined {
  const i = keys.indexOf(key);
  return i === -1 ? undefined : i + 1;
}

export interface DecisionCells {
  decision?: string;
  notes?: string;
  rejection_tags?: string; // JSON string or ;-joined
  validator?: string;
  submit?: string;
  submitted_at?: string;
  review_status?: string;
}

/** Write decision fields to a single row using batchUpdate (only columns that exist). */
export async function writeDecisionRow(
  taskId: string,
  payload: DecisionCells
): Promise<{ updated: boolean; missing_columns: string[] }> {
  invalidateSheetCache();

  const data = await readReviewQueue();
  const { keys, keyToOriginal } = data;
  const taskIdKey = "task_id";
  const rowIndex = data.rows.findIndex(
    (row) => (row[taskIdKey] ?? "").trim() === taskId.trim()
  );
  if (rowIndex === -1) {
    throw new Error("Task not found");
  }

  const sheetRow = rowIndex + 2; // 1-based, row 1 = headers
  const updates: { range: string; values: string[][] }[] = [];
  const missing_columns: string[] = [];

  const setCell = (key: string, value: string) => {
    const col = getColumnIndex(key, keys);
    if (col === undefined) {
      missing_columns.push(keyToOriginal[key] ?? key);
      return;
    }
    const colLetter = columnToLetter(col);
    updates.push({ range: `${TAB_NAME}!${colLetter}${sheetRow}`, values: [[value]] });
  };

  if (payload.decision !== undefined) setCell("decision", payload.decision);
  if (payload.notes !== undefined) setCell("notes", payload.notes);
  if (payload.rejection_tags !== undefined) setCell("rejection_tags", payload.rejection_tags);
  if (payload.validator !== undefined) setCell("validator", payload.validator);
  if (payload.submit !== undefined) setCell("submit", payload.submit);
  if (payload.submitted_at !== undefined) setCell("submitted_at", payload.submitted_at);
  if (payload.review_status !== undefined) setCell("review_status", payload.review_status);

  if (updates.length === 0) {
    return { updated: false, missing_columns };
  }

  const sheets = getSheetsClient();
  if (!SHEET_ID) throw new Error("Missing GOOGLE_SHEET_ID");

  const dataForBatch = updates.map((u) => ({
    range: u.range,
    values: u.values,
  }));

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: dataForBatch,
    },
  });

  invalidateSheetCache();
  return { updated: true, missing_columns };
}
