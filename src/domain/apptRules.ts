import { APPOINTMENT_VALUES, APPOINTMENT_XP } from "../lib/env.js";
import { getObservedLabelIds, getObservedLabelTitles } from "../store/labels.js";

/**
 * outcome(ID)"appointment".
 * ID/, ENV  APPOINTMENT_VALUES .
 *
 * @param {string} tenant ID
 * @param {string} outcome HubSpot outcome(ID)
 * @returns {boolean} trueappointment
 */
export function isAppointmentOutcome(tenant: string, outcome: string): boolean {
  const v = String(outcome || "").trim().toLowerCase();
  if (!v) return false;

  // ID/
  const ids = (getObservedLabelIds(tenant) || []).map((s) => String(s).toLowerCase());
  const titles = (getObservedLabelTitles(tenant) || []).map((s) => String(s).toLowerCase());

  // 
  if (ids.length || titles.length) {
    return ids.includes(v) || titles.includes(v);
  }

  // : APPOINTMENT_VALUES
  const envVals = (APPOINTMENT_VALUES || []).map((s) => String(s).toLowerCase());
  return envVals.includes(v);
}

/**
 * appointmentXP.
 *  APPOINTMENT_XP ,XP.
 *
 * @param {string} tenant ID
 * @param {string} outcome ID
 * @returns {number} XP
 */
export function xpForAppointment(tenant: string, outcome: string): number {
  //  tenant  XP  lookup 
  return APPOINTMENT_XP;
}
