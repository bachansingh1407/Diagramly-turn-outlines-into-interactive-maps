import { backEdges, type Graph } from "./graph";
import { spanning } from "./layout";

const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
/** Deterministic requirements document from the diagram (no AI): numbered FR items, conditions, loops, feedback, traceability. */
export function toSRS(title: string, g: Graph): string {
  const s = spanning(g), back = backEdges(g), by = new Map(g.nodes.map((n) => [n.id, n])), t = (id: string) => by.get(id)?.title ?? id;
  const L = [`# ${title} — Software Requirements Specification`, "", "## 1. Purpose", `Describes ${g.nodes.length} elements and ${g.edges.length} relationships taken from the diagram.`, ""];
  if (g.nodes.every((n) => n.type === "topic")) {
    L.push("## 2. Structure");
    const walk = (id: string, d: number) => { L.push(`${"  ".repeat(d)}- ${t(id)}`); (s.kids.get(id) ?? []).forEach((k) => walk(k, d + 1)); };
    walk(s.root, 0);
    return L.join("\n");
  }
  L.push("## 2. Functional requirements", "");
  const ids = new Map<string, string>();
  s.order.forEach((id, i) => ids.set(id, `FR-${String(i + 1).padStart(2, "0")}`));
  s.order.forEach((id) => {
    const n = by.get(id)!, r = ids.get(id)!, out = g.edges.filter((e) => e.source === id);
    L.push(`### ${r} ${n.title}`);
    if (n.type === "decision") {
      L.push(`${r}.1 The system shall evaluate: ${lc(n.desc || n.title)}`);
      out.filter((e) => e.kind !== "feedback").forEach((e, j) => L.push(`${r}.${j + 2} On "${e.label || "next"}", the system shall continue to ${t(e.target)}${back.has(e.id) ? " (retry / failover loop)" : ""}.`));
    } else if (n.type === "end") L.push(`${r}.1 The process ends here.`);
    else (n.desc ? n.desc.split(" · ") : [n.title]).forEach((x, j) => L.push(`${r}.${j + 1} The system shall ${lc(x.replace(/[.\s]+$/, ""))}.`));
    out.filter((e) => e.kind === "feedback").forEach((e) => L.push(`- Status feedback: ${n.title} informs ${t(e.target)}${e.label ? ` (${e.label})` : ""}.`));
    L.push("");
  });
  L.push("## 3. Traceability", "", "| Requirement | Diagram element |", "|---|---|", ...s.order.map((id) => `| ${ids.get(id)} | ${t(id)} (${by.get(id)!.type}) |`));
  return L.join("\n");
}
