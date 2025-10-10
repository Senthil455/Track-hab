// @ts-nocheck
// src/domain/apptRules.ts

import { APPOINTMENT_VALUES, APPOINTMENT_XP } from "../lib/env.js";
import * as labelsStore from "../store/labels.js";

// 
const asStr = (v: unknown): string => "" + (v ?? "");
const lc = (v: unknown): string => asStr(v).toLowerCase();
const arr = (v: any): any[] =>
  Array.isArray(v) ? v : (v && Array.isArray(v.items) ? v.items : []);

/**
 * outcome(ID)"appointment".
 * ID/. ENV .
 */
export async function isAppointmentOutcome(tenant: string, outcome: string): Promise<boolean> {
  const v = lc(outcome).trim();
  if (!v) return false;

  try {
    const idsFn = (labelsStore as any).getObservedLabelIds;
    const titlesFn = (labelsStore as any).getObservedLabelTitles;
    const ids = idsFn ? arr(await idsFn(tenant)).map(lc) : [];
    const titles = titlesFn ? arr(await titlesFn(tenant)).map(lc) : [];
    if (ids.length || titles.length) {
      return ids.includes(v) || titles.includes(v);
    }
  } catch {
    // ignore → ENV fallback
  }

  const envValsRaw: any = APPOINTMENT_VALUES;
  const envVals = Array.isArray(envValsRaw)
    ? envValsRaw
    : (typeof envValsRaw === "string" ? envValsRaw.split(",") : []);
  return envVals.map(lc).includes(v);
}

/**  XP() */
export function xpForAppointment(_tenant: string, _outcome: string): number {
  return APPOINTMENT_XP;
}
