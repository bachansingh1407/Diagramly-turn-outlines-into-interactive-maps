import { findReturnDuplicates, type Graph, type Question } from "./graph";

/**
 * Deterministic, conservative repairs applied to AI output (and safe to re-run):
 *  1. A node that only says "Return to X" / "Redirect to X" is replaced by an edge to the EXISTING node X
 *     (only when X matches exactly one node and the copy does no other work). Several matches become a question.
 *  2. A decision with a single stated outcome gets an open question. No outcome is ever invented.
 */
export function repairGraph(g: Graph): { graph: Graph; notes: string[] } {
  let nodes = [...g.nodes], edges = g.edges.map((e) => ({ ...e }));
  const questions: Question[] = [...(g.questions ?? [])], notes: string[] = [];
  const ask = (summary: string, node: string) => { if (!questions.some((q) => q.node === node && q.summary === summary)) questions.push({ id: `q${questions.length + 1}`, summary, node }); };
  for (const { dup, matches } of findReturnDuplicates({ ...g, nodes, edges })) {
    const out = edges.filter((e) => e.source === dup.id), inc = edges.filter((e) => e.target === dup.id);
    const trivial = out.length <= 1 && out.every((e) => nodes.find((n) => n.id === e.target)?.type === "end");
    if (!trivial) continue; // the copy does real work: leave it, validation warns
    if (matches.length !== 1) { ask(`"${dup.title}" could mean ${matches.map((m) => `"${m.title}"`).join(" or ")}. Which one?`, dup.id); continue; }
    const t = matches[0];
    if (inc.some((e) => e.source === t.id)) continue; // would create a self-loop
    const endIds = out.map((e) => e.target);
    edges = edges.filter((e) => e.source !== dup.id).map((e) => (e.target === dup.id ? { ...e, target: t.id } : e));
    nodes = nodes.filter((n) => n.id !== dup.id && !(endIds.includes(n.id) && !edges.some((e) => e.source === n.id || e.target === n.id)));
    notes.push(`Replaced "${dup.title}" with a connection to the existing "${t.title}".`);
  }
  const seen = new Set<string>();
  edges = edges.filter((e) => { const k = `${e.source}|${e.target}|${e.kind}|${e.label.trim().toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); return true; });
  for (const n of nodes) if (n.type === "decision") {
    const o = edges.filter((e) => e.source === n.id && e.kind === "flow");
    if (o.length === 1) ask(`"${n.title}" only states the "${o[0].label || "next"}" outcome. What should happen otherwise?`, n.id);
  }
  return { graph: { ...g, nodes, edges, questions }, notes };
}
