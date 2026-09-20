import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Eraser,
  Hand,
  Lock,
  MousePointer2,
  Pen,
  Redo2,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { NodeGlyph } from "@/components/NodeGlyph";
import {
  NODE_PRESETS,
  countElements,
  edgeGeometry,
  emptyDoc,
  strokeBounds,
  strokePath,
  uid,
  type CanvasDoc,
  type CanvasNode,
  type NodeKind,
} from "@/lib/canvas-doc";
import type { Participant } from "@/lib/mock-api";

type Tool = "select" | "pan" | "pen" | "eraser" | "connect";

const PALETTE: NodeKind[] = [
  "client",
  "gateway",
  "service",
  "queue",
  "database",
  "cache",
  "storage",
  "llm",
  "note",
];

const PEN_COLORS = ["#22d3ee", "#f59e0b", "#a78bfa", "#34d399", "#f87171", "#e2e8f0"];

interface View {
  x: number;
  y: number;
  k: number;
}

export interface CanvasWorkspaceProps {
  doc: CanvasDoc;
  onChange: (doc: CanvasDoc) => void;
  readOnly?: boolean;
  readOnlyReason?: string;
  participants: Participant[];
  selfName: string;
}

export function CanvasWorkspace({
  doc,
  onChange,
  readOnly = false,
  readOnlyReason,
  participants,
  selfName,
}: CanvasWorkspaceProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [tool, setTool] = useState<Tool>("select");
  const [penColor, setPenColor] = useState(PEN_COLORS[0]!);
  const [penWidth, setPenWidth] = useState(3);
  const [selection, setSelection] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<null | { x0: number; y0: number; x1: number; y1: number }>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [cursorWorld, setCursorWorld] = useState({ x: 0, y: 0 });

  const past = useRef<CanvasDoc[]>([]);
  const future = useRef<CanvasDoc[]>([]);
  const [historyTick, setHistoryTick] = useState(0);
  const clipboard = useRef<CanvasNode[] | null>(null);

  const drag = useRef<null | {
    mode: "move" | "resize" | "pan" | "marquee" | "draw";
    startWorld: { x: number; y: number };
    startScreen: { x: number; y: number };
    base: CanvasDoc;
    baseView: View;
    ids?: string[];
    strokeId?: string;
  }>(null);

  const docRef = useRef(doc);
  docRef.current = doc;

  // ---------------- coordinate helpers ----------------
  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return { x: (clientX - rect.left - view.x) / view.k, y: (clientY - rect.top - view.y) / view.k };
    },
    [view],
  );

  const commit = useCallback(
    (next: CanvasDoc) => {
      past.current = [...past.current.slice(-59), structuredClone(docRef.current)];
      future.current = [];
      setHistoryTick((t) => t + 1);
      onChange(next);
    },
    [onChange],
  );

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(structuredClone(docRef.current));
    setHistoryTick((t) => t + 1);
    onChange(prev);
  }, [onChange]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(structuredClone(docRef.current));
    setHistoryTick((t) => t + 1);
    onChange(next);
  }, [onChange]);

  // ---------------- element creation ----------------
  const addNode = useCallback(
    (kind: NodeKind, at?: { x: number; y: number }) => {
      if (readOnly) return;
      const preset = NODE_PRESETS[kind];
      const rect = svgRef.current?.getBoundingClientRect();
      const center = at ?? {
        x: ((rect?.width ?? 800) / 2 - view.x) / view.k,
        y: ((rect?.height ?? 600) / 2 - view.y) / view.k,
      };
      const node: CanvasNode = {
        id: uid("nd"),
        kind,
        x: Math.round(center.x - preset.w / 2),
        y: Math.round(center.y - preset.h / 2),
        w: preset.w,
        h: preset.h,
        label: preset.label,
      };
      commit({ ...doc, nodes: [...doc.nodes, node] });
      setSelection([node.id]);
      setTool("select");
    },
    [commit, doc, readOnly, view],
  );

  const deleteSelection = useCallback(() => {
    if (readOnly || selection.length === 0) return;
    const ids = new Set(selection);
    commit({
      ...doc,
      nodes: doc.nodes.filter((n) => !ids.has(n.id)),
      strokes: doc.strokes.filter((s) => !ids.has(s.id)),
      edges: doc.edges.filter((e) => !ids.has(e.id) && !ids.has(e.from) && !ids.has(e.to)),
    });
    setSelection([]);
  }, [commit, doc, readOnly, selection]);

  // ---------------- keyboard ----------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (meta && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (meta && e.key.toLowerCase() === "c") {
        clipboard.current = docRef.current.nodes.filter((n) => selection.includes(n.id));
        return;
      }
      if (meta && e.key.toLowerCase() === "v") {
        if (readOnly || !clipboard.current?.length) return;
        e.preventDefault();
        const copies = clipboard.current.map((n) => ({ ...n, id: uid("nd"), x: n.x + 28, y: n.y + 28 }));
        commit({ ...docRef.current, nodes: [...docRef.current.nodes, ...copies] });
        setSelection(copies.map((c) => c.id));
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelection();
        return;
      }
      if (e.key === "Escape") {
        setSelection([]);
        setConnectFrom(null);
        setEditingId(null);
      }
      if (e.key === "v") setTool("select");
      if (e.key === "h") setTool("pan");
      if (e.key === "p") setTool("pen");
      if (e.key === "e") setTool("eraser");
      if (e.key === "c") setTool("connect");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commit, deleteSelection, readOnly, redo, selection, undo]);

  // ---------------- pointer interactions ----------------
  const hitStrokes = (world: { x: number; y: number }, radius: number) =>
    doc.strokes.filter((s) => {
      for (let i = 0; i < s.points.length; i += 2) {
        if (Math.hypot(s.points[i]! - world.x, s.points[i + 1]! - world.y) < radius) return true;
      }
      return false;
    });

  const onBackgroundPointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || tool === "pan" || e.altKey) {
      drag.current = {
        mode: "pan",
        startWorld: { x: 0, y: 0 },
        startScreen: { x: e.clientX, y: e.clientY },
        base: doc,
        baseView: view,
      };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    const world = toWorld(e.clientX, e.clientY);
    if (tool === "pen" && !readOnly) {
      const id = uid("st");
      const next = {
        ...doc,
        strokes: [...doc.strokes, { id, color: penColor, width: penWidth, points: [world.x, world.y] }],
      };
      past.current = [...past.current.slice(-59), structuredClone(doc)];
      future.current = [];
      onChange(next);
      drag.current = {
        mode: "draw",
        startWorld: world,
        startScreen: { x: e.clientX, y: e.clientY },
        base: doc,
        baseView: view,
        strokeId: id,
      };
      return;
    }
    if (tool === "eraser" && !readOnly) {
      const hits = hitStrokes(world, 14 / view.k);
      if (hits.length) {
        const ids = new Set(hits.map((h) => h.id));
        commit({ ...doc, strokes: doc.strokes.filter((s) => !ids.has(s.id)) });
      }
      return;
    }
    setSelection([]);
    setConnectFrom(null);
    setMarquee({ x0: world.x, y0: world.y, x1: world.x, y1: world.y });
    drag.current = {
      mode: "marquee",
      startWorld: world,
      startScreen: { x: e.clientX, y: e.clientY },
      base: doc,
      baseView: view,
    };
  };

  const onNodePointerDown = (e: React.PointerEvent, node: CanvasNode) => {
    e.stopPropagation();
    if (tool === "connect" && !readOnly) {
      if (!connectFrom) setConnectFrom(node.id);
      else if (connectFrom !== node.id) {
        commit({
          ...doc,
          edges: [...doc.edges, { id: uid("eg"), from: connectFrom, to: node.id, label: "" }],
        });
        setConnectFrom(null);
      }
      return;
    }
    if (tool !== "select") return;
    const ids = e.shiftKey
      ? selection.includes(node.id)
        ? selection.filter((i) => i !== node.id)
        : [...selection, node.id]
      : selection.includes(node.id)
        ? selection
        : [node.id];
    setSelection(ids);
    if (readOnly) return;
    drag.current = {
      mode: "move",
      startWorld: toWorld(e.clientX, e.clientY),
      startScreen: { x: e.clientX, y: e.clientY },
      base: structuredClone(doc),
      baseView: view,
      ids: ids.filter((i) => doc.nodes.some((n) => n.id === i)),
    };
  };

  const onResizePointerDown = (e: React.PointerEvent, node: CanvasNode) => {
    e.stopPropagation();
    if (readOnly) return;
    drag.current = {
      mode: "resize",
      startWorld: toWorld(e.clientX, e.clientY),
      startScreen: { x: e.clientX, y: e.clientY },
      base: structuredClone(doc),
      baseView: view,
      ids: [node.id],
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const world = toWorld(e.clientX, e.clientY);
    setCursorWorld(world);
    const d = drag.current;
    if (!d) return;
    if (d.mode === "pan") {
      setView({
        ...d.baseView,
        x: d.baseView.x + (e.clientX - d.startScreen.x),
        y: d.baseView.y + (e.clientY - d.startScreen.y),
      });
      return;
    }
    if (d.mode === "draw" && d.strokeId) {
      const current = docRef.current;
      onChange({
        ...current,
        strokes: current.strokes.map((s) =>
          s.id === d.strokeId ? { ...s, points: [...s.points, world.x, world.y] } : s,
        ),
      });
      return;
    }
    if (d.mode === "marquee") {
      setMarquee({ x0: d.startWorld.x, y0: d.startWorld.y, x1: world.x, y1: world.y });
      return;
    }
    if (d.mode === "move" && d.ids) {
      const dx = world.x - d.startWorld.x;
      const dy = world.y - d.startWorld.y;
      const ids = new Set(d.ids);
      onChange({
        ...docRef.current,
        nodes: d.base.nodes.map((n) =>
          ids.has(n.id) ? { ...n, x: Math.round(n.x + dx), y: Math.round(n.y + dy) } : n,
        ),
        strokes: d.base.strokes.map((s) =>
          ids.has(s.id)
            ? { ...s, points: s.points.map((p, i) => (i % 2 === 0 ? p + dx : p + dy)) }
            : s,
        ),
      });
      return;
    }
    if (d.mode === "resize" && d.ids) {
      const id = d.ids[0]!;
      const dx = world.x - d.startWorld.x;
      const dy = world.y - d.startWorld.y;
      onChange({
        ...docRef.current,
        nodes: d.base.nodes.map((n) =>
          n.id === id
            ? { ...n, w: Math.max(80, Math.round(n.w + dx)), h: Math.max(48, Math.round(n.h + dy)) }
            : n,
        ),
      });
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.mode === "marquee" && marquee) {
      const x0 = Math.min(marquee.x0, marquee.x1);
      const x1 = Math.max(marquee.x0, marquee.x1);
      const y0 = Math.min(marquee.y0, marquee.y1);
      const y1 = Math.max(marquee.y0, marquee.y1);
      const picked = [
        ...doc.nodes.filter((n) => n.x + n.w > x0 && n.x < x1 && n.y + n.h > y0 && n.y < y1).map((n) => n.id),
        ...doc.strokes
          .filter((s) => {
            const b = strokeBounds(s);
            return b.maxX > x0 && b.minX < x1 && b.maxY > y0 && b.minY < y1;
          })
          .map((s) => s.id),
      ];
      setSelection(picked);
      setMarquee(null);
      return;
    }
    if (d.mode === "move" || d.mode === "resize") {
      past.current = [...past.current.slice(-59), d.base];
      future.current = [];
      setHistoryTick((t) => t + 1);
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      const factor = Math.exp(-e.deltaY * 0.0016);
      const k = Math.min(3, Math.max(0.25, view.k * factor));
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      setView({ k, x: sx - ((sx - view.x) * k) / view.k, y: sy - ((sy - view.y) * k) / view.k });
    } else {
      setView({ ...view, x: view.x - e.deltaX, y: view.y - e.deltaY });
    }
  };

  const zoomBy = (factor: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    const sx = (rect?.width ?? 800) / 2;
    const sy = (rect?.height ?? 600) / 2;
    const k = Math.min(3, Math.max(0.25, view.k * factor));
    setView({ k, x: sx - ((sx - view.x) * k) / view.k, y: sy - ((sy - view.y) * k) / view.k });
  };

  // ---------------- simulated remote presence ----------------
  const others = useMemo(
    () => participants.filter((p) => !p.leftAt && p.displayName !== selfName).slice(0, 6),
    [participants, selfName],
  );
  const [ghosts, setGhosts] = useState<Record<string, { x: number; y: number }>>({});
  useEffect(() => {
    if (others.length === 0) return;
    let raf = 0;
    const start = performance.now();
    const loop = (t: number) => {
      const s = (t - start) / 1000;
      const next: Record<string, { x: number; y: number }> = {};
      others.forEach((p, i) => {
        next[p.id] = {
          x: 220 + Math.cos(s * 0.4 + i * 1.7) * (160 + i * 40),
          y: 200 + Math.sin(s * 0.33 + i * 2.1) * (120 + i * 30),
        };
      });
      setGhosts(next);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [others]);

  const selected = new Set(selection);
  const cursorStyle =
    tool === "pan" ? "grab" : tool === "pen" || tool === "eraser" ? "crosshair" : "default";

  return (
    <div className="flex h-full min-h-0 w-full">
      {/* Palette */}
      <aside className="flex w-[13.5rem] shrink-0 flex-col gap-3 border-r border-border bg-sidebar p-3">
        <p className="label-caps">Components</p>
        <div className="grid grid-cols-2 gap-2">
          {PALETTE.map((kind) => (
            <button
              key={kind}
              type="button"
              disabled={readOnly}
              onClick={() => addNode(kind)}
              title={NODE_PRESETS[kind].title}
              className="btn-base btn-ghost !flex-col !items-start !gap-1.5 !px-2.5 !py-2.5 text-left disabled:opacity-40"
            >
              <NodeGlyph kind={kind} className="h-4 w-4 text-primary" />
              <span className="text-xs leading-tight">{NODE_PRESETS[kind].label}</span>
            </button>
          ))}
        </div>

        <div className="mt-2 space-y-2">
          <p className="label-caps">Pen</p>
          <div className="flex flex-wrap gap-1.5">
            {PEN_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Pen colour ${c}`}
                onClick={() => {
                  setPenColor(c);
                  setTool("pen");
                }}
                className="h-6 w-6 rounded-full border"
                style={{
                  backgroundColor: c,
                  borderColor: penColor === c ? "var(--color-foreground)" : "var(--color-border)",
                }}
              />
            ))}
          </div>
          <label className="block text-xs text-muted-foreground">
            Thickness · {penWidth}px
            <input
              type="range"
              min={1}
              max={12}
              value={penWidth}
              onChange={(e) => setPenWidth(Number(e.target.value))}
              className="mt-1 w-full accent-primary"
            />
          </label>
        </div>

        <div className="mt-auto space-y-1 text-[0.7rem] text-muted-foreground">
          <p>{countElements(doc)} elements</p>
          <p>Shortcuts: V move · C connect · P pen · E erase · H pan</p>
          <p>Alt-drag or middle mouse to pan, scroll to zoom.</p>
        </div>
      </aside>

      {/* Stage */}
      <div className="relative min-w-0 flex-1">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-3">
          <div className="panel pointer-events-auto flex items-center gap-1 p-1.5">
            <ToolButton active={tool === "select"} onClick={() => setTool("select")} label="Select (V)">
              <MousePointer2 className="h-4 w-4" />
            </ToolButton>
            <ToolButton active={tool === "pan"} onClick={() => setTool("pan")} label="Pan (H)">
              <Hand className="h-4 w-4" />
            </ToolButton>
            <ToolButton
              active={tool === "connect"}
              onClick={() => setTool("connect")}
              label="Connect (C)"
              disabled={readOnly}
            >
              <ArrowRight className="h-4 w-4" />
            </ToolButton>
            <ToolButton
              active={tool === "pen"}
              onClick={() => setTool("pen")}
              label="Pen (P)"
              disabled={readOnly}
            >
              <Pen className="h-4 w-4" />
            </ToolButton>
            <ToolButton
              active={tool === "eraser"}
              onClick={() => setTool("eraser")}
              label="Eraser (E)"
              disabled={readOnly}
            >
              <Eraser className="h-4 w-4" />
            </ToolButton>
            <span className="mx-1 h-6 w-px bg-border" />
            <ToolButton onClick={undo} label="Undo" disabled={readOnly || past.current.length === 0}>
              <Undo2 className="h-4 w-4" />
            </ToolButton>
            <ToolButton onClick={redo} label="Redo" disabled={readOnly || future.current.length === 0}>
              <Redo2 className="h-4 w-4" />
            </ToolButton>
            <ToolButton
              onClick={deleteSelection}
              label="Delete selection"
              disabled={readOnly || selection.length === 0}
            >
              <Trash2 className="h-4 w-4" />
            </ToolButton>
            <span className="mx-1 h-6 w-px bg-border" />
            <ToolButton onClick={() => zoomBy(1 / 1.2)} label="Zoom out">
              <ZoomOut className="h-4 w-4" />
            </ToolButton>
            <button
              type="button"
              onClick={() => setView({ x: 0, y: 0, k: 1 })}
              className="w-14 rounded-md px-1 py-1 font-mono text-xs text-muted-foreground hover:bg-accent"
            >
              {Math.round(view.k * 100)}%
            </button>
            <ToolButton onClick={() => zoomBy(1.2)} label="Zoom in">
              <ZoomIn className="h-4 w-4" />
            </ToolButton>
          </div>
        </div>

        {readOnly && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
            <p className="chip border-warn text-warn">
              <Lock className="h-3 w-3" /> {readOnlyReason ?? "Editing locked"}
            </p>
          </div>
        )}

        <svg
          ref={svgRef}
          className="h-full w-full touch-none select-none"
          style={{ cursor: cursorStyle, backgroundColor: "var(--color-background)" }}
          onPointerDown={onBackgroundPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onWheel={onWheel}
          role="application"
          aria-label="System design canvas"
        >
          <defs>
            <pattern
              id="grid"
              width={28 * view.k}
              height={28 * view.k}
              patternUnits="userSpaceOnUse"
              x={view.x}
              y={view.y}
            >
              <circle cx={1} cy={1} r={1} fill="var(--color-grid)" />
            </pattern>
            <marker id="arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-primary)" />
            </marker>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {/* edges */}
            {doc.edges.map((edge) => {
              const g = edgeGeometry(doc, edge);
              if (!g) return null;
              return (
                <g key={edge.id}>
                  <line
                    x1={g.start.x}
                    y1={g.start.y}
                    x2={g.end.x}
                    y2={g.end.y}
                    stroke="var(--color-primary)"
                    strokeWidth={1.8}
                    markerEnd="url(#arrow)"
                    opacity={0.85}
                  />
                  <line
                    x1={g.start.x}
                    y1={g.start.y}
                    x2={g.end.x}
                    y2={g.end.y}
                    stroke="transparent"
                    strokeWidth={14}
                    style={{ cursor: "pointer" }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelection([edge.id]);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (!readOnly) setEditingId(edge.id);
                    }}
                  />
                  {(edge.label || editingId === edge.id) && (
                    <foreignObject x={g.mid.x - 70} y={g.mid.y - 16} width={140} height={32}>
                      {editingId === edge.id ? (
                        <input
                          autoFocus
                          defaultValue={edge.label}
                          onBlur={(e) => {
                            commit({
                              ...doc,
                              edges: doc.edges.map((x) =>
                                x.id === edge.id ? { ...x, label: e.target.value } : x,
                              ),
                            });
                            setEditingId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                          className="w-full rounded border border-primary bg-card px-1 text-center text-[11px] text-foreground outline-none"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <span className="rounded bg-background/90 px-1.5 font-mono text-[10px] text-muted-foreground">
                            {edge.label}
                          </span>
                        </div>
                      )}
                    </foreignObject>
                  )}
                </g>
              );
            })}

            {/* strokes */}
            {doc.strokes.map((s) => (
              <path
                key={s.id}
                d={strokePath(s)}
                fill="none"
                stroke={s.color}
                strokeWidth={s.width}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={selected.has(s.id) ? 0.7 : 1}
              />
            ))}

            {/* nodes */}
            {doc.nodes.map((node) => {
              const preset = NODE_PRESETS[node.kind];
              const isSel = selected.has(node.id);
              const isNote = node.kind === "note";
              return (
                <g
                  key={node.id}
                  onPointerDown={(e) => onNodePointerDown(e, node)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (!readOnly) setEditingId(node.id);
                  }}
                  style={{ cursor: tool === "connect" ? "crosshair" : "move" }}
                >
                  {preset.shape === "cylinder" ? (
                    <g>
                      <rect
                        x={node.x}
                        y={node.y + 10}
                        width={node.w}
                        height={node.h - 20}
                        rx={6}
                        fill="var(--color-node)"
                        stroke={
                          isSel || connectFrom === node.id ? "var(--color-primary)" : "var(--color-node-border)"
                        }
                        strokeWidth={isSel ? 2 : 1.3}
                      />
                      <ellipse
                        cx={node.x + node.w / 2}
                        cy={node.y + 10}
                        rx={node.w / 2}
                        ry={10}
                        fill="var(--color-node)"
                        stroke={isSel ? "var(--color-primary)" : "var(--color-node-border)"}
                        strokeWidth={isSel ? 2 : 1.3}
                      />
                    </g>
                  ) : (
                    <rect
                      x={node.x}
                      y={node.y}
                      width={node.w}
                      height={node.h}
                      rx={preset.shape === "pill" ? node.h / 2 : isNote ? 4 : 10}
                      fill={isNote ? "transparent" : "var(--color-node)"}
                      stroke={
                        isSel || connectFrom === node.id
                          ? "var(--color-primary)"
                          : isNote
                            ? "transparent"
                            : "var(--color-node-border)"
                      }
                      strokeWidth={isSel ? 2 : 1.3}
                      strokeDasharray={isNote ? "4 4" : undefined}
                    />
                  )}

                  <foreignObject x={node.x} y={node.y} width={node.w} height={node.h}>
                    {editingId === node.id ? (
                      <textarea
                        autoFocus
                        defaultValue={node.label}
                        onBlur={(e) => {
                          commit({
                            ...doc,
                            nodes: doc.nodes.map((n) =>
                              n.id === node.id ? { ...n, label: e.target.value.slice(0, 280) } : n,
                            ),
                          });
                          setEditingId(null);
                        }}
                        className="h-full w-full resize-none bg-transparent px-2 py-1 text-center text-[13px] leading-tight text-foreground outline-none"
                      />
                    ) : (
                      <div
                        className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center"
                        style={{ pointerEvents: "none" }}
                      >
                        {!isNote && <NodeGlyph kind={node.kind} className="h-4 w-4 text-primary" />}
                        <span
                          className={
                            isNote
                              ? "text-[13px] leading-tight text-foreground"
                              : "text-[13px] font-medium leading-tight text-foreground"
                          }
                        >
                          {node.label}
                        </span>
                      </div>
                    )}
                  </foreignObject>

                  {isSel && !readOnly && (
                    <rect
                      x={node.x + node.w - 5}
                      y={node.y + node.h - 5}
                      width={10}
                      height={10}
                      fill="var(--color-primary)"
                      style={{ cursor: "nwse-resize" }}
                      onPointerDown={(e) => onResizePointerDown(e, node)}
                    />
                  )}
                </g>
              );
            })}

            {/* connect preview */}
            {connectFrom &&
              (() => {
                const from = doc.nodes.find((n) => n.id === connectFrom);
                if (!from) return null;
                return (
                  <line
                    x1={from.x + from.w / 2}
                    y1={from.y + from.h / 2}
                    x2={cursorWorld.x}
                    y2={cursorWorld.y}
                    stroke="var(--color-primary)"
                    strokeDasharray="5 5"
                    strokeWidth={1.5}
                  />
                );
              })()}

            {/* marquee */}
            {marquee && (
              <rect
                x={Math.min(marquee.x0, marquee.x1)}
                y={Math.min(marquee.y0, marquee.y1)}
                width={Math.abs(marquee.x1 - marquee.x0)}
                height={Math.abs(marquee.y1 - marquee.y0)}
                fill="color-mix(in oklab, var(--color-primary) 12%, transparent)"
                stroke="var(--color-primary)"
                strokeDasharray="4 4"
              />
            )}

            {/* remote cursors */}
            {others.map((p) => {
              const g = ghosts[p.id];
              if (!g) return null;
              return (
                <g key={p.id} transform={`translate(${g.x} ${g.y})`} style={{ pointerEvents: "none" }}>
                  <path d="M0 0 L0 14 L4 10 L7 16 L9.5 15 L6.5 9 L11 9 Z" fill={p.color} />
                  <rect x={10} y={12} rx={3} width={p.displayName.length * 6.6 + 12} height={17} fill={p.color} />
                  <text x={16} y={24} fontSize={10} fill="#0b1220" fontFamily="var(--font-mono)">
                    {p.displayName}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}

function ToolButton({
  children,
  active,
  onClick,
  label,
  disabled,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={!!active}
      className={`rounded-md p-2 transition-colors disabled:opacity-35 ${
        active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent"
      }`}
    >
      {children}
    </button>
  );
}

export { emptyDoc };
