// ---------------------------------------------------------------------------
// MOCKED BACKEND
// Mirrors the planned HTTP surface (/v1/sessions, guest-links, join, canvas).
// Everything is stored in browser localStorage with simulated latency so the
// real service can replace this module function-for-function later.
// ---------------------------------------------------------------------------

import { emptyDoc, uid, type CanvasDoc } from "./canvas-doc";

export type SessionState = "draft" | "live" | "ended";
export type Role = "owner" | "interviewer" | "observer" | "candidate";

export interface Participant {
  id: string;
  displayName: string;
  role: Role;
  isGuest: boolean;
  joinedAt: string;
  leftAt: string | null;
  color: string;
}

export interface GuestLink {
  id: string;
  token: string; // real backend stores only a hash
  roleGranted: Role;
  expiresAt: string;
  maxUses: number;
  uses: number;
  revokedAt: string | null;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
}

export interface InterviewSession {
  id: string;
  title: string;
  prompt: string;
  state: SessionState;
  candidateEditingEnabled: boolean;
  ownerName: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  endedAt: string | null;
  participants: Participant[];
  guestLinks: GuestLink[];
  audit: AuditEvent[];
  doc: CanvasDoc;
}

export const CURRENT_USER = { id: "usr_owner", displayName: "You (Interviewer)", email: "you@acme.dev" };

const KEY = "sdi.mock.v1";
const PRESENCE_COLORS = ["#22d3ee", "#f59e0b", "#a78bfa", "#34d399", "#f472b6", "#60a5fa"];

const delay = (ms = 140) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();

function canUseStorage() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function audit(actor: string, action: string): AuditEvent {
  return { id: uid("aud"), at: now(), actor, action };
}

function seed(): InterviewSession[] {
  const base: InterviewSession = {
    id: "ses_demo1",
    title: "Design a URL shortener — Senior BE",
    prompt:
      "Design a URL shortening service handling 10k writes/s and 100k reads/s. Discuss data model, key generation, caching and analytics.",
    state: "draft",
    candidateEditingEnabled: true,
    ownerName: CURRENT_USER.displayName,
    createdAt: now(),
    updatedAt: now(),
    startedAt: null,
    endedAt: null,
    participants: [
      {
        id: "par_owner",
        displayName: CURRENT_USER.displayName,
        role: "owner",
        isGuest: false,
        joinedAt: now(),
        leftAt: null,
        color: PRESENCE_COLORS[0]!,
      },
    ],
    guestLinks: [],
    audit: [audit(CURRENT_USER.displayName, "Session created")],
    doc: emptyDoc(),
  };
  return [base];
}

function readAll(): InterviewSession[] {
  if (!canUseStorage()) return [];
  const raw = window.localStorage.getItem(KEY);
  if (!raw) {
    const seeded = seed();
    window.localStorage.setItem(KEY, JSON.stringify(seeded));
    return seeded;
  }
  try {
    return JSON.parse(raw) as InterviewSession[];
  } catch {
    return [];
  }
}

