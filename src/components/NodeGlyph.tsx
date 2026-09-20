import {
  Boxes,
  Cloud,
  Cpu,
  Database,
  HardDrive,
  ListOrdered,
  Monitor,
  Type,
  Zap,
} from "lucide-react";
import type { NodeKind } from "@/lib/canvas-doc";

const MAP: Record<NodeKind, typeof Boxes> = {
  client: Monitor,
  gateway: Cloud,
  service: Boxes,
  queue: ListOrdered,
  database: Database,
  cache: Zap,
  storage: HardDrive,
  llm: Cpu,
  note: Type,
};

export function NodeGlyph({ kind, className }: { kind: NodeKind; className?: string }) {
  const Icon = MAP[kind];
  return <Icon className={className} strokeWidth={1.6} aria-hidden />;
}
