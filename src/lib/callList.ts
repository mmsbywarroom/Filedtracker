export const CALL_OUTCOMES = [
  { value: "connected", label: "Connected" },
  { value: "no_answer", label: "No answer" },
  { value: "busy", label: "Busy" },
  { value: "call_later", label: "Call later" },
  { value: "wrong_number", label: "Wrong number" },
] as const;

export type CallOutcomeValue = (typeof CALL_OUTCOMES)[number]["value"];

export function isCallOutcome(value: string): value is CallOutcomeValue {
  return CALL_OUTCOMES.some((o) => o.value === value);
}

export function callOutcomeLabel(value: string | null | undefined) {
  return CALL_OUTCOMES.find((o) => o.value === value)?.label || "";
}
