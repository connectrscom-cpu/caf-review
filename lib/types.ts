/** Row from Review_Queue sheet — keys are normalized (lowercase, trimmed). */
export type ReviewQueueRow = Record<string, string | undefined>;

/** Header metadata: normalized key → original header name (for writes). */
export type HeaderMap = Record<string, string>;

export type DecisionValue = "APPROVED" | "NEEDS_EDIT" | "REJECTED";

export interface DecisionPayload {
  decision: DecisionValue;
  notes?: string;
  rejection_tags?: string[];
  validator?: string;
}

export interface TaskListParams {
  project?: string;
  run_id?: string;
  platform?: string;
  flow_type?: string;
  review_status?: string;
  decision?: string;
  recommended_route?: string;
  qc_status?: string;
  risk_score_min?: string;
  has_preview?: string;
  search?: string;
  sort?: string;
  page?: string;
  limit?: string;
}

export interface TaskListResponse {
  items: ReviewQueueRow[];
  total: number;
  page: number;
  limit: number;
  missing_columns?: string[];
}

export interface TaskDetailResponse {
  rowIndex: number;
  data: ReviewQueueRow;
  missing_columns?: string[];
}
