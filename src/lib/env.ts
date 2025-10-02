import fs from "fs";

export function readEnvJsonOrFile(jsonVar: string, fileVar: string): string {
  const j = (process.env as any)[jsonVar];
  if (j && String(j).trim()) return String(j).trim();
  const fp = (process.env as any)[fileVar];
  if (fp && String(fp).trim()) {
    try { return fs.readFileSync(String(fp).trim(), "utf8"); } catch {}
  }
  return "";
}

/* ====== ENV  ====== */
export const PORT = Number(process.env.PORT || 10000);
export const AUTH_TOKEN = process.env.AUTH_TOKEN || "";
export const DRY_RUN = String(process.env.DRY_RUN || "0") === "1";
export const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || process.env.BASE_URL || "").replace(/\/+$/, "");

/* HubSpot v3  */
export const WEBHOOK_SECRET = process.env.HUBSPOT_WEBHOOK_SIGNING_SECRET || process.env.HUBSPOT_APP_SECRET || "";

/* Zoom / */
export const ZOOM_WEBHOOK_SECRET = String(process.env.ZOOM_WEBHOOK_SECRET || process.env.ZOOM_SECRET || "").trim();
export const ZOOM_VERIFICATION_TOKEN = String(process.env.ZOOM_VERIFICATION_TOKEN || process.env.ZOOM_VTOKEN || "").trim();
export const ZOOM_BEARER_TOKEN = process.env.ZOOM_BEARER_TOKEN || "";
export const ZOOM_SIG_SKEW = Number(process.env.ZOOM_SIG_SKEW || 300);

/* (JSON) */
export const HUBSPOT_USER_MAP_JSON = readEnvJsonOrFile("HUBSPOT_USER_MAP_JSON", "HUBSPOT_USER_MAP_FILE");
export const HABITICA_USERS_JSON   = readEnvJsonOrFile("HABITICA_USERS_JSON", "HABITICA_USERS_FILE");
export const NAME_EMAIL_MAP_JSON   = readEnvJsonOrFile("NAME_EMAIL_MAP_JSON", "NAME_EMAIL_MAP_FILE");
export const ZOOM_EMAIL_MAP_JSON   = readEnvJsonOrFile("ZOOM_EMAIL_MAP_JSON", "ZOOM_EMAIL_MAP_FILE");

/* XP: +1XP / 5 */
export const CALL_TOTALIZE_5MIN = false as const;
export const CALL_XP_PER_CALL = (process.env.CALL_XP_PER_CALL === undefined || process.env.CALL_XP_PER_CALL === "") ? 1 : Number(process.env.CALL_XP_PER_CALL);
export const CALL_XP_PER_5MIN   = Number(process.env.CALL_XP_PER_5MIN || 2);
export const CALL_XP_UNIT_MS    = Number(process.env.CALL_XP_UNIT_MS || 300000);

/* CSV UI: */
export const CSV_UPLOAD_TOKENS = String(process.env.CSV_UPLOAD_TOKENS || "").split(",").map(s => s.trim()).filter(Boolean);

/* daily report */
export const DAILY_BONUS_XP = Number(process.env.DAILY_BONUS_XP || 10);
export const DAILY_TASK_MATCH = String(process.env.DAILY_TASK_MATCH || "daily report").split(",").map(s => s.trim()).filter(Boolean);
export const HABITICA_WEBHOOK_SECRET = process.env.HABITICA_WEBHOOK_SECRET || AUTH_TOKEN || "";

/* appointmentXP */
export const APPOINTMENT_XP = Number(process.env.APPOINTMENT_XP || 20);
export const APPOINTMENT_BADGE_LABEL = process.env.APPOINTMENT_BADGE_LABEL || "🎯 appointment";
export const APPOINTMENT_VALUES = String(process.env.APPOINTMENT_VALUES || "appointment_scheduled,appointment").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

/* CSV:DXPort */
export const REQUIRE_DXPORT_NAME = true;

/* salesXP: 10→50XP  */
export const SALES_XP_STEP_YEN = Number(process.env.SALES_XP_STEP_YEN || 100000);
export const SALES_XP_PER_STEP = Number(process.env.SALES_XP_PER_STEP || 50);

/* :ON/OFF */
export const COMPANY_SALES_TO_ALL = String(process.env.COMPANY_SALES_TO_ALL || "0") === "1";

/* Habitica  */
export const HABITICA_MIN_INTERVAL_MS = Number(process.env.HABITICA_MIN_INTERVAL_MS || 300);

/*  TTL() */
export const DEDUPE_TTL_SEC = Number(process.env.DEDUPE_TTL_SEC || 24 * 60 * 60);

/* :3 */
export const MAX_CALL_MS = 3 * 60 * 60 * 1000;
