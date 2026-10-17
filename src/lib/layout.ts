import dagre from "@dagrejs/dagre";
import { backEdges, type Graph } from "./graph";

export type View = "flow-tb" | "flow-lr" | "tree" | "mind" | "loop";
export type CardStyle = "classic" | "workflow" | "detail";
export const SIZE: Record<CardStyle, { w: number; h: number }> = { classic: { w: 420, h: 92 }, workflow: { w: 320, h: 84 }, detail: { w: 300, h: 150 } };
export const NODE_W = SIZE.classic.w, NODE_H = SIZE.classic.h;
type Pos = Record<string, { x: number; y: number }>;

/** Breadth-first spanning tree over blocking flow edges (loops and feedback arrows are ignored). */
export function spanning(g: Graph) {
  const back = backEdges(g), flow = g.edges.filter((e) => e.kind !== "feedback" && !back.has(e.id));
  const root = (g.nodes.find((n) => n.type === "start") ?? g.nodes.find((n) => !flow.some((e) => e.target === n.id)) ?? g.nodes[0]).id;
  const kids = new Map<string, string[]>(g.nodes.map((n) => [n.id, []])), depth = new Map<string, number>([[root, 0]]), tree = new Set<string>(), order = [root];
  for (let i = 0; i < order.length; i++) for (const e of flow) {
    if (e.source !== order[i] || depth.has(e.target) || !kids.has(e.target)) continue;
    depth.set(e.target, depth.get(order[i])! + 1); kids.get(order[i])!.push(e.target); tree.add(e.id); order.push(e.target);
  }
  g.nodes.forEach((n) => { if (!depth.has(n.id)) order.push(n.id); });
  return { root, kids, depth, tree, order, flow };
}

function dag(g: Graph, edges: { source: string; target: string }[], dir: "TB" | "LR", w: number, h: number): Pos {
  const d = new dagre.graphlib.Graph(), ids = new Set(g.nodes.map((n) => n.id));
  d.setGraph({ rankdir: dir, nodesep: dir === "TB" ? 60 : 40, ranksep: dir === "TB" ? 70 : 90 });
  d.setDefaultEdgeLabel(() => ({}));
  g.nodes.forEach((n) => d.setNode(n.id, { width: w, height: h }));
  edges.forEach((e) => { if (ids.has(e.source) && ids.has(e.target)) d.setEdge(e.source, e.target); });
  dagre.layout(d);
  const out: Pos = {};
  g.nodes.forEach((n) => { const p = d.node(n.id); out[n.id] = { x: p.x - w / 2, y: p.y - h / 2 }; });
  return out;
}

export function layoutView(g: Graph, view: View = "flow-tb", cs: CardStyle = "classic"): Pos {
  const { w, h } = SIZE[cs], s = spanning(g);
  if (view === "flow-tb") return dag(g, s.flow, "TB", w, h);
  if (view === "flow-lr") return dag(g, s.flow, "LR", w, h);
  if (view === "tree") return dag(g, s.flow.filter((e) => s.tree.has(e.id)), "TB", w, h);
  const out: Pos = {}, put = (id: string, x: number, y: number) => { out[id] = { x: x - w / 2, y: y - h / 2 }; };
  if (view === "loop") {
    const n = s.order.length, R = Math.max(w, (n * (w + 60)) / (2 * Math.PI));
    s.order.forEach((id, i) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / n; put(id, R * Math.cos(a), R * Math.sin(a)); });
    return out;
  }
  const leaves = new Map<string, number>();
  const cnt = (u: string): number => { const k = s.kids.get(u)!, v = k.length ? k.reduce((a, c) => a + cnt(c), 0) : 1; leaves.set(u, v); return v; };
  cnt(s.root);
  const per = new Map<number, number>(); s.depth.forEach((d) => per.set(d, (per.get(d) || 0) + 1));
  const rad = (d: number) => (d === 0 ? 0 : Math.max(d * (w + 120), ((per.get(d) || 1) * (w + 40)) / (2 * Math.PI)));
  const place = (u: string, a0: number, a1: number) => {
    const m = (a0 + a1) / 2, r = rad(s.depth.get(u)!); put(u, r * Math.cos(m), r * Math.sin(m));
    let c = a0; for (const k of s.kids.get(u)!) { const wd = ((a1 - a0) * leaves.get(k)!) / leaves.get(u)!; place(k, c, c + wd); c += wd; }
  };
  place(s.root, 0, 2 * Math.PI);
  const rest = g.nodes.filter((n) => !s.depth.has(n.id));
  rest.forEach((n, i) => { const a = (2 * Math.PI * i) / rest.length; put(n.id, 1600 * Math.cos(a), 1600 * Math.sin(a)); });
  return out;
}
export const layoutTB = (g: Graph) => layoutView(g, "flow-tb", "classic");
export const suggestView = (g: Graph): View => (g.nodes.length && g.nodes.every((n) => n.type === "topic") ? "tree" : "flow-tb");
