// Canvas document schema. Kept transport-agnostic so it can be persisted to a
// real backend (snapshots + operations) without touching the rendering layer.

export const SCHEMA_VERSION = 1;

export type NodeKind =
  | "service"
  | "database"
  | "queue"
  | "cache"
  | "llm"
  | "client"
  | "storage"
  | "gateway"
  | "note";

export interface CanvasNode {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

export interface CanvasEdge {
  id: string;
  from: string;
  to: string;
  label: string;
}

export interface CanvasStroke {
  id: string;
  color: string;
  width: number;
  points: number[]; // flat [x0,y0,x1,y1,...]
}

export interface CanvasDoc {
  schemaVersion: number;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  strokes: CanvasStroke[];
}

export const emptyDoc = (): CanvasDoc => ({
  schemaVersion: SCHEMA_VERSION,
  nodes: [],
  edges: [],
  strokes: [],
});

export const uid = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;

export const NODE_PRESETS: Record<
  NodeKind,
  { label: string; w: number; h: number; title: string; shape: "rect" | "cylinder" | "pill" | "note" }
> = {
  client: { label: "Client", w: 150, h: 76, title: "Client / Browser", shape: "rect" },
  gateway: { label: "API Gateway", w: 170, h: 76, title: "API Gateway / LB", shape: "pill" },
  service: { label: "Service", w: 170, h: 84, title: "Service", shape: "rect" },
  queue: { label: "Queue", w: 170, h: 70, title: "Queue / Stream", shape: "pill" },
  database: { label: "Database", w: 160, h: 92, title: "Database", shape: "cylinder" },
  cache: { label: "Cache", w: 150, h: 76, title: "Cache", shape: "rect" },
  storage: { label: "Object Store", w: 160, h: 92, title: "Blob Storage", shape: "cylinder" },
  llm: { label: "LLM", w: 160, h: 84, title: "LLM / Inference", shape: "rect" },
  note: { label: "Text", w: 200, h: 56, title: "Text block", shape: "note" },
};

export const nodeCenter = (n: CanvasNode) => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });

/** Clip a center-to-center segment at the border of the source rectangle. */
export function anchorOnRect(n: CanvasNode, towards: { x: number; y: number }) {
  const c = nodeCenter(n);
  const dx = towards.x - c.x;
  const dy = towards.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const hw = n.w / 2 + 6;
  const hh = n.h / 2 + 6;
  const scale = Math.min(hw / Math.abs(dx || 1e-6), hh / Math.abs(dy || 1e-6));
  return { x: c.x + dx * scale, y: c.y + dy * scale };
}

export function edgeGeometry(doc: CanvasDoc, edge: CanvasEdge) {
  const a = doc.nodes.find((n) => n.id === edge.from);
  const b = doc.nodes.find((n) => n.id === edge.to);
  if (!a || !b) return null;
  const start = anchorOnRect(a, nodeCenter(b));
  const end = anchorOnRect(b, nodeCenter(a));
  return { start, end, mid: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 } };
}

export function strokeBounds(s: CanvasStroke) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < s.points.length; i += 2) {
    minX = Math.min(minX, s.points[i]!);
    maxX = Math.max(maxX, s.points[i]!);
    minY = Math.min(minY, s.points[i + 1]!);
    maxY = Math.max(maxY, s.points[i + 1]!);
  }
  return { minX, minY, maxX, maxY };
}

export function strokePath(s: CanvasStroke) {
  let d = "";
  for (let i = 0; i < s.points.length; i += 2) {
    d += `${i === 0 ? "M" : "L"}${s.points[i]!.toFixed(1)} ${s.points[i + 1]!.toFixed(1)} `;
  }
  return d.trim();
}

export function countElements(doc: CanvasDoc) {
  return doc.nodes.length + doc.edges.length + doc.strokes.length;
}
