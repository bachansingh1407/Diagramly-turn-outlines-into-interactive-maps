import { GraphSchema } from "./schema";
import { validate, type Graph, type Prov } from "./graph";
import { repairGraph } from "./repair";

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
/** A quote that is not really in the source cannot back a "stated" claim. */
function verify(g: Graph, text: string): Graph {
  const hay = norm(text);
  const fix = <T extends { src?: string; prov?: Prov }>(x: T, structural = false): T => {
    if (x.src && !hay.includes(norm(x.src))) x = { ...x, src: "" };
    return !x.src && x.prov === "stated" && !structural ? { ...x, prov: "inferred" } : x;
  };
  return { ...g, nodes: g.nodes.map((n) => fix(n, n.type === "start" || n.type === "end")), edges: g.edges.map((e) => fix(e, true)),
    conflicts: (g.conflicts ?? []).map((c, i) => ({ ...c, id: c.id || `c${i + 1}` })),
    questions: (g.questions ?? []).map((q, i) => ({ ...q, id: q.id || `q${i + 1}` })) };
}
/** Raw model text -> validated graph. Pure (no network) so it can be tested with mocked AI answers. Never invents nodes or edges. */
export function acceptGraph(raw: string, text: string): { graph?: Graph; problems: string[]; notes: string[] } {
  let obj: unknown;
  try { obj = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); } catch { return { problems: ["Output was not valid JSON."], notes: [] }; }
  const p = GraphSchema.safeParse(obj);
  if (!p.success) return { problems: p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`), notes: [] };
  const { graph, notes } = repairGraph(verify(p.data as Graph, text));
  return { graph, notes, problems: validate(graph).filter((i) => i.level === "error").map((i) => i.msg) };
}
