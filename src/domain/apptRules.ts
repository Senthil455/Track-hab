import { APPOINTMENT_VALUES, APPOINTMENT_XP } from "../lib/env.js";
import { getObservedLabelIds, getObservedLabelTitles } from "../store/labels.js";

/** (String(...) ) */
const lc = (v: unknown): string => ("" + (v ?? "")).toLowerCase();

/**
 * outcome(ID)"appointment".
 * ID/, ENV(APPOINTMENT_VALUES) .
 */
export async function isAppointmentOutcome(
  tenant: string,
  outcome: string
): Promise<boolean> {
  const v = lc(outcome).trim();
  if (!v) return false;

  // ()
  const ids =
    ((await getObservedLabelIds(tenant)) ?? []).map((s: unknown) => lc(s));
  const titles =
    ((await getObservedLabelTitles(tenant)) ?? []).map((s: unknown) => lc(s));

  if (ids.length || titles.length) {
    return ids.includes(v) || titles.includes(v);
  }

  // :ENV  APPOINTMENT_VALUES
  const envVals = (APPOINTMENT_VALUES ?? []).map((s: unknown) => lc(s));
  return envVals.includes(v);
}

/**  XP (/) */
export function xpForAppointment(_tenant: string, _outcome: string): number {
  return APPOINTMENT_XP;
}
