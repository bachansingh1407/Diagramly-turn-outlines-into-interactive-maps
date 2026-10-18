import { z } from "zod";
import { validate, returnPhrase, matchExisting, type Graph, type GNode, type GEdge } from "./graph";
import { KINDS, PROV, NODE_KINDS } from "./schema";

const S = z.string(), P = z.enum(PROV), K = z.enum(KINDS), T = z.enum(NODE_KINDS);
/** The only way a diagram changes after generation: direct edits and AI instructions both become these. */
export const ChangeSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add_node"), id: S.optional(), type: T, title: S.min(1).max(80), desc: S.max(200).optional(), prov: P.optional(), src: S.max(300).optional(), max: z.number().int().min(1).max(99).optional() }),
  z.object({ op: z.literal("update_node"), id: S, set: z.object({ max: z.number().int().min(1).max(99).optional(), type: T.optional(), title: S.min(1).max(80).optional(), desc: S.max(200).optional(), prov: P.optional(), src: S.max(300).optional() }) }),
  z.object({ op: z.literal("remove_node"), id: S }),
  z.object({ op: z.literal("add_edge"), id: S.optional(), source: S, target: S, label: S.max(60).optional(), kind: K.optional(), prov: P.optional(), src: S.max(300).optional() }),
  z.object({ op: z.literal("update_edge"), id: S, set: z.object({ label: S.max(60).optional(), kind: K.optional(), prov: P.optional(), src: S.max(300).optional() }) }),
  z.object({ op: z.literal("remove_edge"), id: S }),
  z.object({ op: z.literal("merge_nodes"), keep: S, remove: S }),
]);
export type Change = z.infer<typeof ChangeSchema>;
const defined = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

/** Atomic: if any change is invalid nothing is applied and the original graph is returned. */
export function applyChanges(g: Graph, changes: Change[]): { graph: Graph; applied: string[]; errors: string[] } {
  const nodes: GNode[] = JSON.parse(JSON.stringify(g.nodes)), edges: GEdge[] = JSON.parse(JSON.stringify(g.edges));
  const applied: string[] = [], errors: string[] = [];
  const N = (id: string) => nodes.find((n) => n.id === id), E = (id: string) => edges.find((e) => e.id === id);
  const t = (id: string) => N(id)?.title ?? id;
  const next = (list: { id: string }[], p: string) => { let m = 0; for (const x of list) { const r = x.id.match(/^[a-z]+(\d+)$/); if (r) m = Math.max(m, +r[1]); } return p + (m + 1); };
  for (const c of changes) {
    if (c.op === "add_node") {
      const id = c.id ?? next(nodes, "n");
      if (N(id)) { errors.push(`Node id ${id} already exists`); continue; }
      const ph = returnPhrase(c.title);
      if (ph && matchExisting(ph, nodes).length) { errors.push(`Do not add a node for "${c.title}"; connect to the existing step instead`); continue; }
      if (c.type !== "end" && nodes.some((n) => n.title.trim().toLowerCase() === c.title.trim().toLowerCase())) { errors.push(`"${c.title}" already exists; connect to it instead of adding a copy`); continue; }
      nodes.push({ id, type: c.type, title: c.title, desc: c.desc ?? "", prov: c.prov ?? "inferred", src: c.src ?? "", ...(c.max ? { max: c.max } : {}) }); applied.push(`Add "${c.title}"`);
    } else if (c.op === "update_node") {
      const n = N(c.id); if (!n) { errors.push(`Unknown node ${c.id}`); continue; }
      const old = n.title; Object.assign(n, defined(c.set));
      applied.push(c.set.title && c.set.title !== old ? `Rename "${old}" to "${c.set.title}"` : `Update "${n.title}"`);
    } else if (c.op === "remove_node") {
      const n = N(c.id); if (!n) { errors.push(`Unknown node ${c.id}`); continue; }
      const k = edges.filter((e) => e.source === c.id || e.target === c.id).length;
      applied.push(`Remove "${n.title}"${k ? ` and ${k} connection${k > 1 ? "s" : ""}` : ""}`);
      nodes.splice(nodes.indexOf(n), 1); for (let i = edges.length - 1; i >= 0; i--) if (edges[i].source === c.id || edges[i].target === c.id) edges.splice(i, 1);
    } else if (c.op === "add_edge") {
      if (!N(c.source) || !N(c.target)) { errors.push(`Connection uses an unknown node (${c.source} → ${c.target})`); continue; }
      if (c.source === c.target) { errors.push(`"${t(c.source)}" cannot connect to itself`); continue; }
      const kind = c.kind ?? "flow", label = c.label ?? "";
      if (edges.some((e) => e.source === c.source && e.target === c.target && e.kind === kind && e.label === label)) { errors.push(`Connection "${t(c.source)}" → "${t(c.target)}" already exists`); continue; }
      const id = c.id ?? next(edges, "e"); if (E(id)) { errors.push(`Edge id ${id} already exists`); continue; }
      edges.push({ id, source: c.source, target: c.target, label, kind, prov: c.prov ?? "inferred", src: c.src ?? "" }); applied.push(`Connect "${t(c.source)}" → "${t(c.target)}"`);
    } else if (c.op === "update_edge") {
      const e = E(c.id); if (!e) { errors.push(`Unknown connection ${c.id}`); continue; }
      Object.assign(e, defined(c.set)); applied.push(`Update "${t(e.source)}" → "${t(e.target)}"`);
    } else if (c.op === "remove_edge") {
      const e = E(c.id); if (!e) { errors.push(`Unknown connection ${c.id}`); continue; }
      applied.push(`Disconnect "${t(e.source)}" → "${t(e.target)}"`); edges.splice(edges.indexOf(e), 1);
    } else if (c.op === "merge_nodes") {
      const k = N(c.keep), r = N(c.remove);
      if (!k || !r || k === r) { errors.push(`Cannot merge ${c.remove} into ${c.keep}`); continue; }
      edges.forEach((e) => { if (e.source === r.id) e.source = k.id; if (e.target === r.id) e.target = k.id; });
      const seen = new Set<string>();
      for (let i = 0; i < edges.length; i++) { const e = edges[i], key = `${e.source}|${e.target}|${e.kind}|${e.label}`; if (e.source === e.target || seen.has(key)) edges.splice(i--, 1); else seen.add(key); }
      nodes.splice(nodes.indexOf(r), 1); applied.push(`Merge "${r.title}" into "${k.title}"`);
    }
  }
  return { graph: errors.length ? g : { ...g, nodes, edges }, applied, errors };
}

/** Structural errors present after a change that were not there before. */
export function newErrors(before: Graph, after: Graph): string[] {
  const b = new Set(validate(before).filter((i) => i.level === "error").map((i) => i.msg));
  return validate(after).filter((i) => i.level === "error" && !b.has(i.msg)).map((i) => i.msg);
}
