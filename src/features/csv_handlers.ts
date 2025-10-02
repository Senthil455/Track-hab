// src/features/csv_handlers.ts  — server.ts 
import { Request, Response } from "express";
import Busboy from "busboy";
import { parse as csvParse } from "csv-parse/sync";

import {
  APPOINTMENT_VALUES, // 
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
 *  CSV ( server.ts )
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
    "maker","maker","maker()","","brand","maker","","","maker()",
  ];
  const C_AMOUNT = [
    "","sales","","()","()","sales","sales()","sales()",
    "()","amount","price","","","","sales","","",
  ];
  const C_ID = ["id","ID","ID","ID","ID","ID","","",""];
  const C_APPR_DT = ["approval","approval"]; // day 
  const C_STATUS  = ["","",""]; // "approval"

  type Out = {type:"approval"|"sales"; email?:string; name?:string; amount?:number; maker?:string; id?:string; date?:Date; notes?:string};
  const out: Out[] = [];

  for (const r of recs) {
    // 1) appointment
    const actor = resolveActorFromRow(r);
    if (REQUIRE_DXPORT_NAME && !actor.name) continue;
    if (!isInternal(actor.name, actor.email)) continue;

    // 2) =approval 
    const kStatus = firstMatchKey(r, C_STATUS);
    if (kStatus) {
      const s = String(r[kStatus]||"").trim();
      const sLc = s.toLowerCase();
      const ok = ["approval","approved","approve","accepted",""].some(t => s.includes(t) || sLc===t);
      if (!ok) continue;
    }

    // 3) approval()
    const kApprDt = firstMatchKey(r, C_APPR_DT);
    const dateStr = kApprDt ? String(r[kApprDt]||"").trim() : "";
    const apprAt = parseApprovalAt(dateStr);
    if (!apprAt) continue;

    // 4) 
    const kMaker  = firstMatchKey(r, C_MAKER);
    const kAmt    = firstMatchKey(r, C_AMOUNT);
    const kId     = firstMatchKey(r, C_ID);

    const maker = kMaker ? String(r[kMaker]||"").toString().trim() : undefined;

    let amount = kAmt ? numOrUndefined(r[kAmt]) : undefined;
    if (kAmt && //.test(kAmt)) {
      const addKey = firstMatchKey(r, [""]);
      if (addKey) {
        const add = numOrUndefined(r[addKey]);
        if (Number.isFinite(add as number)) amount = (amount || 0) + (add as number);
      }
    }

    const rid = kId ? String(r[kId]||"").toString().trim() : undefined;

    out.push({ type:"approval", email:actor.email, name:actor.name, maker, id: rid, date: apprAt, notes:"from CSV(approved)" });
    if (amount && amount>0) {
      out.push({ type:"sales", email:actor.email, name:actor.name, amount, maker, id: rid, date: apprAt, notes:"from CSV(approved+amount)" });
    }
  }
  return out;
}

/* ---------- →assignee( > DXPort > email) ---------- */
function resolveActorFromRow(r:any): {name?:string; email?:string} {
  const K_NANORI = ["","(DXPort)","(dxport)","()"];
  const kNanori = firstMatchKey(r, K_NANORI);
  if (kNanori) {
    const raw = String(r[kNanori] || "");
    const nameJp = extractDxPortNameFromText(raw) || String(raw).replace(/\u3000/g," ").trim();
    if (nameJp) {
      const email = NAME2MAIL[nameJp];
      return { name: nameJp, email };
    }
  }

  const K_DX = ["approval 23","approval ","DXPort","DX PORT","DXPortassignee","","DX Port","DXport","dxport","dx port","","(dxport)","dxport "];
  const C_EMAIL = ["email","mail","assignee","assignee ","assignee ","assignee","assigneeemail","owner email"," "," ","assignee","assigneee-mail","assigneee-mail","assignee","assignee"];

  const kDx = firstMatchKey(r, K_DX);
  if (kDx) {
    const nameJp = extractDxPortNameFromText(String(r[kDx]||""));
    if (nameJp) {
      const email = NAME2MAIL[nameJp];
      return { name: nameJp, email };
    }
  }
  const kEmail  = firstMatchKey(r, C_EMAIL);
  if (kEmail) {
    const e = String(r[kEmail]||"").toLowerCase().trim();
    if (e) return { name: MAIL2NAME[e] || e.split("@")[0], email: e };
  }
  return {};
}

