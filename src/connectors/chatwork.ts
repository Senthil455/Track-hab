// src/connectors/chatwork.ts
import querystring from "querystring";

const CHATWORK_API_TOKEN = process.env.CHATWORK_API_TOKEN || "";
const CHATWORK_ROOM_ID   = process.env.CHATWORK_ROOM_ID || "";

export async function sendChatworkMessage(
  text: string,
  roomId: string = CHATWORK_ROOM_ID,
  token: string = CHATWORK_API_TOKEN
): Promise<{ success: boolean; status: number; json?: any; error?: string }> {
  if (!token) return { success: false, status: 0, error: "CHATWORK_API_TOKEN missing" };
  if (!roomId) return { success: false, status: 0, error: "CHATWORK_ROOM_ID missing" };

  const res = await fetch(`https://api.chatwork.com/v2/rooms/${roomId}/messages`, {
    method: "POST",
    headers: {
      "X-ChatWorkToken": token,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: querystring.stringify({ body: text }),
  } as any);
  const status = res.status;
  const json = await res.json().catch(() => undefined);
  return { success: status >= 200 && status < 300, status, json };
}

/* ===== () ===== */

export function cwApptText(actorName: string) {
  const n = actorName?.trim() || "assignee";
  return [
    `🔥 ${n} "appointment"💪🔥`,
    `call📈 1💥`,
  ].join("\n");
}

export function cwApprovalText(actorName: string, maker?: string) {
  const n = actorName?.trim() || "assignee";
  const m = maker ? `(maker:${maker})` : "";
  return [
    `✅ ${n} "approval"${m}✨`,
    `💪`,
  ].join("\n");
}

export function cwSalesText(actorName: string, amount?: number, maker?: string) {
  const n = actorName?.trim() || "assignee";
  const am = amount ? `¥${Math.max(0, Math.floor(amount)).toLocaleString()}` : "sales";
  const m = maker ? `(maker:${maker})` : "";
  return [
    `💰 ${n} "sales ${am}"${m}🎉`,
    `📈`,
  ].join("\n");
}

/**
 * maker()
 * - ,“”
 */
export function cwMakerAchievementText(
  actorName: string,
  maker?: string,
  approvedCount?: number,
  totalSalesYen?: number
) {
  const n = actorName?.trim() || "assignee";
  const lines = [
    `🏆 ${n} "maker "🔥`,
  ];
  if (maker) lines.push(`maker:${maker}`);
  if (typeof approvedCount === "number") lines.push(`approval:${approvedCount}`);
  if (typeof totalSalesYen === "number")
    lines.push(`sales:¥${Math.max(0, Math.floor(totalSalesYen)).toLocaleString()}`);
  lines.push(
    "",
    `💪`
  );
  return lines.join("\n");
}
