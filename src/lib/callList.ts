export const CALL_OUTCOMES = [
  { value: "call_complete", label: "Call Complete", color: "#15803d", text: "#ffffff" },
  { value: "call_disconnected", label: "Call Disconnected", color: "#ea580c", text: "#ffffff" },
  { value: "call_back_later", label: "Call Back Later", color: "#d97706", text: "#ffffff" },
  { value: "not_interested", label: "Not Interested in Giving Feedback", color: "#7c3aed", text: "#ffffff" },
  { value: "party_left", label: "Party Left", color: "#be123c", text: "#ffffff" },
  { value: "wrong_number", label: "Wrong Number", color: "#b91c1c", text: "#ffffff" },
  { value: "call_not_received", label: "Call Not Received", color: "#1d4ed8", text: "#ffffff" },
  { value: "out_of_service", label: "Out of Service", color: "#0369a1", text: "#ffffff" },
  { value: "invalid_number", label: "Invalid Number", color: "#be123c", text: "#ffffff" },
  { value: "switched_off", label: "Switched Off", color: "#334155", text: "#ffffff" },
] as const;

export type CallOutcomeValue = (typeof CALL_OUTCOMES)[number]["value"];

export function isCallOutcome(value: string): value is CallOutcomeValue {
  return CALL_OUTCOMES.some((o) => o.value === value);
}

export function callOutcomeLabel(value: string | null | undefined) {
  return CALL_OUTCOMES.find((o) => o.value === value)?.label || "";
}

export function callOutcomeColor(value: string | null | undefined) {
  return CALL_OUTCOMES.find((o) => o.value === value)?.color || "#64748b";
}

export const CALL_SCRIPT =
  "Hello, I am {name} calling on behalf of the Aam Aadmi Party. I am calling you regarding the Jashan-e-Inquilab event.";

/** Someone answered. Call Complete is included here and also shown on its own card. */
export const CONNECTED_CALL_STATUSES = [
  "call_complete",
  "call_disconnected",
  "call_back_later",
  "not_interested",
  "party_left",
  "wrong_number",
] as const;

export const NOT_CONNECTED_CALL_STATUSES = [
  "call_not_received",
  "out_of_service",
  "invalid_number",
  "switched_off",
] as const;

/** Try these numbers again. */
export const REDIAL_CALL_STATUSES = [
  "call_disconnected",
  "call_back_later",
  "call_not_received",
  "out_of_service",
  "switched_off",
] as const;
