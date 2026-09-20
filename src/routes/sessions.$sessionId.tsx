import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  Link2,
  Lock,
  Play,
  Square,
  Unlock,
  UserMinus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { CanvasWorkspace } from "@/components/canvas/CanvasWorkspace";
import { StateChip } from "./index";
import type { CanvasDoc } from "@/lib/canvas-doc";
import {
  createGuestLink,
  endSession,
  getSession,
  removeParticipant,
  revokeGuestLink,
  saveCanvas,
  startSession,
  updateSession,
} from "@/lib/mock-api";

export const Route = createFileRoute("/sessions/$sessionId")({
  validateSearch: (search: Record<string, unknown>): { p?: string } =>
    typeof search["p"] === "string" ? { p: search["p"] } : {},
  head: () => ({
    meta: [
      { title: "Session canvas — Interview Board" },
      {
        name: "description",
        content:
          "Shared infinite canvas for a system design interview: components, connectors, freehand notes and live cursors.",
      },
      { property: "og:title", content: "Session canvas — Interview Board" },
      { property: "og:description", content: "Collaborate live on a system design interview canvas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SessionPage,
});

function SessionPage() {
  const { sessionId } = Route.useParams();
  const { p: participantId } = Route.useSearch();
  const qc = useQueryClient();

  const { data: session, isLoading, error } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => getSession(sessionId),
  });

  const [doc, setDoc] = useState<CanvasDoc | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (session && !doc) setDoc(session.doc);
  }, [session, doc]);

  const persist = useCallback(
    (next: CanvasDoc) => {
      setDirty(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const res = await saveCanvas(sessionId, next);
        setSavedAt(res.savedAt);
        setDirty(false);
      }, 600);
    },
    [sessionId],
  );

  const handleChange = useCallback(
    (next: CanvasDoc) => {
      setDoc(next);
      persist(next);
    },
    [persist],
  );

  const refresh = () => qc.invalidateQueries({ queryKey: ["session", sessionId] });

  const patch = useMutation({
    mutationFn: (input: Parameters<typeof updateSession>[1]) => updateSession(sessionId, input),
    onSuccess: refresh,
  });
  const start = useMutation({ mutationFn: () => startSession(sessionId), onSuccess: refresh });
  const end = useMutation({
    mutationFn: () => endSession(sessionId),
    onSuccess: () => {
      refresh();
      toast.success("Session ended — final snapshot saved");
    },
  });
  const newLink = useMutation({
    mutationFn: () => createGuestLink(sessionId, "candidate"),
    onSuccess: () => {
      refresh();
      toast.success("Candidate link generated");
    },
  });
  const revoke = useMutation({
    mutationFn: (linkId: string) => revokeGuestLink(sessionId, linkId),
    onSuccess: () => {
      refresh();
      toast.success("Link revoked — existing participants stay connected");
    },
  });
  const kick = useMutation({
    mutationFn: (pid: string) => removeParticipant(sessionId, pid),
    onSuccess: refresh,
  });

  const me = useMemo(
    () => session?.participants.find((x) => x.id === participantId) ?? null,
    [session, participantId],
  );
  const isOwner = !participantId;
  const activeLink = session?.guestLinks.find((l) => !l.revokedAt) ?? null;

  const readOnly = !session
    ? true
    : session.state === "ended"
      ? true
      : isOwner
        ? false
        : me?.role === "observer"
          ? true
          : me?.role === "candidate"
            ? !session.candidateEditingEnabled
            : false;

  const readOnlyReason =
    session?.state === "ended"
      ? "Session ended — canvas is read-only"
      : me?.role === "observer"
        ? "You are an observer — view only"
        : "The interviewer has locked editing";

  if (isLoading || !session || !doc) {
    return (
      <div className="grid min-h-screen place-items-center">
        <p className="text-sm text-muted-foreground">
          {error ? (error as Error).message : "Loading session…"}
        </p>
      </div>
    );
  }

  const shareUrl = activeLink ? `${window.location.origin}/join/${activeLink.token}` : "";

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center gap-4 border-b border-border bg-sidebar px-4 py-2.5">
        <Link to="/" className="btn-base btn-ghost !px-2.5" title="Back to dashboard">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <input
              className="min-w-0 max-w-md truncate border-none bg-transparent font-display text-sm font-semibold outline-none"
              defaultValue={session.title}
              disabled={!isOwner}
              onBlur={(e) => e.target.value !== session.title && patch.mutate({ title: e.target.value })}
            />
            <StateChip state={session.state} />
          </div>
          <p className="label-caps">
            {isOwner ? "owner · interviewer" : `${me?.displayName ?? "guest"} · ${me?.role ?? "candidate"}`}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {dirty ? "Saving…" : savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString()}` : "Synced"}
          </span>
          <div className="flex -space-x-2">
            {session.participants
              .filter((x) => !x.leftAt)
              .map((x) => (
                <span
                  key={x.id}
                  title={`${x.displayName} · ${x.role}`}
                  className="grid h-7 w-7 place-items-center rounded-full border-2 border-sidebar text-[11px] font-semibold text-background"
                  style={{ backgroundColor: x.color }}
                >
                  {x.displayName.slice(0, 1).toUpperCase()}
                </span>
              ))}
          </div>
          {isOwner && (
            <>
              {session.state === "draft" && (
                <button className="btn-base btn-primary" onClick={() => start.mutate()}>
                  <Play className="h-4 w-4" /> Start
                </button>
              )}
              {session.state === "live" && (
                <button className="btn-base btn-ghost" onClick={() => end.mutate()}>
                  <Square className="h-4 w-4" /> End
                </button>
              )}
              <button
                className="btn-base btn-ghost"
                onClick={() => patch.mutate({ candidateEditingEnabled: !session.candidateEditingEnabled })}
              >
                {session.candidateEditingEnabled ? (
                  <>
                    <Unlock className="h-4 w-4" /> Unlocked
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" /> Locked
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <CanvasWorkspace
            doc={doc}
            onChange={handleChange}
            readOnly={readOnly}
            readOnlyReason={readOnlyReason}
            participants={session.participants}
            selfName={me?.displayName ?? session.ownerName}
          />
        </div>

        <aside className="flex w-[19rem] shrink-0 flex-col gap-4 overflow-y-auto border-l border-border bg-sidebar p-4">
          <section className="space-y-1.5">
            <p className="label-caps">Problem statement</p>
            {isOwner ? (
              <textarea
                className="field min-h-32 text-[0.85rem]"
                defaultValue={session.prompt}
                onBlur={(e) => e.target.value !== session.prompt && patch.mutate({ prompt: e.target.value })}
              />
            ) : (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {session.prompt || "The interviewer has not shared a prompt yet."}
              </p>
            )}
          </section>

          {isOwner && (
            <section className="space-y-2">
              <p className="label-caps">Candidate link</p>
              {activeLink ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <input readOnly value={shareUrl} className="field font-mono !text-[0.68rem]" />
                    <button
                      className="btn-base btn-ghost !px-2.5"
                      title="Copy link"
                      onClick={() => {
                        navigator.clipboard.writeText(shareUrl);
                        toast.success("Link copied");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-[0.7rem] text-muted-foreground">
                    {activeLink.uses}/{activeLink.maxUses} uses · expires{" "}
                    {new Date(activeLink.expiresAt).toLocaleString()}
                  </p>
                  <div className="flex gap-2">
                    <button className="btn-base btn-ghost flex-1" onClick={() => newLink.mutate()}>
                      <Link2 className="h-4 w-4" /> Rotate
                    </button>
                    <button className="btn-base btn-danger flex-1" onClick={() => revoke.mutate(activeLink.id)}>
                      <X className="h-4 w-4" /> Revoke
                    </button>
                  </div>
                </>
              ) : (
                <button className="btn-base btn-primary w-full" onClick={() => newLink.mutate()}>
                  <Link2 className="h-4 w-4" /> Generate candidate link
                </button>
              )}
            </section>
          )}

          <section className="space-y-2">
            <p className="label-caps">Participants ({session.participants.filter((x) => !x.leftAt).length}/10)</p>
            <ul className="space-y-1.5">
              {session.participants.map((x) => (
                <li key={x.id} className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: x.color }} />
                  <span className={x.leftAt ? "text-muted-foreground line-through" : ""}>{x.displayName}</span>
                  <span className="label-caps ml-auto">{x.role}</span>
                  {isOwner && x.role !== "owner" && !x.leftAt && (
                    <button
                      className="text-muted-foreground hover:text-destructive"
                      title="Remove participant"
                      onClick={() => kick.mutate(x.id)}
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-2">
            <p className="label-caps">Canvas document</p>
            <button
              className="btn-base btn-ghost w-full"
              onClick={() => {
                const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${sessionId}-canvas.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="h-4 w-4" /> Export JSON
            </button>
            {isOwner && (
              <button
                className="btn-base btn-danger w-full"
                onClick={() => {
                  handleChange({ ...doc, nodes: [], edges: [], strokes: [] });
                  toast.success("Canvas cleared");
                }}
              >
                Clear canvas
              </button>
            )}
          </section>

          {isOwner && (
            <section className="space-y-1.5">
              <p className="label-caps">Audit trail</p>
              <ul className="space-y-1 text-[0.72rem] text-muted-foreground">
                {session.audit.slice(0, 8).map((a) => (
                  <li key={a.id} className="flex gap-1.5">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                    <span>
                      {a.action} — {a.actor} · {new Date(a.at).toLocaleTimeString()}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
