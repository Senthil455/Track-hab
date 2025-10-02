// src/features/csv_handlers.ts
import { Request, Response } from "express";
import Busboy from "busboy";
import { parse as csvParse } from "csv-parse/sync";

import {
  APPOINTMENT_VALUES,
  AUTH_TOKEN,
  COMPANY_SALES_TO_ALL,
  CSV_UPLOAD_TOKENS,
  DRY_RUN,
  REQUIRE_DXPORT_NAME,
  SALES_XP_PER_STEP,
  SALES_XP_STEP_YEN,
} from "../lib/env.js";

import {
  appendJsonl,
  displayName,
  firstMatchKey,
  isoDay,
  isoMonth,
  log,
  numOrUndefined,
  parseApprovalAt,
  safeParse,
  readJsonlAll,
} from "../lib/utils.js";

import { getHabitica, isInternal, MAIL2NAME, NAME2MAIL, HAB_MAP } from "../lib/maps.js";
import { habSafe } from "../lib/habiticaQueue.js";

import { addApproval, addMakerAward, addSales } from "../connectors/habitica.js";
import {
  cwApprovalText,
  cwMakerAchievementText,
  cwSalesText,
  sendChatworkMessage,
} from "../connectors/chatwork.js";

/* ============================================================
 *  CSV(Content-Type)
 * ============================================================ */
export async function readCsvTextFromReq(req: Request): Promise<string> {
  const ct = String(req.headers["content-type"] || "");

  if (ct.includes("multipart/form-data")) {
    return await new Promise<string>((resolve, reject) => {
      // ★ busboy  new ().OK
      const bb = Busboy({ headers: req.headers as any });
      const chunks: Buffer[] = [];
      let gotFile = false;

      bb.on("file", (_name, file) => {
        gotFile = true;
        file.on("data", (d: Buffer) => chunks.push(Buffer.from(d)));
      });
      bb.on("field", (name: string, val: string) => {
        if (!gotFile && (name.toLowerCase() === "csv" || name.toLowerCase() === "text")) {
          chunks.push(Buffer.from(val, "utf8"));
        }
      });
      bb.once("error", reject);
      bb.once("finish", () => {
        const buf = Buffer.concat(chunks);
        let txt = buf.toString("utf8");
        if (txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1);
        resolve(txt);
      });
      (req as any).pipe(bb);
    });
  }

  const b: any = (req as any).body;
  if (typeof b === "string" && b.trim().length > 0) return b;

  return await new Promise<string>((resolve) => {
    const chunks: Buffer[] = [];
    (req as any)
      .on("data", (d: Buffer) => chunks.push(Buffer.from(d)))
      .on("end", () => {
        const buf = Buffer.concat(chunks);
        let txt = buf.toString("utf8");
        if (txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1);
        resolve(txt);
      })
      .on("error", () => resolve(""));
  });
}

/* ============================================================
 *  CSV 
 *   assignee( or DXPORT  or email)()
 *   "approval"
 *   approval day/month 
 *    sales 
 * ============================================================ */
