/**
 * Send review decision to a webhook (e.g. n8n) that can update the sheet or your backend.
 */

export interface DecisionPayload {
  task_id: string;
  decision: string;
  notes?: string;
  rejection_tags?: string[];
  validator?: string;
  submit: string;
  submitted_at: string;
  review_status: string;
}

export async function sendDecisionToWebhook(
  webhookUrl: string,
  payload: DecisionPayload
): Promise<{ ok: boolean; status: number; error?: string }> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, status: res.status, error: text || res.statusText };
  }
  return { ok: true, status: res.status };
}
