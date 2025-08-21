import axios from "axios";

export type HabiticaCred = { userId: string; apiToken: string };

const HABITICA_API = process.env.HABITICA_API_BASE || "https://habitica.com/api/v3";
const MOCK = String(process.env.MOCK_MODE || "").toLowerCase() === "true";

/** Habitica alias (ID) */
async function ensureHabitTask(cred: HabiticaCred, alias: string, text: string) {
  if (MOCK) return { id: `mock-${alias}` };
  const headers = { "x-api-user": cred.userId, "x-api-key": cred.apiToken, "Content-Type": "application/json" };
  try {
    const list = await axios.get(`${HABITICA_API}/tasks/user`, { headers });
    const hit = (list.data?.data || []).find((t: any) => t.alias === alias);
    if (hit) return { id: hit.id };
  } catch { /*  */ }
  const payload = { type: "habit", text, alias, up: true, down: false, priority: 1 };
  const res = await axios.post(`${HABITICA_API}/tasks/user`, payload, { headers });
  return { id: res.data?.data?.id };
}

/** Habitican */
async function scoreUp(cred: HabiticaCred, taskId: string, times: number) {
  if (!times || times <= 0) return;
  if (MOCK) {
    console.log(`[MOCK] Habitica score up: ${taskId} x${times}`);
    return;
  }
  const headers = { "x-api-user": cred.userId, "x-api-key": cred.apiToken, "Content-Type": "application/json" };
  for (let i = 0; i < times; i++) {
    await axios.post(`${HABITICA_API}/tasks/${taskId}/score/up`, {}, { headers });
  }
}

/** /() */
export async function addXpForKpi(cred: HabiticaCred, calls: number, minutes: number, blockMinutes = 5) {
  const callsTask = await ensureHabitTask(cred, "calls-made", "Calls Made");
  const minsTask  = await ensureHabitTask(cred, "talk-minutes", `Talk Minutes (${blockMinutes}m block)`);
  const blocks = Math.floor(minutes / blockMinutes);
  await scoreUp(cred, callsTask.id, calls);
  await scoreUp(cred, minsTask.id, blocks);
}

/** / */
export async function addXpForEvent(cred: HabiticaCred, alias: string, text: string, amount: number) {
  if (!amount || amount <= 0) return;
  const task = await ensureHabitTask(cred, alias, text);
  await scoreUp(cred, task.id, amount);
}

/**  */
export async function addNewAppointment(cred: HabiticaCred, count = 1) {
  return addXpForEvent(cred, "new-appointment", "New Appointment", count);
}
export async function addApproval(cred: HabiticaCred, count = 1) {
  return addXpForEvent(cred, "approval", "Approval", count);
}
export async function addSales(cred: HabiticaCred, amountJpy: number) {
  const times = Math.floor(amountJpy / 100000);
  if (times > 0) {
    return addXpForEvent(cred, "sales", "Sales (¥100k)", times);
  }
}
export async function addDailyTask(cred: HabiticaCred, count = 1) {
  return addXpForEvent(cred, "daily-task", "Daily Task", count);
}
export async function addMakerAward(cred: HabiticaCred, count = 1) {
  return addXpForEvent(cred, "maker-award", "Maker Award", count);
}
