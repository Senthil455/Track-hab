// src/server.ts
import express from "express";
import path from "path";
import fs from "fs";

import {
  PORT,
  DRY_RUN,
  CALL_TOTALIZE_5MIN,
  CALL_XP_PER_5MIN,
  CALL_XP_PER_CALL,
  CALL_XP_UNIT_MS,
  APPOINTMENT_VALUES,
  PUBLIC_BASE_URL,
} from "./lib/env.js";
import { log } from "./lib/utils.js";
import { HAB_MAP, NAME2MAIL } from "./lib/maps.js";
import { requireEditorToken } from "./lib/auth.js";

// API()
import { rulesGet, rulesPut, statsToday as statsTodayBase } from "./routes/rules.js";

// Webhook()
import { hubspotWebhook } from "./features/hubspot.js";
import { workflowWebhook } from "./features/workflow.js";
import { zoomWebhook } from "./features/zoom.js";
import { habiticaWebhook } from "./features/habitica_daily.js";

// CSV()
import { csvDetect, csvUpsert } from "./features/csv_handlers.js";

// Admin UI()
import { dashboardHandler, mappingHandler } from "./routes/admin.js";

// ()
import { labelsGet, labelsPut } from "./routes/labels.js";
import { opsRouter } from "./routes/ops.js";

/* =========================
   ()
   -  SGC_TOKENS  JSON → 
     : {"":"wabisabi-habitica-hubspot-connection", "*":"wabisabi-habitica-hubspot-connection"}
   - PUT (GET)
   ========================= */

/* ===== UI =====
   - prod: dist/public-admin/console.html
   - dev : src/public-admin/console.html
   .import.meta .
*/
function resolvePublicAdminDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "dist", "public-admin"),
    path.resolve(process.cwd(), "src", "public-admin"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "console.html"))) return dir;
  }
  // ( 404 )
  return candidates[0];
}
const PUBLIC_ADMIN_DIR = resolvePublicAdminDir();

/*  */
const app = express();
app.set("x-powered-by", false);
app.set("trust proxy", true);

// JSON(rawBody)
app.use(
  express.json({
    verify: (req: any, _res: any, buf: Buffer) => {
      (req as any).rawBody = Buffer.from(buf);
    },
  })
);

// === CORS: ( /tenant/* /admin/*) ===
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

/* ===== (1UI) =====
   https://<host>/admin/console/  console.html 
*/
app.use("/admin/console", express.static(PUBLIC_ADMIN_DIR, { index: "console.html", extensions: ["html"] }));
app.get("/admin/console/*", (_req, res) => {
  res.sendFile(path.join(PUBLIC_ADMIN_DIR, "console.html"));
});

/* Health / Support */
app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    version: "2025-10-10-ui-labels-v3",
    tz: process.env.TZ || "Asia/Tokyo",
    now: new Date().toISOString(),
    baseUrl: PUBLIC_BASE_URL || null,
    dryRun: DRY_RUN,
    habiticaUserCount: Object.keys(HAB_MAP).length,
    nameMapCount: Object.keys(NAME2MAIL).length,
    apptValues: APPOINTMENT_VALUES,
    totalize: CALL_TOTALIZE_5MIN,
    publicAdminDirExists: fs.existsSync(path.join(PUBLIC_ADMIN_DIR, "console.html")),
    publicAdminDir: PUBLIC_ADMIN_DIR,
  });
});
app.get("/support", (_req, res) => res.type("text/plain").send("Support page"));

/* Webhooks() */
app.post("/webhooks/hubspot", hubspotWebhook);
app.post("/webhooks/workflow", workflowWebhook);
app.post("/webhooks/zoom", zoomWebhook);
app.post("/webhooks/habitica", habiticaWebhook);

/* CSV() */
app.post("/admin/csv/detect", express.text({ type: "text/csv", limit: "20mb" }), csvDetect);
app.post("/admin/csv", express.text({ type: "text/csv", limit: "20mb" }), csvUpsert);

/* Admin UI() */
app.get("/admin/dashboard", dashboardHandler);
app.get("/admin/mapping", mappingHandler);

/* Operations API() */
app.use("/tenant", opsRouter);

/* (UI)— GET,PUT */
app.get("/tenant/:id/rules", rulesGet);
app.put("/tenant/:id/rules", requireEditorToken, express.json({ limit: "1mb" }), rulesPut);
app.get("/tenant/:id/stats/today", statsTodayBase);

/* (UI)— GET,PUT */
app.get("/tenant/:id/labels", labelsGet);
app.put("/tenant/:id/labels", requireEditorToken, express.json({ limit: "1mb" }), labelsPut);

/* Start */
app.listen(PORT, () => {
  log(
    `listening :${PORT} DRY_RUN=${DRY_RUN} totalize=${CALL_TOTALIZE_5MIN} unit=${CALL_XP_UNIT_MS}ms per5min=${CALL_XP_PER_5MIN} perCall=${CALL_XP_PER_CALL}`
  );
  log(`[habitica] users=${Object.keys(HAB_MAP).length}, [name->email] entries=${Object.keys(NAME2MAIL).length}`);
  log(`[admin] console at /admin/console/ from ${PUBLIC_ADMIN_DIR}`);
});
export {};