// DXPort 
function extractDxPortNameFromText(s?: string): string|undefined {
  const t = String(s || "").replace(/\u3000/g," ").trim();
  if (!t) return undefined;
  const m = t.match(/D\s*X\s*(?:P\s*O\s*R\s*T)?\s*\s*([^\s].*)$/i);
  if (m && m[1]) return String(m[1]).replace(/\u3000/g," ").trim();
  return undefined;
}

/* ============================================================
 *  ( server.ts )
 * ============================================================ */
function requireBearerCsv(req: Request, res: Response): boolean {
  const auth = String(req.header("authorization")||"");
  const token = auth.replace(/^Bearer\s+/i,"").trim();
  const list = String(CSV_UPLOAD_TOKENS||"").split(",").map(s=>s.trim()).filter(Boolean);
  if (!AUTH_TOKEN && list.length===0) { res.status(500).json({ok:false,error:"missing tokens"}); return false; }
  if (token && token===AUTH_TOKEN) return true;
  if (token && list.includes(token)) return true;
  res.status(401).json({ok:false,error:"auth"}); return false;
}

/* ============================================================
 *  UPSERT ( server.ts )
 * ============================================================ */
const FP_IDX_APPR = "data/index/csv_approval_keys.jsonl";
const FP_IDX_SALES = "data/index/csv_sales_keys.jsonl";

function readKeySet(fp: string): Set<string> {
  const rows = readJsonlAll(fp);
  const s = new Set<string>();
  for (const r of rows) { const k = String(r.k ?? r.key ?? ""); if (k) s.add(k); }
  return s;
}
function appendKey(fp: string, k: string) { appendJsonl(fp, { k, at: new Date().toISOString() }); }
function timeKey(d?: Date){ return d ? new Date(d).toISOString() : ""; }
function personKey(email?: string, name?: string){ return (email && email.trim()) ? `e:${email.toLowerCase()}` : `n:${String(name||"").replace(/\u3000/g," ").trim()}`; }
function keyApproval(args:{date?:Date; maker?:string; email?:string; name?:string}) {
  return `a|${timeKey(args.date)}|${String(args.maker||"").trim()}|${personKey(args.email,args.name)}`;
}
function keySales(args:{date?:Date; maker?:string; email?:string; name?:string; amount?:number}) {
  const amt = Number(args.amount||0);
  return `s|${timeKey(args.date)}|${String(args.maker||"").trim()}|${personKey(args.email,args.name)}|${amt}`;
}

/* ============================================================
 *  ()/()— 
 * ============================================================ */
// :ledger
function readSalesStepsLedger(): Map<string, number> {
  const rows = readJsonlAll("data/awards/sales_month_steps.jsonl");
  const m = new Map<string, number>();
  for (const r of rows) {
    const kk = `${String(r.month||"")}|${String(r.email||"").toLowerCase()}|${String(r.maker||"")}`;
    const steps = Number(r.steps||0);
    if (kk && Number.isFinite(steps)) m.set(kk, steps);
  }
  return m;
}
function writeSalesStepsLedger(entry: { month:string; email:string; maker:string; steps:number; totalAmount:number; newSteps:number }) {
  appendJsonl("data/awards/sales_month_steps.jsonl", {
    at: new Date().toISOString(),
    month: entry.month,
    email: entry.email,
    maker: entry.maker,
    steps: entry.steps,
    newSteps: entry.newSteps,
    totalAmount: entry.totalAmount
  });
}
function keyOfMonthEmailMaker(month:string,email:string,maker:string){ return `${month}|${email}|${maker}`; }
function sumMonthlySalesAmount(month: string, email: string, maker: string): number {
  const salesAll = readJsonlAll("data/events/sales.jsonl");
  let sum = 0;
  for (const s of salesAll) {
    const d = String(s.day||"");
    if (!d || d.slice(0,7)!==month) continue;
    const em = String(s?.actor?.email || s?.email || "").toLowerCase();
    const mk = String(s?.maker||"");
    if (em===email && mk===maker) sum += Number(s.amount||0);
  }
  return sum;
}
type SalesTouched = { month:string; email:string; maker:string };
async function awardMonthlyCumulativeFor(touched: SalesTouched[]){
  if (!touched.length) return;
  const uniq = Array.from(new Set(touched.map(t=>keyOfMonthEmailMaker(t.month,t.email,t.maker))))
              .map(s=>{ const [month,email,maker] = s.split("|"); return {month,email,maker} as SalesTouched; });

  const ledger = readSalesStepsLedger();
  for (const k of uniq) {
    if (!k.email) continue;
    const cred = getHabitica(k.email);
    if (!cred && !DRY_RUN) continue;

    const totalAmt = sumMonthlySalesAmount(k.month, k.email, k.maker);
    if (totalAmt <= 0) continue;

    const stepsNow = Math.floor(totalAmt / Number(SALES_XP_STEP_YEN || 100000));
    const prev = ledger.get(keyOfMonthEmailMaker(k.month,k.email,k.maker)) || 0;
    const delta = stepsNow - prev;
    if (delta <= 0) continue;

    const addAmount = Number(SALES_XP_STEP_YEN || 100000) * delta;
    if (!DRY_RUN && cred) {
      await habSafe(async ()=>{ await addSales(cred, addAmount, `CSV monthly cumulative ${k.maker} ${k.month} (+${delta} step)`); return undefined as any; });
    } else {
      log(`[sales-cum] DRY_RUN or no-cred: email=${k.email} maker=${k.maker} month=${k.month} total=¥${totalAmt.toLocaleString()} stepsNow=${stepsNow} +${delta}`);
    }
    writeSalesStepsLedger({ month:k.month, email:k.email, maker:k.maker, steps:stepsNow, totalAmount:totalAmt, newSteps:delta });
  }
}

