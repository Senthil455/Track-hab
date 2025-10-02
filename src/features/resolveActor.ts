// src/features/resolveActor.ts
// assigneeassignee.
// HubSpot / Workflow / Zoom .

import { safeParse, normSpace, parseHubSpotSourceUserId } from "../lib/utils.js";
import { HUBSPOT_USER_MAP_JSON } from "../lib/env.js";
import { MAIL2NAME } from "../lib/maps.js";

export function resolveActor(
  ev: { source: "v3" | "workflow" | "zoom"; raw?: any }
): { name: string; email?: string } {
  const raw = ev.raw || {};

  /* 1) email () */
  let email: string | undefined =
    raw.actorEmail ||
    raw.ownerEmail ||
    raw.userEmail ||
    raw?.owner?.email ||
    raw?.properties?.owner_email ||
    raw?.properties?.hubspot_owner_email ||
    raw?.userEmail;

  /* 2) HubSpot  user/owner  ID  + sourceId(userId:xxxx)  */
  const ownerId =
    raw?.properties?.hubspot_owner_id ??
    raw?.hubspot_owner_id ??
    parseHubSpotSourceUserId(raw) ??
    raw?.ownerId ??
    raw?.associatedOwnerId ??
    raw?.owner?.id ??
    raw?.hsUserId ??
    raw?.createdById ??
    raw?.actorId ??
    raw?.userId;

  /* 3) (HUBSPOT_USER_MAP_JSON  { [id]: {name,email} }) */
  const hsMap = safeParse<Record<string, { name?: string; email?: string }>>(HUBSPOT_USER_MAP_JSON) || undefined;
  const hs = ownerId != null ? hsMap?.[String(ownerId)] : undefined;

  const finalEmail = (email || hs?.email || "").toLowerCase() || undefined;

  /* 4) 
        -  → MAIL2NAME 
        - HUBSPOT_USER_MAP_JSON  name
        - 
        -  "assignee"
  */
  const display =
    (finalEmail && MAIL2NAME[finalEmail]) ||
    (hs?.name && normSpace(hs.name)) ||
    (finalEmail ? String(finalEmail).split("@")[0] : undefined) ||
    "assignee";

  return { name: display, email: finalEmail };
}
