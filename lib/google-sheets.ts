/**
 * Read and write the Validation "Review Queue" Google Sheet.
 *
 * Two auth options (use one):
 *
 * 1) Service account (key file or JSON):
 *    GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS
 *    Share the sheet with the service account email (Editor).
 *
 * 2) OAuth2 refresh token (no service account key needed):
 *    GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
 *    Use a Google account that has Editor access to the sheet.
 */

import { google } from "googleapis";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const ALLOWED_IDS_CACHE_TTL_MS = 60_000; // 1 minute
/** Cached result: task IDs, markInReview, and full row data from sheet keyed by task_id. */
let allowedIdsCache: {
  ids: string[];
  markInReview: string[];
  rowsByTaskId: Record<string, Record<string, string>>;
  expiresAt: number;
} | null = null;

/** Auth client type accepted by google.sheets(); avoid Promise return type from getClient(). */
type SheetsAuthClient =
  | InstanceType<typeof google.auth.GoogleAuth>
  | InstanceType<typeof google.auth.OAuth2>
  | null;

function getAuthClient(): SheetsAuthClient {
  // Option A: OAuth2 refresh token (no service account key required)
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN?.trim();
  if (clientId && clientSecret && refreshToken) {
    const oauth2 = new google.auth.OAuth2(
      clientId,
      clientSecret,
      "http://localhost" // redirect not used when only refreshing
    );
    oauth2.setCredentials({ refresh_token: refreshToken });
    return oauth2;
  }

  // Option B: Service account JSON
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (json) {
    try {
      const credentials = JSON.parse(json) as Record<string, unknown>;
      return new google.auth.GoogleAuth({
        credentials,
        scopes: [SHEETS_SCOPE],
      });
    } catch {
      return null;
    }
  }
  // Option C: Service account key file
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyPath) {
    return new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: [SHEETS_SCOPE],
    });
  }
  return null;
}

/** 0-based column index to A1 column letter (0=A, 26=AA). */
function columnToLetter(col: number): string {
  let s = "";
  let n = col;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export interface ReviewQueueSheetResult {
  /** Task IDs to show in the Review Console. */
  taskIds: string[];
  /** Task IDs that had status=Generated; caller should update sheet to IN_REVIEW. */
  markInReview: string[];
  /** Full row data from the sheet for each allowed task (e.g. generated_slides_json, generated_title). */
  rowsByTaskId: Record<string, Record<string, string>>;
}

/**
 * Returns task_ids that are in the Review Queue sheet where (status = GENERATED
 * AND review_status = READY) OR (status = IN_REVIEW AND review_status = READY),
 * and not yet submitted (submit !== TRUE). Also returns which of those had
 * status=Generated so the backend can update the sheet to IN_REVIEW when they
 * are first loaded into the console. Returns null if sheet is not configured or on error.
 */
export async function getReviewQueueTaskIdsFromSheet(): Promise<ReviewQueueSheetResult | null> {
  const spreadsheetId = process.env.GOOGLE_REVIEW_QUEUE_SPREADSHEET_ID;
  const sheetName =
    process.env.GOOGLE_REVIEW_QUEUE_SHEET_NAME ?? "Review Queue";

  if (!spreadsheetId?.trim()) {
    return null;
  }

  const auth = getAuthClient();
  if (!auth) {
    return null;
  }

  if (allowedIdsCache && Date.now() < allowedIdsCache.expiresAt) {
    return {
      taskIds: allowedIdsCache.ids,
      markInReview: [],
      rowsByTaskId: allowedIdsCache.rowsByTaskId,
    };
  }

  try {
    const sheets = google.sheets({ version: "v4", auth });
    const range = `'${sheetName.replace(/'/g, "''")}'!A:AZ`;
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = res.data.values as string[][] | undefined;
    if (!rows || rows.length < 2) {
      allowedIdsCache = {
        ids: [],
        markInReview: [],
        rowsByTaskId: {},
        expiresAt: Date.now() + ALLOWED_IDS_CACHE_TTL_MS,
      };
      return { taskIds: [], markInReview: [], rowsByTaskId: {} };
    }

    const rawHeaders = rows[0].map((h) => String(h ?? "").trim());
    const headersLower = rawHeaders.map((h) => h.toLowerCase());
    const taskIdIdx = headersLower.indexOf("task_id");
    const statusIdx = headersLower.indexOf("status");
    const reviewStatusIdx = headersLower.indexOf("review_status");
    const submitIdx = headersLower.indexOf("submit");

    if (taskIdIdx === -1 || statusIdx === -1 || reviewStatusIdx === -1) {
      allowedIdsCache = {
        ids: [],
        markInReview: [],
        rowsByTaskId: {},
        expiresAt: Date.now() + ALLOWED_IDS_CACHE_TTL_MS,
      };
      return { taskIds: [], markInReview: [], rowsByTaskId: {} };
    }

    /** Normalize sheet header to key: "Generated slides JSON" -> "generated_slides_json" */
    const headerToKey = (header: string): string =>
      header
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/-/g, "_");

    const norm = (val: unknown) =>
      val != null ? String(val).trim().toUpperCase().replace(/\s+/g, "_").replace(/-/g, "_") : "";

    const allowed: string[] = [];
    const markInReview: string[] = [];
    const rowsByTaskId: Record<string, Record<string, string>> = {};

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const taskId = row[taskIdIdx] != null ? String(row[taskIdIdx]).trim() : "";
      if (!taskId) continue;

      const submitVal =
        submitIdx >= 0 && row[submitIdx] != null
          ? String(row[submitIdx]).trim().toUpperCase()
          : "";
      if (submitVal === "TRUE") continue;

      const statusVal = norm(row[statusIdx]);
      const reviewStatusVal = norm(row[reviewStatusIdx]);

      const generatedAndReady = statusVal === "GENERATED" && reviewStatusVal === "READY";
      const inReviewAndReady = statusVal === "IN_REVIEW" && reviewStatusVal === "READY";
      if (generatedAndReady || inReviewAndReady) {
        allowed.push(taskId);
        if (generatedAndReady) markInReview.push(taskId);
        const sheetRow: Record<string, string> = {};
        for (let c = 0; c < rawHeaders.length; c++) {
          const key = headerToKey(rawHeaders[c]);
          if (!key) continue;
          const val = row[c];
          sheetRow[key] = val != null ? String(val).trim() : "";
        }
        rowsByTaskId[taskId] = sheetRow;
      }
    }

    allowedIdsCache = {
      ids: allowed,
      markInReview,
      rowsByTaskId,
      expiresAt: Date.now() + ALLOWED_IDS_CACHE_TTL_MS,
    };
    return { taskIds: allowed, markInReview, rowsByTaskId };
  } catch {
    return null;
  }
}