// :ledger
function readCompanyStepsLedger(): Map<string, number> {
  const rows = readJsonlAll("data/awards/company_sales_steps.jsonl");
  const m = new Map<string, number>();
  for (const r of rows) {
    const mo = String(r.month||"");
    const steps = Number(r.steps||0);
    if (mo && Number.isFinite(steps)) m.set(mo, steps);
  }
  return m;
}
function writeCompanyStepsLedger(entry: { month:string; steps:number; totalAmount:number; newSteps:number }) {
  appendJsonl("data/awards/company_sales_steps.jsonl", {
    at: new Date().toISOString(),
    month: entry.month,
    steps: entry.steps,
    newSteps: entry.newSteps,
    totalAmount: entry.totalAmount
  });
}
function sumCompanyMonthlySalesAmount(month: string): number {
  const salesAll = readJsonlAll("data/events/sales.jsonl");
  let sum = 0;
  for (const s of salesAll) {
    const d = String(s.day||"");
    if (!d || d.slice(0,7)!==month) continue;
    sum += Number(s.amount||0);
  }
  return sum;
}
async function awardCompanyCumulativeForMonths(months: string[]) {
  if (String(COMPANY_SALES_TO_ALL||"")!=="1") return;
  const uniq = Array.from(new Set(months.filter(Boolean)));
  if (!uniq.length) return;

  const ledger = readCompanyStepsLedger();
  for (const month of uniq) {
    const totalAmt = sumCompanyMonthlySalesAmount(month);
    if (totalAmt <= 0) continue;

    const stepsNow = Math.floor(totalAmt / Number(SALES_XP_STEP_YEN || 100000));
    const prev = ledger.get(month) || 0;
    const delta = stepsNow - prev;
    if (delta <= 0) continue;

    const addAmount = Number(SALES_XP_STEP_YEN || 100000) * delta;
    const members = Object.entries(HAB_MAP);
    let awarded = 0;

    if (!DRY_RUN) {
      for (const [_email, cred] of members) {
        if (!cred) continue;
        await habSafe(async ()=>{ await addSales(cred, addAmount, `CSV company monthly cumulative ${month} (+${delta} step)`); return undefined as any; });
        awarded++;
      }
    } else {
      log(`[company-cum] DRY_RUN: month=${month} total=¥${totalAmt.toLocaleString()} stepsNow=${stepsNow} +${delta} toAll=${members.length}`);
      awarded = members.length;
    }
    writeCompanyStepsLedger({ month, steps: stepsNow, totalAmount: totalAmt, newSteps: delta });
  }
}

/* ============================================================
 *  ()
 * ============================================================ */
export async function csvDetect(req: Request, res: Response) {
  const text = await readCsvTextFromReq(req);
  if (!text) return res.status(400).json({ ok: false, error: "empty CSV" });

  const out = normalizeCsv(text);
  const daySet = new Set(out.map((r) => isoDay(r.date)));
  const monthSet = new Set(out.map((r) => isoMonth(r.date)));

  let appr = 0, sales = 0;
  const makerCount: Record<string, number> = {};
  const salesSumByMaker: Record<string, number> = {};

  for (const r of out) {
    if (r.type === "approval") {
      appr++; if (r.maker) makerCount[r.maker] = (makerCount[r.maker] || 0) + 1;
    }
    if (r.type === "sales" && r.amount) {
      sales++; const m = r.maker || "(unknown)";
      salesSumByMaker[m] = (salesSumByMaker[m] || 0) + r.amount;
    }
  }

  res.json({
    ok: true,
    rows: out.length,
    days: Array.from(daySet),
    months: Array.from(monthSet),
    approvals: appr,
    sales,
    makers: Object.keys(makerCount).length,
    makerCount,
    salesSumByMaker,
  });
}

