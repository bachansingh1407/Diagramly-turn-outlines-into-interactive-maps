// Pure graph model + structural validation (no dependencies, easy to test).
export type NodeType = "start" | "process" | "check" | "decision" | "external" | "end" | "topic";
export const NODE_TYPES: NodeType[] = ["start", "process", "check", "decision", "external", "end", "topic"];
export type EdgeKind = "flow" | "feedback" | "contains" | "member" | "authorizes" | "depends" | "data"; // feedback = non-blocking update sent back to an earlier step; the others are typed structural relationships
export type Prov = "stated" | "inferred" | "assumed";
export type Conflict = { id?: string; summary: string; a?: string; b?: string };
export type Question = { id?: string; summary: string; node?: string };
export type GNode = { id: string; type: NodeType; title: string; desc: string; prov?: Prov; src?: string; max?: number };
export type GEdge = { id: string; source: string; target: string; label: string; kind: EdgeKind; prov?: Prov; src?: string };
export type Graph = { nodes: GNode[]; edges: GEdge[]; conflicts?: Conflict[]; questions?: Question[] };
export type Issue = { level: "error" | "warn"; msg: string };

const reach = (start: string, next: (id: string) => string[]) => {
  const s = new Set([start]), q = [start];
  while (q.length) { const x = q.pop()!; for (const y of next(x)) if (!s.has(y)) { s.add(y); q.push(y); } }
  return s;
};
// Process flow = kind "flow" only. Feedback and structural relationships (contains, member, authorizes, depends, data) are not steps.
const flowEdges = (g: Graph) => g.edges.filter((e) => e.kind === "flow");

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
  const onlyStructural = (id: string) => { const inc = g.edges.filter((e) => e.source === id || e.target === id); return inc.length > 0 && inc.every((e) => e.kind !== "flow" && e.kind !== "feedback"); };
  g.nodes.forEach((n) => {
    const o = good.filter((e) => e.source === n.id), i = good.filter((e) => e.target === n.id);
    if (n.type === "topic" || onlyStructural(n.id)) { if (!touched.has(n.id) && g.nodes.length > 1) out.push({ level: "error", msg: `${T(n)} is disconnected` }); return; }
    if (!o.length && !i.length) out.push({ level: "error", msg: touched.has(n.id) ? `${T(n)} is only linked by feedback or structural connections` : `${T(n)} is disconnected` });
    else {
      if (n.type !== "start" && !i.length) out.push({ level: "error", msg: `${T(n)} has no incoming edge` });
      if (n.type !== "end" && !o.length) out.push({ level: "error", msg: `${T(n)} is a dead end` });
    }
    if (n.type === "decision") {
      const ls = o.map((e) => e.label.trim().toLowerCase()), asked = (g.questions ?? []).some((q) => q.node === n.id);
      if (o.length < 2) out.push({ level: asked ? "warn" : "error", msg: asked ? `Decision ${T(n)} has an unresolved outcome (open question)` : `Decision ${T(n)} needs at least two branches` });
      else if (ls.some((l) => !l)) out.push({ level: "warn", msg: `Decision ${T(n)} has an unlabelled branch` });
      else if (new Set(ls).size < ls.length) out.push({ level: "warn", msg: `Decision ${T(n)} has duplicate branch labels` });
    } else if (o.length > 1 && o.some((e) => !e.label.trim()) && o.some((e) => e.label.trim())) out.push({ level: "warn", msg: `${T(n)} has several connections but only some have conditions` });
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
  const bk = backEdges(g), inLoop = new Set<string>();
  const RETRY = /retry|try again|again|attempt|re-?send|re-?enter/i, STATED = /\d|\b(once|twice|one|two|three|four|five)\b/i;
  const ctl = (n: GNode) => n.type === "decision" || good.filter((y) => y.source === n.id && y.label.trim()).length >= 2;
  good.filter((e) => bk.has(e.id)).forEach((e) => {
    const fwd = reach(e.target, (x) => good.filter((y) => y.id !== e.id && y.source === x).map((y) => y.target));
    const bwd = reach(e.source, (x) => good.filter((y) => y.id !== e.id && y.target === x).map((y) => y.source));
    const cyc = new Set(g.nodes.filter((n) => fwd.has(n.id) && bwd.has(n.id)).map((n) => n.id)); cyc.forEach((x) => inLoop.add(x));
    const members = g.nodes.filter((n) => cyc.has(n.id));
    const exits = members.some((d) => ctl(d) && good.some((y) => y.source === d.id && !cyc.has(y.target)));
    const src = g.nodes.find((n) => n.id === e.source)!;
    if (!exits) out.push({ level: "error", msg: `Unbounded loop through ${T(src)}: no decision lets it exit` });
    else if ((RETRY.test(e.label) || members.some((n) => RETRY.test(`${n.title} ${n.desc}`))) && !members.some((n) => n.max || STATED.test(`${n.title} ${n.desc} ${e.label}`)))
      out.push({ level: "warn", msg: `Retry loop through ${T(src)} has no stated attempt limit` });
  });
  g.nodes.forEach((n) => { if (n.max && !inLoop.has(n.id)) out.push({ level: "warn", msg: `${T(n)} has an attempt limit but is not part of a loop` }); });
  const seenE = new Set<string>(), byId = new Map(g.nodes.map((n) => [n.id, n]));
  g.edges.forEach((e) => { if (!byId.has(e.source) || !byId.has(e.target)) return; const k = `${e.source}|${e.target}|${e.kind}|${e.label.trim().toLowerCase()}`;
    if (seenE.has(k)) out.push({ level: "error", msg: `Duplicate connection ${T(byId.get(e.source)!)} → ${T(byId.get(e.target)!)}${e.label ? ` ("${e.label}")` : ""}` }); seenE.add(k); });
  findReturnDuplicates(g).forEach(({ dup, matches }) => out.push({ level: "warn", msg: `${T(dup)} may duplicate ${matches.map((m) => T(m)).join(" / ")}: connect to the existing card instead of adding a copy` }));
  return out;
}

const strip = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\b(the|a|an|page|screen|step|stage|view)\b/g, " ").replace(/\s+/g, " ").trim();
const RETURN_RE = /^(?:return(?:s|ed)?|go(?:es)? back|back|redirect(?:ed|s)?|navigate(?:s|d)?(?: back)?|send(?:s)? back|loop(?:s)? back)(?:\s+(?:back|user))?\s+to\s+(.+)$/i;
/** "Return to Login" -> "Login"; null when the title is not a return phrase. */
export const returnPhrase = (title: string): string | null => title.trim().match(RETURN_RE)?.[1] ?? null;
export function matchExisting(phrase: string, nodes: GNode[], skip?: string): GNode[] {
  const p = strip(phrase); if (p.length < 3) return [];
  const eq = nodes.filter((n) => n.id !== skip && strip(n.title) === p); if (eq.length) return eq;
  return nodes.filter((n) => { const t = strip(n.title); return n.id !== skip && t.length >= 3 && (t.includes(p) || p.includes(t)); });
}
export function findReturnDuplicates(g: Graph): { dup: GNode; matches: GNode[] }[] {
  const out: { dup: GNode; matches: GNode[] }[] = [];
  for (const n of g.nodes) { const ph = returnPhrase(n.title); if (!ph) continue; const matches = matchExisting(ph, g.nodes, n.id); if (matches.length) out.push({ dup: n, matches }); }
  return out;
}

export function toMermaid(g: Graph): string {
  const q = (t: string) => t.replace(/"/g, "'");
  const shape = (n: GNode) => (n.type === "decision" ? `{"${q(n.title)}"}` : n.type === "start" || n.type === "end" ? `(["${q(n.title)}"])` : `["${q(n.title)}"]`);
  return ["flowchart TD", ...g.nodes.map((n) => `  ${n.id}${shape(n)}`),
    ...g.edges.map((e) => `  ${e.source} ${e.kind === "feedback" ? "-.->" : "-->"}${e.label ? `|${q(e.label)}|` : ""} ${e.target}`)].join("\n");
}