export function invalidateReviewQueueSheetCache(): void {
  allowedIdsCache = null;
}

/** Field names we may write; first matching sheet column is used. */
const WRITE_FIELD_TO_HEADERS: Record<string, string[]> = {
  submit: ["submit"],
  review_status: ["status", "review_status"],
  decision: ["decision"],
  notes: ["notes"],
  rejection_tags: ["rejection_tags"],
  validator: ["validator"],
  submitted_at: ["submitted_at"],
  final_title_override: ["final_title_override"],
  final_hook_override: ["final_hook_override"],
  final_caption_override: ["final_caption_override"],
  final_slides_json_override: ["final_slides_json_override"],
  template_key: ["template_key"],
  preview_url: ["preview_url"],
};

export interface ReviewQueueRowUpdate {
  submit?: string;
  review_status?: string;
  decision?: string;
  notes?: string;
  rejection_tags?: string;
  validator?: string;
  submitted_at?: string;
  final_title_override?: string;
  final_hook_override?: string;
  final_caption_override?: string;
  final_slides_json_override?: string;
  template_key?: string;
  preview_url?: string;
}

/**
 * Update a single row in the Review Queue sheet by task_id.
 * Writes only columns that exist in the sheet (by header name, case-insensitive).
 * No-op if sheet not configured, auth missing, or task_id row not found.
 * Call invalidateReviewQueueSheetCache() after so next read is fresh.
 */
export async function updateReviewQueueRow(
  taskId: string,
  fields: ReviewQueueRowUpdate
): Promise<boolean> {
  const spreadsheetId = process.env.GOOGLE_REVIEW_QUEUE_SPREADSHEET_ID?.trim();
  const sheetName =
    process.env.GOOGLE_REVIEW_QUEUE_SHEET_NAME ?? "Review Queue";
  if (!spreadsheetId) return false;

  const auth = getAuthClient();
  if (!auth) return false;

  try {
    const sheets = google.sheets({ version: "v4", auth });
    const range = `'${sheetName.replace(/'/g, "''")}'!A:AZ`;
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    const rows = res.data.values as string[][] | undefined;
    if (!rows || rows.length < 2) return false;

    const headers = rows[0].map((h) => String(h ?? "").trim().toLowerCase());
    const taskIdIdx = headers.indexOf("task_id");
    if (taskIdIdx === -1) return false;

    let dataRowIndex = -1;
    const normalizedTaskId = String(taskId).trim();
    for (let i = 1; i < rows.length; i++) {
      const cell = rows[i][taskIdIdx];
      const rowTaskId = cell != null ? String(cell).trim() : "";
      if (rowTaskId === normalizedTaskId) {
        dataRowIndex = i;
        break;
      }
    }
    if (dataRowIndex === -1) return false;

    // rows[0] = header (sheet row 1), rows[i] = sheet row (i+1)
    const sheetRow = dataRowIndex + 1;
    const escapedSheetName = sheetName.replace(/'/g, "''");
    const data: { range: string; values: string[][] }[] = [];

    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined || value === null) continue;
      const possibleHeaders = WRITE_FIELD_TO_HEADERS[key as keyof ReviewQueueRowUpdate];
      if (!possibleHeaders) continue;
      let colIdx = -1;
      for (const h of possibleHeaders) {
        const i = headers.indexOf(h.toLowerCase());
        if (i >= 0) {
          colIdx = i;
          break;
        }
      }
      if (colIdx < 0) continue;
      const colLetter = columnToLetter(colIdx);
      data.push({
        range: `'${escapedSheetName}'!${colLetter}${sheetRow}`,
        values: [[String(value)]],
      });
    }

    if (data.length === 0) return true;

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data,
      },
    });
    return true;
  } catch {
    return false;
  }
}