/* ============================================================
 *  ( server.ts )
 * ============================================================ */
const CW_PER_ROW = false; // :Chatwork()

export async function csvUpsert(req: Request, res: Response) {
  if (!requireBearerCsv(req,res)) return;

  const text = await readCsvTextFromReq(req);
  if (!text) return res.status(400).json({ ok: false, error: "empty CSV" });

  const normalized = normalizeCsv(text);

  // ()
  const seenAppr = readKeySet(FP_IDX_APPR);
  const seenSales = readKeySet(FP_IDX_SALES);

  let nA=0, nS=0, sum=0, dup=0;
  const makerCount: Record<string, number> = {};
  const salesSumByMaker: Record<string, number> = {};

  const touched: SalesTouched[] = [];        //  (month,email,maker)
  const touchedMonths = new Set<string>();   //  (month)

  for (const r of normalized) {
    const actorName = r.name || (r.email ? (MAIL2NAME[r.email] || r.email.split("@")[0]) : "assignee");
    const email = r.email ? String(r.email).toLowerCase() : undefined;
    const amount = r.amount != null ? Number(r.amount) : undefined;
    const maker = r.maker ? String(r.maker).trim() : undefined;
    const id = String(r.id || `${r.type}:${actorName}:${maker||"-"}`).trim();
    const date = r.date;
    const day = isoDay(date);

    if (r.type==="approval") {
      const k = keyApproval({date, maker, email, name:actorName});
      if (seenAppr.has(k)) { dup++; continue; }
      seenAppr.add(k); appendKey(FP_IDX_APPR, k);

      nA++;
      appendJsonl("data/events/approvals.jsonl",{ at:new Date().toISOString(), day, email, actor:{name:actorName, email}, id, maker });
      if (!DRY_RUN) {
        const cred = getHabitica(email);
        if (cred) await habSafe(()=>addApproval(cred,1,"CSV").then(()=>undefined as any));
      }
      if (CW_PER_ROW) { try { await sendChatworkMessage(cwApprovalText(actorName, maker)); } catch {} }
      if (maker) makerCount[maker] = (makerCount[maker]||0) + 1;
    }

    if (r.type==="sales") {
      const k = keySales({date, maker, email, name:actorName, amount});
      if (seenSales.has(k)) { dup++; continue; }
      seenSales.add(k); appendKey(FP_IDX_SALES, k);

      nS++; sum+=(amount||0);
      appendJsonl("data/events/sales.jsonl",{ at:new Date().toISOString(), day, email, actor:{name:actorName, email}, id, maker, amount });

      // (email & maker )
      if (email && maker) touched.push({ month: String(day).slice(0,7), email, maker });

      // 
      touchedMonths.add(String(day).slice(0,7));

      // per-row :(>=)
      if (!DRY_RUN) {
        const cred = getHabitica(email);
        if (cred && amount && amount > 0 && amount < Number(SALES_XP_STEP_YEN || 100000)) {
          await habSafe(()=>addSales(cred, amount, "CSV (per-row < step)").then(()=>undefined as any));
        }
      }
      if (CW_PER_ROW) { try { await sendChatworkMessage(cwSalesText(actorName, amount, maker)); } catch {} }

      const m2 = maker || "(unknown)";
      salesSumByMaker[m2] = (salesSumByMaker[m2]||0) + (amount||0);
    }
  }

  /* ===== :maker() ===== */
  try {
    const today = isoDay();
    const apprsToday = readJsonlAll("data/events/approvals.jsonl").filter(x => String(x.day||"") === today);
    type Entry = { name:string; email?:string; makerCounts: Record<string, number> };
    const byActor: Record<string, Entry> = {};
    const actorKey = (a:any) => (String(a?.actor?.email || a?.email || "") || displayName(a, MAIL2NAME)).toLowerCase();

    for (const a of apprsToday) {
      const key = actorKey(a);
      const email = String(a?.actor?.email || a?.email || "").toLowerCase() || undefined;
      const name = displayName(a, MAIL2NAME);
      const maker = String(a?.maker || "").trim();
      if (!maker) continue;
      if (!byActor[key]) byActor[key] = { name, email, makerCounts:{} };
      byActor[key].makerCounts[maker] = (byActor[key].makerCounts[maker] || 0) + 1;
    }

    let best = 0;
    const winners: Entry[] = [];
    for (const e of Object.values(byActor)) {
      const top = Math.max(0, ...Object.values(e.makerCounts));
      if (top > 0) {
        if (top > best) { best = top; winners.length = 0; winners.push(e); }
        else if (top === best) { winners.push(e); }
      }
    }

    if (best > 0 && winners.length > 0) {
      const awardedLog = readJsonlAll("data/events/maker_awards.jsonl");
      const already = new Set(
        awardedLog.filter((x:any)=> String(x.day||"")===today)
                  .map((x:any)=> String(x.email || x?.actor?.email || "").toLowerCase())
      );

      for (const w of winners) {
        const em = (w.email||"").toLowerCase();
        if (!em || already.has(em)) continue;
        const cred = getHabitica(em);
        if (!DRY_RUN && cred) {
          await habSafe(()=>addMakerAward(cred,1).then(()=>undefined as any));
        }
        appendJsonl("data/events/maker_awards.jsonl", { at: new Date().toISOString(), day: today, email: em, actor: { name: w.name, email: em }, topCount: best });
      }
    }
  } catch (e:any) {
    log(`[csv] maker award (daily) error: ${e?.message||e}`);
  }

  /* ===== maker() ===== */
  try {
    const now = new Date();
    const j = new Intl.DateTimeFormat("ja-JP",{ timeZone: "Asia/Tokyo", year:"numeric", month:"numeric", day:"numeric" }).formatToParts(now);
    const parts:any = {}; for (const p of j) if (p.type==="year"||p.type==="month"||p.type==="day") parts[p.type]=Number(p.value);
    const last = new Date(parts.year, parts.month, 0).getDate();
    if (parts.day === last) {
      const monthKey = isoMonth();
      type Entry = { name:string; email?:string; makerCounts: Record<string, number> };
      const byActor: Record<string, Entry> = {};
      const apprsAll = readJsonlAll("data/events/approvals.jsonl");
      const apprsMonth = apprsAll.filter(x => String(x.day||"").slice(0,7) === monthKey);
      const actorKey = (a:any) => (String(a?.actor?.email || a?.email || "") || displayName(a, MAIL2NAME)).toLowerCase();

      for (const a of apprsMonth) {
        const key = actorKey(a);
        const email = String(a?.actor?.email || a?.email || "").toLowerCase() || undefined;
        const name = displayName(a, MAIL2NAME);
        const maker = String(a?.maker || "").trim();
        if (!maker) continue;
        if (!byActor[key]) byActor[key] = { name, email, makerCounts:{} };
        byActor[key].makerCounts[maker] = (byActor[key].makerCounts[maker] || 0) + 1;
      }

      let best = 0;
      const winners: Entry[] = [];
      for (const e of Object.values(byActor)) {
        const top = Math.max(0, ...Object.values(e.makerCounts));
        if (top > 0) {
          if (top > best) { best = top; winners.length = 0; winners.push(e); }
          else if (top === best) { winners.push(e); }
        }
      }

      if (best > 0 && winners.length > 0) {
        const monthlyLog = readJsonlAll("data/events/maker_awards_monthly.jsonl");
        const already = new Set(
          monthlyLog.filter((x:any)=> String(x.month||"")===monthKey)
                    .map((x:any)=> String(x.email || x?.actor?.email || "").toLowerCase())
        );
        for (const w of winners) {
          const em = (w.email||"").toLowerCase();
          if (!em || already.has(em)) continue;
          const cred = getHabitica(em);
          if (!DRY_RUN && cred) {
            await habSafe(()=>addMakerAward(cred,1).then(()=>undefined as any));
          }
          appendJsonl("data/events/maker_awards_monthly.jsonl", { at: new Date().toISOString(), month: monthKey, email: em, actor: { name: w.name, email: em }, topCount: best });
        }
      }
    }
  } catch (e:any) {
    log(`[csv] maker award (monthly) error: ${e?.message||e}`);
  }

  /* ===== / & () ===== */
  try { await awardMonthlyCumulativeFor(touched); } catch(e:any){ log(`[sales-cumulative] failed: ${e?.message||e}`); }
  try { await awardCompanyCumulativeForMonths(Array.from(touchedMonths)); } catch(e:any){ log(`[company-cumulative] failed: ${e?.message||e}`); }

  /* ===== Chatwork () ===== */
  try {
    const today = isoDay();
    await sendChatworkMessage(`📦 CSV(approval)\n📅  ${today}\n  approval: ${nA}　💴 sales: ¥${sum.toLocaleString()}(${nS})`);
  } catch {}

  res.json({ ok: true, mode:"upsert", approvals: nA, sales: nS, makers: Object.keys(makerCount).length });
}
