import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Copy, Download, PenLine, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import {
  createSession,
  deleteSession,
  duplicateSession,
  listSessions,
  CURRENT_USER,
  type InterviewSession,
} from "@/lib/mock-api";
import { countElements } from "@/lib/canvas-doc";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Interview board — collaborative system design interviews" },
      {
        name: "description",
        content:
          "Run system design interviews on a shared infinite canvas: component palette, smart connectors, freehand drawing and live participant cursors.",
      },
      { property: "og:title", content: "Interview board — collaborative system design interviews" },
      {
        property: "og:description",
        content: "Create a session, share a candidate link and design together on an infinite canvas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: listSessions,
  });

  const create = useMutation({
    mutationFn: () => createSession({ title, prompt }),
    onSuccess: (s) => {
      setTitle("");
      setPrompt("");
      qc.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Session created");
      navigate({ to: "/sessions/$sessionId", params: { sessionId: s.id } });
    },
  });

  const dup = useMutation({
    mutationFn: duplicateSession,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Duplicated as a new draft");
    },
  });

  const del = useMutation({
    mutationFn: deleteSession,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Session deleted");
    },
  });

  const exportJson = (s: InterviewSession) => {
    const blob = new Blob([JSON.stringify({ session: s.id, title: s.title, document: s.doc }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${s.id}-canvas.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-sidebar">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-primary font-display text-sm font-bold text-primary-foreground">
              ID
            </span>
            <div>
              <p className="font-display text-sm font-semibold">Interview Board</p>
              <p className="label-caps">system design sessions</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{CURRENT_USER.email}</p>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[1fr_20rem]">
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h1 className="text-2xl font-semibold">Your sessions</h1>
            <span className="label-caps">{sessions.length} total</span>
          </div>

          {isLoading && <p className="text-sm text-muted-foreground">Loading sessions…</p>}

          <ul className="space-y-3">
            {sessions.map((s) => (
              <li key={s.id} className="panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to="/sessions/$sessionId"
                      params={{ sessionId: s.id }}
                      className="font-display text-base font-semibold hover:text-primary"
                    >
                      {s.title}
                    </Link>
                    <p className="mt-1 line-clamp-2 max-w-xl text-sm text-muted-foreground">
                      {s.prompt || "No problem statement yet."}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StateChip state={s.state} />
                      <span className="chip">
                        <Users className="h-3 w-3" />
                        {s.participants.filter((p) => !p.leftAt).length}/10
                      </span>
                      <span className="chip">{countElements(s.doc)} elements</span>
                      <span className="chip">{s.candidateEditingEnabled ? "unlocked" : "locked"}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Link
                      to="/sessions/$sessionId"
                      params={{ sessionId: s.id }}
                      className="btn-base btn-primary"
                    >
                      <PenLine className="h-4 w-4" /> Open
                    </Link>
                    <button className="btn-base btn-ghost" onClick={() => dup.mutate(s.id)} title="Duplicate as template">
                      <Copy className="h-4 w-4" />
                    </button>
                    <button className="btn-base btn-ghost" onClick={() => exportJson(s)} title="Export canvas JSON">
                      <Download className="h-4 w-4" />
                    </button>
                    <button className="btn-base btn-danger" onClick={() => del.mutate(s.id)} title="Delete session">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {!isLoading && sessions.length === 0 && (
            <p className="panel p-6 text-sm text-muted-foreground">
              No sessions yet — create one on the right to get started.
            </p>
          )}
        </section>

        <aside className="panel h-fit space-y-3 p-4">
          <h2 className="font-display text-base font-semibold">New session</h2>
          <label className="block space-y-1">
            <span className="label-caps">Title</span>
            <input
              className="field"
              value={title}
              placeholder="Design a rate limiter — Staff"
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="label-caps">Problem statement</span>
            <textarea
              className="field min-h-28"
              value={prompt}
              placeholder="What should the candidate design? Constraints, scale, focus areas…"
              onChange={(e) => setPrompt(e.target.value)}
            />
          </label>
          <button
            className="btn-base btn-primary w-full"
            disabled={create.isPending || title.trim().length === 0}
            onClick={() => create.mutate()}
          >
            <Plus className="h-4 w-4" />
            {create.isPending ? "Creating…" : "Create session"}
          </button>
          <p className="text-xs text-muted-foreground">
            Sessions, links and canvases run against a mocked backend in this build, so data stays in your
            browser until the real service is wired in.
          </p>
        </aside>
      </main>
    </div>
  );
}

export function StateChip({ state }: { state: InterviewSession["state"] }) {
  const styles =
    state === "live"
      ? "border-primary text-primary"
      : state === "ended"
        ? "border-border text-muted-foreground"
        : "border-warn text-warn";
  return <span className={`chip ${styles}`}>{state}</span>;
}