function writeAll(sessions: InterviewSession[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(KEY, JSON.stringify(sessions));
}

function mutate(id: string, fn: (s: InterviewSession) => void): InterviewSession {
  const all = readAll();
  const found = all.find((s) => s.id === id);
  if (!found) throw new Error("Session not found (404)");
  fn(found);
  found.updatedAt = now();
  writeAll(all);
  return structuredClone(found);
}

// --- GET /v1/sessions -------------------------------------------------------
export async function listSessions(): Promise<InterviewSession[]> {
  await delay();
  return readAll()
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

// --- GET /v1/sessions/{id} --------------------------------------------------
export async function getSession(id: string): Promise<InterviewSession> {
  await delay();
  const found = readAll().find((s) => s.id === id);
  if (!found) throw new Error("This session does not exist or you do not have access to it.");
  return structuredClone(found);
}

// --- POST /v1/sessions ------------------------------------------------------
export async function createSession(input: { title: string; prompt: string }): Promise<InterviewSession> {
  await delay(220);
  const all = readAll();
  const session: InterviewSession = {
    id: uid("ses"),
    title: input.title.trim() || "Untitled system design interview",
    prompt: input.prompt.trim(),
    state: "draft",
    candidateEditingEnabled: true,
    ownerName: CURRENT_USER.displayName,
    createdAt: now(),
    updatedAt: now(),
    startedAt: null,
    endedAt: null,
    participants: [
      {
        id: uid("par"),
        displayName: CURRENT_USER.displayName,
        role: "owner",
        isGuest: false,
        joinedAt: now(),
        leftAt: null,
        color: PRESENCE_COLORS[0]!,
      },
    ],
    guestLinks: [],
    audit: [audit(CURRENT_USER.displayName, "Session created")],
    doc: emptyDoc(),
  };
  all.unshift(session);
  writeAll(all);
  return structuredClone(session);
}

// --- PATCH /v1/sessions/{id} ------------------------------------------------
export async function updateSession(
  id: string,
  patch: Partial<Pick<InterviewSession, "title" | "prompt" | "candidateEditingEnabled">>,
): Promise<InterviewSession> {
  await delay();
  return mutate(id, (s) => {
    if (patch.title !== undefined) s.title = patch.title;
    if (patch.prompt !== undefined) s.prompt = patch.prompt;
    if (patch.candidateEditingEnabled !== undefined) {
      s.candidateEditingEnabled = patch.candidateEditingEnabled;
      s.audit.unshift(
        audit(
          CURRENT_USER.displayName,
          patch.candidateEditingEnabled ? "Candidate editing unlocked" : "Candidate editing locked",
        ),
      );
    }
  });
}

// --- POST /v1/sessions/{id}/start | /end ------------------------------------
export async function startSession(id: string) {
  await delay();
  return mutate(id, (s) => {
    s.state = "live";
    s.startedAt = now();
    s.audit.unshift(audit(CURRENT_USER.displayName, "Session started"));
  });
}

export async function endSession(id: string) {
  await delay();
  return mutate(id, (s) => {
    s.state = "ended";
    s.endedAt = now();
    s.audit.unshift(audit(CURRENT_USER.displayName, "Session ended — final snapshot saved"));
  });
}

// --- POST /v1/sessions/{id}/guest-links ------------------------------------
export async function createGuestLink(id: string, roleGranted: Role = "candidate"): Promise<GuestLink> {
  await delay(180);
  let created: GuestLink | null = null;
  mutate(id, (s) => {
    s.guestLinks.forEach((l) => {
      if (!l.revokedAt && l.roleGranted === roleGranted) l.revokedAt = now();
    });
    created = {
      id: uid("lnk"),
      token: uid("tok") + uid("tok"),
      roleGranted,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
      maxUses: 5,
      uses: 0,
      revokedAt: null,
      createdAt: now(),
    };
    s.guestLinks.unshift(created);
    s.audit.unshift(audit(CURRENT_USER.displayName, `${roleGranted} link generated`));
  });
  return created!;
}

// --- DELETE /v1/sessions/{id}/guest-links/{linkId} -------------------------
export async function revokeGuestLink(id: string, linkId: string) {
  await delay();
  return mutate(id, (s) => {
    const link = s.guestLinks.find((l) => l.id === linkId);
    if (link) link.revokedAt = now();
    s.audit.unshift(audit(CURRENT_USER.displayName, "Guest link revoked"));
  });
}

// --- POST /v1/join/{token} -------------------------------------------------
export async function joinWithToken(
  token: string,
  displayName: string,
): Promise<{ session: InterviewSession; participant: Participant }> {
  await delay(240);
  const all = readAll();
  const session = all.find((s) => s.guestLinks.some((l) => l.token === token));
  const link = session?.guestLinks.find((l) => l.token === token);
  if (!session || !link) throw new Error("This invite link is not valid.");
  if (link.revokedAt) throw new Error("This invite link has been revoked.");
  if (new Date(link.expiresAt) < new Date()) throw new Error("This invite link has expired.");
  if (link.uses >= link.maxUses) throw new Error("This invite link has reached its maximum number of uses.");
  if (session.participants.filter((p) => !p.leftAt).length >= 10)
    throw new Error("This session is full (10 participants).");

  const participant: Participant = {
    id: uid("par"),
    displayName: displayName.trim() || "Guest candidate",
    role: link.roleGranted,
    isGuest: true,
    joinedAt: now(),
    leftAt: null,
    color: PRESENCE_COLORS[session.participants.length % PRESENCE_COLORS.length]!,
  };
  link.uses += 1;
  session.participants.push(participant);
  session.audit.unshift(audit(participant.displayName, `Joined as ${participant.role}`));
  session.updatedAt = now();
  writeAll(all);
  return { session: structuredClone(session), participant };
}

export async function removeParticipant(id: string, participantId: string) {
  await delay();
  return mutate(id, (s) => {
    const p = s.participants.find((x) => x.id === participantId);
    if (p) {
      p.leftAt = now();
      s.audit.unshift(audit(CURRENT_USER.displayName, `Removed ${p.displayName}`));
    }
  });
}

// --- GET/PUT /v1/sessions/{id}/canvas -------------------------------------
export async function loadCanvas(id: string): Promise<CanvasDoc> {
  const s = await getSession(id);
  return s.doc;
}

/** Stands in for the WebSocket `document_update` + persistence worker. */
export async function saveCanvas(id: string, doc: CanvasDoc): Promise<{ savedAt: string }> {
  await delay(90);
  mutate(id, (s) => {
    s.doc = doc;
  });
  return { savedAt: now() };
}

// --- POST /v1/sessions/{id}/duplicate -------------------------------------
export async function duplicateSession(id: string): Promise<InterviewSession> {
  await delay(220);
  const source = await getSession(id);
  const all = readAll();
  const copy: InterviewSession = {
    ...structuredClone(source),
    id: uid("ses"),
    title: `${source.title} (template copy)`,
    state: "draft",
    createdAt: now(),
    updatedAt: now(),
    startedAt: null,
    endedAt: null,
    guestLinks: [],
    participants: source.participants.filter((p) => p.role === "owner"),
    audit: [audit(CURRENT_USER.displayName, `Duplicated from ${source.id}`)],
  };
  all.unshift(copy);
  writeAll(all);
  return copy;
}

export async function deleteSession(id: string) {
  await delay();
  writeAll(readAll().filter((s) => s.id !== id));
}
