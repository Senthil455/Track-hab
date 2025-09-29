import fetch from "node-fetch";

export type HabiticaCred = { userId: string; apiToken: string };

function headers(cred?: HabiticaCred) {
  const user = cred?.userId ?? process.env.HABITICA_USER_ID;
  const key  = cred?.apiToken ?? process.env.HABITICA_API_TOKEN;
  if (!user || !key) {
    console.warn("[habitica] WARN: missing credentials (user or apiToken). skip.");
    return null; // 
  }
  const xcli = process.env.HABITICA_X_CLIENT || `sales-gamify`;
  return {
    "Content-Type": "application/json",
    "x-api-user": user,
    "x-api-key": key,
    "x-client": xcli,
  };
}

const BASE = process.env.HABITICA_BASE_URL || "https://habitica.com/api/v3";

export async function createTodo(
  title: string,
  note?: string,
  dateISO?: string,
  cred?: HabiticaCred
) {
  const h = headers(cred);
  if (!h) return { skipped: true, reason: "no_credentials" };
  const body: any = { text: title, type: "todo", notes: note || "" };
  if (dateISO) body.date = dateISO;

  console.log(`[habitica] createTodo title="${title}" user=${cred?.userId ?? "(common)"}`);
  const res = await fetch(`${BASE}/tasks/user`, {
    method: "POST",
    headers: h,
    body: JSON.stringify(body),
  } as any);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Habitica createTodo ${res.status}: ${JSON.stringify(json)}`);
  return json.data; // { id, ... }
}

export async function completeTask(taskId: string, cred?: HabiticaCred) {
  const h = headers(cred);
  if (!h) return { skipped: true, reason: "no_credentials" };
  console.log(`[habitica] completeTask id=${taskId} user=${cred?.userId ?? "(common)"}`);
  const res = await fetch(`${BASE}/tasks/${taskId}/score/up`, {
    method: "POST",
    headers: h,
  } as any);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Habitica completeTask ${res.status}: ${JSON.stringify(json)}`);
  return json.data;
}

/** “”(ToDo) */
export async function addBadge(cred: HabiticaCred, label: string, note?: string) {
  const todo = await createTodo(`🏅 ${label}`, note ?? "badge", undefined, cred);
  const id = (todo as any)?.id;
  if (id) await completeTask(id, cred);
}

/** maker(To-Do→).count  */
export async function addMakerAward(cred: HabiticaCred, count = 1) {
  for (let i = 0; i < count; i++) {
    const todo = await createTodo("🏆 ⚙maker", "maker ", undefined, cred);
    const id = (todo as any)?.id;
    if (id) await completeTask(id, cred);
  }
  // (OK)
  await addBadge(cred, "⚙ maker", "top maker of the day");
}

/** appointment“”(XP/notes) */
export async function addAppointment(
  cred: HabiticaCred,
  xp: number,
  badgeLabel?: string
) {
  const title = `🟩 appointment +${xp}XP`;
  const notes = `rule=appointment+${xp}`;
  const todo = await createTodo(title, notes, undefined, cred);
  const id = (todo as any)?.id;
  if (id) await completeTask(id, cred);
  if (badgeLabel) await addBadge(cred, badgeLabel, "appointment achieved");
}

/** :approval(CSV) */
export async function addApproval(
  cred: HabiticaCred,
  amount: number,
  note?: string
) {
  // :approval +30XP
  const xp = 30;
  const title = `✅ approval +${xp}XP`;
  const notes = `rule=approval+${xp}\n${note ?? "CSV"}`;
  const todo = await createTodo(title, notes, undefined, cred);
  const id = (todo as any)?.id;
  if (id) await completeTask(id, cred);
}

/** :sales(CSV)
 *  :10() +50XP()
 *   - SALES_XP_STEP_YEN:1( 100000)
 *   - SALES_XP_PER_STEP:XP( 50)
 */
export async function addSales(
  cred: HabiticaCred,
  amount: number,
  note?: string
) {
  const stepYen   = Number(process.env.SALES_XP_STEP_YEN || 100000); // 10
  const xpPerStep = Number(process.env.SALES_XP_PER_STEP || 50);     // 50XP/10
  const amt       = Math.max(0, Number(amount || 0));
  const steps     = Math.floor(amt / stepYen);
  const xp        = steps * xpPerStep;

  // 0〜XP(ToDo)
  if (xp <= 0) {
    console.log(`[habitica] addSales: amount=${amt} < step(${stepYen}); XP=0 → skip award`);
    return { skipped: true, reason: "below_step" };
  }

  const title = `💰 sales +${xp}XP(¥${amt.toLocaleString()})`;
  const notes = `rule=sales+${xp} (${xpPerStep}xp/${stepYen}yen)\n${note ?? "CSV"}`;
  const todo = await createTodo(title, notes, undefined, cred);
  const id = (todo as any)?.id;
  if (id) await completeTask(id, cred);
}
