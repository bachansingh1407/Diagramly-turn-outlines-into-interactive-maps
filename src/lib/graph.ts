// Pure graph model + structural validation (no dependencies, easy to test).
export type NodeType = "start" | "process" | "check" | "decision" | "external" | "end" | "topic";
export const NODE_TYPES: NodeType[] = ["start", "process", "check", "decision", "external", "end", "topic"];
export type EdgeKind = "flow" | "feedback"; // feedback = a non-blocking update sent back to an earlier step (drawn dashed, not a loop)
export type GNode = { id: string; type: NodeType; title: string; desc: string };
export type GEdge = { id: string; source: string; target: string; label: string; kind: EdgeKind };
export type Graph = { nodes: GNode[]; edges: GEdge[] };
export type Issue = { level: "error" | "warn"; msg: string };

const reach = (start: string, next: (id: string) => string[]) => {
  const s = new Set([start]), q = [start];
  while (q.length) { const x = q.pop()!; for (const y of next(x)) if (!s.has(y)) { s.add(y); q.push(y); } }
  return s;
};
const flowEdges = (g: Graph) => g.edges.filter((e) => e.kind !== "feedback");

/** Edge ids that close a cycle in the flow (DFS back-edges). Feedback edges are ignored. */
export function backEdges(g: Graph): Set<string> {
  const ids = new Set(g.nodes.map((n) => n.id)), adj = new Map<string, { id: string; t: string }[]>();
  g.nodes.forEach((n) => adj.set(n.id, []));
  flowEdges(g).forEach((e) => { if (ids.has(e.source) && ids.has(e.target)) adj.get(e.source)!.push({ id: e.id, t: e.target }); });
  const color = new Map<string, number>(), back = new Set<string>();
  const dfs = (u: string) => {
    color.set(u, 1);
    for (const { id, t } of adj.get(u)!) { const c = color.get(t); if (c === 1) back.add(id); else if (!c) dfs(t); }
    color.set(u, 2);
  };
  const hasIn = new Set(flowEdges(g).map((e) => e.target));
  [...g.nodes.filter((n) => n.type === "start"), ...g.nodes.filter((n) => !hasIn.has(n.id)), ...g.nodes].forEach((n) => { if (!color.get(n.id)) dfs(n.id); });
  return back;
}

export const classify = (g: Graph) => ({ back: backEdges(g), feedback: new Set(g.edges.filter((e) => e.kind === "feedback").map((e) => e.id)) });

export function validate(g: Graph): Issue[] {
  const out: Issue[] = [], T = (n: { title: string }) => `"${n.title}"`, ids = new Set<string>();
  g.nodes.forEach((n) => { if (ids.has(n.id)) out.push({ level: "error", msg: `Duplicate node id ${n.id}` }); ids.add(n.id); });
  g.edges.forEach((e) => {
    if (!ids.has(e.source) || !ids.has(e.target)) out.push({ level: "error", msg: `Edge ${e.id} points to a missing node` });
    if (e.source === e.target) out.push({ level: "error", msg: `Edge ${e.id} is a self-loop` });
  });
  const good = flowEdges(g).filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target);
  const touched = new Set(g.edges.flatMap((e) => [e.source, e.target]));
  g.nodes.forEach((n) => {
    const o = good.filter((e) => e.source === n.id), i = good.filter((e) => e.target === n.id);
    if (n.type === "topic") { if (!o.length && !i.length && g.nodes.length > 1) out.push({ level: "error", msg: `${T(n)} is disconnected` }); return; }
    if (!o.length && !i.length) out.push({ level: "error", msg: touched.has(n.id) ? `${T(n)} is only linked by feedback arrows` : `${T(n)} is disconnected` });
    else {
      if (n.type !== "start" && !i.length) out.push({ level: "error", msg: `${T(n)} has no incoming edge` });
      if (n.type !== "end" && !o.length) out.push({ level: "error", msg: `${T(n)} is a dead end` });
    }
    if (n.type === "decision") {
      const ls = o.map((e) => e.label.trim().toLowerCase());
      if (o.length < 2) out.push({ level: "error", msg: `Decision ${T(n)} needs at least two branches` });
      else if (ls.some((l) => !l)) out.push({ level: "warn", msg: `Decision ${T(n)} has an unlabelled branch` });
      else if (new Set(ls).size < ls.length) out.push({ level: "warn", msg: `Decision ${T(n)} has duplicate branch labels` });
    }
  });
  const starts = g.nodes.filter((n) => n.type === "start");
  const proc = g.nodes.some((n) => n.type !== "topic");
  if (proc && !starts.length) out.push({ level: "warn", msg: "No start node" });
  if (proc && !g.nodes.some((n) => n.type === "end")) out.push({ level: "warn", msg: "No end node" });
  if (starts.length) {
    const seen = new Set<string>();
    starts.forEach((s) => reach(s.id, (x) => good.filter((e) => e.source === x).map((e) => e.target)).forEach((v) => seen.add(v)));
    g.nodes.forEach((n) => { if (!seen.has(n.id) && good.some((e) => e.source === n.id || e.target === n.id)) out.push({ level: "error", msg: `${T(n)} is unreachable from Start` }); });
  }
  const bk = backEdges(g);
  good.filter((e) => bk.has(e.id)).forEach((e) => {
    const fwd = reach(e.target, (x) => good.filter((y) => y.id !== e.id && y.source === x).map((y) => y.target));
    const bwd = reach(e.source, (x) => good.filter((y) => y.id !== e.id && y.target === x).map((y) => y.source));
    const cyc = new Set(g.nodes.filter((n) => fwd.has(n.id) && bwd.has(n.id)).map((n) => n.id));
    const dec = g.nodes.filter((n) => cyc.has(n.id) && n.type === "decision");
    const exits = dec.some((d) => good.some((y) => y.source === d.id && !cyc.has(y.target)));
    const src = g.nodes.find((n) => n.id === e.source)!;
    if (!exits) out.push({ level: "error", msg: `Unbounded loop through ${T(src)}: no decision lets it exit` });
  });
  return out;
}

export function toMermaid(g: Graph): string {
  const q = (t: string) => t.replace(/"/g, "'");
  const shape = (n: GNode) => (n.type === "decision" ? `{"${q(n.title)}"}` : n.type === "start" || n.type === "end" ? `(["${q(n.title)}"])` : `["${q(n.title)}"]`);
  return ["flowchart TD", ...g.nodes.map((n) => `  ${n.id}${shape(n)}`),
    ...g.edges.map((e) => `  ${e.source} ${e.kind === "feedback" ? "-.->" : "-->"}${e.label ? `|${q(e.label)}|` : ""} ${e.target}`)].join("\n");
}
