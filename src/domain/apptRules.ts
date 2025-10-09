// @ts-nocheck
// src/domain/apptRules.ts
// appointment(UI ENV )
// "",XP features/appointment.ts .

import { APPOINTMENT_VALUES, APPOINTMENT_XP } from "../lib/env.js";
import { getObservedLabelIds, getObservedLabelTitles } from "../store/labels.js";

// 
const asStr = (v: unknown): string => "" + (v ?? "");
const lc = (v: unknown): string => asStr(v).toLowerCase();

/**
 * outcome(ID)"appointment".
 * ID/. ENV(APPOINTMENT_VALUES) .
 */
export async function isAppointmentOutcome(tenant: string, outcome: string): Promise<boolean> {
  const v = lc(outcome).trim();
  if (!v) return false;

  try {
    // (UI )
    const ids = ((await getObservedLabelIds(tenant)) ?? []).map(lc);
    const titles = ((await getObservedLabelTitles(tenant)) ?? []).map(lc);
    if (ids.length || titles.length) {
      return ids.includes(v) || titles.includes(v);
    }
  } catch {
    // (ENV )
  }

  // 
  const envVals = (APPOINTMENT_VALUES ?? []).map(lc);
  return envVals.includes(v);
}

/**  XP (/) */
export function xpForAppointment(_tenant: string, _outcome: string): number {
  return APPOINTMENT_XP;
}
