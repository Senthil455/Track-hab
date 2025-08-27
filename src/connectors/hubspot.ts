// src/connectors/hubspot.ts
// :Note.email→
const HUBSPOT_TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN || "";

async function hsFetch(url: string, init: RequestInit = {}) {
  if (!HUBSPOT_TOKEN) throw new Error("HUBSPOT_PRIVATE_APP_TOKEN missing");
  const headers = {
    Authorization: `Bearer ${HUBSPOT_TOKEN}`,
    "Content-Type": "application/json",
    ...(init.headers || {}),
  };
  const res = await fetch(url, { ...init, headers });
  const json = await res.json().catch(() => undefined);
  if (!res.ok) {
    const msg = JSON.stringify(json);
    throw new Error(`HubSpot ${res.status}: ${msg}`);
  }
  return json;
}

/** Note() */
export async function hsCreateNote(body: string) {
  return hsFetch("https://api.hubapi.com/crm/v3/objects/notes", {
    method: "POST",
    body: JSON.stringify({
      properties: { hs_note_body: body },
    }),
  });
}

/** email  → ID( undefined) */
export async function hsFindContactIdByEmail(email: string): Promise<string | undefined> {
  const res = await hsFetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [
        { filters: [{ propertyName: "email", operator: "EQ", value: email }] },
      ],
      properties: ["email"],
      limit: 1,
    }),
  });
  const id = res?.results?.[0]?.id;
  return typeof id === "string" ? id : undefined;
}

/** Note  Contact (Note) */
export async function hsAssociateNoteToContact(noteId: string, contactId: string) {
  // v3 association API(note_to_contact )
  const url = `https://api.hubapi.com/crm/v3/objects/notes/${noteId}/associations/contacts/${contactId}/note_to_contact`;
  return hsFetch(url, { method: "PUT" });
}

/** :Note→()email */
export async function hsCreateNoteOptionallyAssociate(body: string, email?: string) {
  const note = await hsCreateNote(body);
  const noteId = note?.id;
  if (email && noteId) {
    const cid = await hsFindContactIdByEmail(email).catch(() => undefined);
    if (cid) {
      await hsAssociateNoteToContact(noteId, cid).catch(() => undefined);
    }
  }
  return note;
}