export function normalizeCsv(text: string) {
  const recs: any[] = csvParse(text, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  const C_MAKER = [
    "maker",
    "maker",
    "maker()",
    "",
    "brand",
    "maker",
    "",
    "",
    "maker()",
  ];
  const C_AMOUNT = [
    "",
    "sales",
    "",
    "()",
    "()",
    "sales",
    "sales()",
    "sales()",
    "()",
    "amount",
    "price",
    "",
    "",
    "",
    "sales",
    "",
    "",
  ];
  const C_ID = ["id", "ID", "ID", "ID", "ID", "ID", "", "", ""];
  const C_APPR_DT = ["approval", "approval"];
  const C_STATUS = ["", "", ""];

  type Out = {
    type: "approval" | "sales";
    email?: string;
    name?: string;
    amount?: number;
    maker?: string;
    id?: string;
    date?: Date;
    notes?: string;
  };
  const out: Out[] = [];

  for (const r of recs) {
    // assignee
    const actor = resolveActorFromRow(r);
    if (REQUIRE_DXPORT_NAME && !actor.name) continue;
    if (!isInternal(actor.name, actor.email)) continue;

    // =approval
    const kStatus = firstMatchKey(r, C_STATUS);
    if (kStatus) {
      const s = String(r[kStatus] || "").trim();
      const sLc = s.toLowerCase();
      const ok = ["approval", "approved", "approve", "accepted", ""].some(
        (t) => s.includes(t) || sLc === t
      );
      if (!ok) continue;
    }

    // approval
    const kApprDt = firstMatchKey(r, C_APPR_DT);
    const dateStr = kApprDt ? String(r[kApprDt] || "").trim() : "";
    const apprAt = parseApprovalAt(dateStr);
    if (!apprAt) continue;

    const kMaker = firstMatchKey(r, C_MAKER);
    const kAmt = firstMatchKey(r, C_AMOUNT);
    const kId = firstMatchKey(r, C_ID);

    const maker = kMaker ? String(r[kMaker] || "").toString().trim() : undefined;

    let amount = kAmt ? numOrUndefined(r[kAmt]) : undefined;
    if (kAmt && //.test(kAmt)) {
      const addKey = firstMatchKey(r, [""]);
      if (addKey) {
        const add = numOrUndefined(r[addKey]);
        if (Number.isFinite(add as number)) amount = (amount || 0) + (add as number);
      }
    }

    const rid = kId ? String(r[kId] || "").toString().trim() : undefined;

    // approval 1
    out.push({
      type: "approval",
      email: actor.email,
      name: actor.name,
      maker,
      id: rid,
      date: apprAt,
      notes: "from CSV(approved)",
    });

    //  sales 
    if (amount && amount > 0) {
      out.push({
        type: "sales",
        email: actor.email,
        name: actor.name,
        amount,
        maker,
        id: rid,
        date: apprAt,
        notes: "from CSV(approved+amount)",
      });
    }
  }

  return out;
}

/* ---------- →assignee( > DXPort > email) ---------- */
function resolveActorFromRow(r: any): { name?: string; email?: string } {
  const K_NANORI = ["", "(DXPort)", "(dxport)", "()"];
  const kNanori = firstMatchKey(r, K_NANORI);
  if (kNanori) {
    const raw = String(r[kNanori] || "");
    const nameJp = extractDxPortNameFromText(raw) || String(raw).replace(/\u3000/g, " ").trim();
    if (nameJp) {
      const email = NAME2MAIL[nameJp];
      return { name: nameJp, email };
    }
  }

  const K_DX = [
    "approval 23",
    "approval ",
    "DXPort",
    "DX PORT",
    "DXPortassignee",
    "",
    "DX Port",
    "DXport",
    "dxport",
    "dx port",
    "",
    "(dxport)",
    "dxport ",
  ];
  const C_EMAIL = [
    "email",
    "mail",
    "assignee",
    "assignee ",
    "assignee ",
    "assignee",
    "assigneeemail",
    "owner email",
    " ",
    " ",
    "assignee",
    "assigneee-mail",
    "assigneee-mail",
    "assignee",
    "assignee",
  ];

  const kDx = firstMatchKey(r, K_DX);
  if (kDx) {
    const nameJp = extractDxPortNameFromText(String(r[kDx] || ""));
    if (nameJp) {
      const email = NAME2MAIL[nameJp];
      return { name: nameJp, email };
    }
  }
  const kEmail = firstMatchKey(r, C_EMAIL);
  if (kEmail) {
    const e = String(r[kEmail] || "").toLowerCase().trim();
    if (e) return { name: MAIL2NAME[e] || e.split("@")[0], email: e };
  }
  return {};
}

// DXPort 
function extractDxPortNameFromText(s?: string): string | undefined {
  const t = String(s || "").replace(/\u3000/g, " ").trim();
  if (!t) return undefined;
  const m = t.match(/D\s*X\s*(?:P\s*O\s*R\s*T)?\s*\s*([^\s].*)$/i);
  if (m && m[1]) return String(m[1]).replace(/\u3000/g, " ").trim();
  return undefined;
}

/* ============================================================
 *  (UPSERT)
 * ============================================================ */
const FP_IDX_APPR = "data/index/csv_approval_keys.jsonl";
const FP_IDX_SALES = "data/index/csv_sales_keys.jsonl";

function readKeySet(fp: string): Set<string> {
  const rows = readJsonlAll(fp);
  const s = new Set<string>();
  for (const r of rows) {
    const k = String(r.k ?? r.key ?? "");
    if (k) s.add(k);
  }
  return s;
}
function appendKey(fp: string, k: string) {
  appendJsonl(fp, { k, at: new Date().toISOString() });
}
function timeKey(d?: Date): string {
  return d ? new Date(d).toISOString() : "";
}

/* ============================================================
 *  
 * ============================================================ */
function writeCompanyStepsLedger(entry: { month: string; steps: number; totalAmount: number }) {
  appendJsonl("data/awards/company_sales_steps.jsonl", {
    at: new Date().toISOString(),
    month: entry.month,
    steps: entry.steps,
    newSteps: entry.steps,
    totalAmount: entry.totalAmount,
  });
}
function sumCompanyMonthlySalesAmount(month: string) {
  const recs = readJsonlAll("data/events/sales.jsonl");
  let sum = 0;
  for (const r of recs) {
    const d = String(r.day || "");
    if (!d || d.slice(0, 7) !== month) continue;
    sum += Number(r.amount || 0);
  }
  return sum;
}

/* ============================================================
 *  :CSV( / )
 * ============================================================ */

// ()
export async function csvDetect(req: Request, res: Response) {
  const text = await readCsvTextFromReq(req);
  if (!text) return res.status(400).json({ ok: false, error: "empty CSV" });

  const out = normalizeCsv(text);
  const daySet = new Set(out.map((r) => isoDay(r.date)));
  const monthSet = new Set(out.map((r) => isoMonth(r.date)));

  // 
  let appr = 0,
    sales = 0,
    makers = 0;
  const makerCount: Record<string, number> = {};
  const salesSumByMaker: Record<string, number> = {};

  for (const r of out) {
    if (r.type === "approval") {
      appr++;
      if (r.maker) makerCount[r.maker] = (makerCount[r.maker] || 0) + 1;
    }
    if (r.type === "sales" && r.amount) {
      sales++;
      const m = r.maker || "(unknown)";
      salesSumByMaker[m] = (salesSumByMaker[m] || 0) + r.amount;
    }
  }
  makers = Object.keys(makerCount).length;

  res.json({
    ok: true,
    rows: out.length,
    days: Array.from(daySet),
    months: Array.from(monthSet),
    approvals: appr,
    sales,
    makers,
    makerCount,
    salesSumByMaker,
  });
}

// ()
export async function csvUpsert(req: Request, res: Response) {
  // ( or )
  const token =
    String((req.query as any).token || "").trim() ||
    String(req.headers["x-auth-token"] || "").trim();
  const allow =
    !!token &&
    (token === AUTH_TOKEN ||
      String(CSV_UPLOAD_TOKENS ?? "")
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean)
        .includes(token));
  if (!allow) return res.status(401).json({ ok: false, error: "auth" });

  const text = await readCsvTextFromReq(req);
  if (!text) return res.status(400).json({ ok: false, error: "empty CSV" });

  const out = normalizeCsv(text);

  // 
  const setAppr = readKeySet(FP_IDX_APPR);
  const setSales = readKeySet(FP_IDX_SALES);

  // 
  let countAppr = 0;
  let countSales = 0;
  const makerCount: Record<string, number> = {};
  const salesSumByMaker: Record<string, number> = {};

  for (const r of out) {
    const day = isoDay(r.date);
    const month = isoMonth(r.date);

    if (r.type === "approval") {
      const key =
        `appr:${day}:${r.email || r.name}:${r.maker || ""}:${r.id || ""}`.replace(/\s+/g, "_");
      if (setAppr.has(key)) continue;

      // Habitica 
      const cred = getHabitica(r.email);
      if (cred && !DRY_RUN) {
        await habSafe(async () => {
          await addApproval(cred, 0, r.notes || "CSV");
          return undefined as any;
        });
      }
      appendKey(FP_IDX_APPR, key);
      appendJsonl("data/events/approvals.jsonl", {
        at: new Date().toISOString(),
        day,
        month,
        email: r.email,
        name: r.name,
        maker: r.maker,
        id: r.id,
      });
      countAppr++;
      if (r.maker) makerCount[r.maker] = (makerCount[r.maker] || 0) + 1;

      // Chatwork (approval)
      try {
        if (r.name) await sendChatworkMessage(cwApprovalText(r.name, r.maker));
      } catch {}
    }

    if (r.type === "sales" && r.amount) {
      const key =
        `sales:${day}:${r.email || r.name}:${r.maker || ""}:${r.id || ""}:${r.amount}`.replace(
          /\s+/g,
          "_"
        );
      if (setSales.has(key)) continue;

      // Habitica (10/50XP  connector )
      const cred = getHabitica(r.email);
      if (cred && !DRY_RUN) {
        await habSafe(async () => {
          await addSales(cred, r.amount!, r.notes || "CSV");
          return undefined as any;
        });
      }
      appendKey(FP_IDX_SALES, key);
      appendJsonl("data/events/sales.jsonl", {
        at: new Date().toISOString(),
        day,
        month,
        email: r.email,
        name: r.name,
        maker: r.maker,
        id: r.id,
        amount: r.amount,
      });
      countSales++;

      // Chatwork (sales)
      try {
        if (r.name) await sendChatworkMessage(cwSalesText(r.name, r.amount, r.maker));
      } catch {}

      // maker
      const m = r.maker || "(unknown)";
      salesSumByMaker[m] = (salesSumByMaker[m] || 0) + r.amount!;
    }
  }

  // maker(makerassignee🏆)
  try {
    const topMaker = Object.entries(makerCount).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (topMaker) {
      // maker,1()
      const first = out.find((r) => r.maker === topMaker && r.type === "approval");
      if (first?.email) {
        const cred = getHabitica(first.email);
        if (cred && !DRY_RUN) {
          await habSafe(async () => {
            await addMakerAward(cred, 1);
            return undefined as any;
          });
        }
        // Chatwork maker
        try {
          const disp = displayName({ email: first.email, actor: { name: first.name } }, MAIL2NAME);
          await sendChatworkMessage(
            cwMakerAchievementText(disp, topMaker, makerCount[topMaker], salesSumByMaker[topMaker])
          );
        } catch {}
      }
    }
  } catch (e) {
    log(`[csv] maker award error: ${String((e as any)?.message || e)}`);
  }

  // (ON)
  try {
    if (String(COMPANY_SALES_TO_ALL || "") === "1") {
      const months = new Set(out.map((r) => isoMonth(r.date)));
      for (const m of months) {
        const totalAmount = sumCompanyMonthlySalesAmount(m);
        const steps = Math.floor(totalAmount / Number(SALES_XP_STEP_YEN || 100000));
        if (steps > 0) {
          //  steps * SALES_XP_PER_STEP 
          const per = steps * Number(SALES_XP_PER_STEP || 50);
          for (const email of Object.keys(HAB_MAP || {})) {
            const cred = getHabitica(email);
            if (cred && !DRY_RUN) {
              await habSafe(async () => {
                await addSales(cred, steps * Number(SALES_XP_STEP_YEN || 100000), `company_total ${m}`);
                return undefined as any;
              });
            }
          }
          writeCompanyStepsLedger({ month: m, steps, totalAmount });
        }
      }
    }
  } catch (e) {
    log(`[csv] company distribution error: ${String((e as any)?.message || e)}`);
  }

  // Chatwork 
  try {
    const today = isoDay();
    await sendChatworkMessage(
      `CSV(${today})\napproval ${countAppr} / sales ${countSales} / maker ${Object.keys(makerCount).length}`
    );
  } catch {}

  res.json({
    ok: true,
    approvals: countAppr,
    sales: countSales,
    makers: Object.keys(makerCount).length,
  });
}
