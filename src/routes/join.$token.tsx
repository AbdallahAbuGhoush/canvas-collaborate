import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { LogIn } from "lucide-react";
import { joinWithToken } from "@/lib/mock-api";

export const Route = createFileRoute("/join/$token")({
  head: () => ({
    meta: [
      { title: "Join interview session — Interview Board" },
      {
        name: "description",
        content: "Enter your display name to join the shared system design canvas as a guest candidate.",
      },
      { property: "og:title", content: "Join interview session — Interview Board" },
      { property: "og:description", content: "Join the shared system design canvas as a guest." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: JoinPage,
});

function JoinPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [name, setName] = useState("");

  const join = useMutation({
    mutationFn: () => joinWithToken(token, name),
    onSuccess: ({ session, participant }) => {
      navigate({
        to: "/sessions/$sessionId",
        params: { sessionId: session.id },
        search: { p: participant.id },
      });
    },
  });

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="panel w-full max-w-sm space-y-4 p-6">
        <div>
          <p className="label-caps">Interview lobby</p>
          <h1 className="mt-1 text-xl font-semibold">Join the session</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            No account needed. Your name is shown to everyone on the canvas.
          </p>
        </div>
        <label className="block space-y-1">
          <span className="label-caps">Display name</span>
          <input
            className="field"
            value={name}
            autoFocus
            placeholder="Alex Doe"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) join.mutate();
            }}
          />
        </label>
        {join.isError && (
          <p className="text-sm text-destructive">{(join.error as Error).message}</p>
        )}
        <button
          className="btn-base btn-primary w-full"
          disabled={join.isPending || !name.trim()}
          onClick={() => join.mutate()}
        >
          <LogIn className="h-4 w-4" />
          {join.isPending ? "Joining…" : "Enter canvas"}
        </button>
      </div>
    </div>
  );
}
