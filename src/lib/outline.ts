// Turns an indented outline into a connected flow, with no AI and no network:
//   top-level item (or the children of a single title line) = one STAGE card, its sub-items = the card's subtitle,
//   stages are joined in order, a failure/retry step becomes a decision that loops back, and a step that
//   "updates/reports to" an earlier stage becomes a dashed feedback arrow.
import type { Graph, GEdge, GNode } from "./graph";

type Item = { text: string; indent: number; kids: Item[] };
const CHECK = /(valid|verif|check|approv|permission|authenticat|authoriz|authoris|complian|review|screen)/i;
const FAIL = /\b(on (an )?(error|failure|timeout)|upon (error|failure)|if .{0,40}(fail|error|unavailab|declin|reject|timeout)|retry|retries|switch(es)? to (the )?next|fall ?back to|until .{0,40}(accept|succe|deliver))/i;
const ROUTE = /(rout|select|choos|dispatch|assign|queue)/i;
const NOTIFY = /(updat|notif|report|inform|sync|call ?back|webhook|send .* back)/i;
const STOP = new Set(["process", "delivery", "message", "request", "status", "data", "with", "that", "from", "into", "when", "send", "step", "steps", "system", "service", "after", "before", "then", "them", "this", "have"]);

function readItems(raw: string): Item[] {
  const roots: Item[] = [], stack: Item[] = [];
  let base = 0;
  for (const line of raw.replace(/\r/g, "").replace(/[\u2010-\u2015]/g, "-").split("\n")) {
    if (!line.trim()) continue;
    let indent = line.match(/^[ \t\u00a0]*/)![0].replace(/\t/g, "  ").replace(/\u00a0/g, " ").length + base, t = line.trim();
    const h = t.match(/^(#{1,6})\s+(.*)$/); // markdown headings set the level for the lines under them
    if (h) { indent = (h[1].length - 1) * 2; base = indent + 2; t = h[2]; }
    t = t.replace(/^([-*•+]|\d+[.)])\s+/, "").replace(/\*\*(.+?)\*\*/g, "$1").trim();
    if (!t) continue;
    const it: Item = { text: t, indent, kids: [] };
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    (stack.length ? stack[stack.length - 1].kids : roots).push(it);
    stack.push(it);
  }
  return roots;
}
const flat = (it: Item): string[] => it.kids.flatMap((k) => [k.text, ...flat(k)]);
const words = (s: string) => (s.toLowerCase().match(/[a-z]{4,}/g) ?? []).map((w) => w.replace(/s$/, "")).filter((w) => !STOP.has(w));
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

/** Returns null when the text has fewer than two stages (nothing to connect). */
export function parseOutline(raw: string): { title: string; graph: Graph } | null {
  const roots = readItems(raw);
  let title = "Untitled diagram", top = roots;
  if (roots.length === 1 && roots[0].kids.length >= 2) { title = roots[0].text; top = roots[0].kids; }
  if (top.length < 2) return null;

  const stages = top.map((it) => {
    const steps = flat(it);
    if (!steps.length && it.text.length > 56) { // a long plain sentence: short title, full sentence as subtitle
      const cut = it.text.split(/[,;:.]| - /)[0];
      return { title: clip(cut.length >= 12 ? cut : it.text, 48), desc: it.text, steps: [it.text] };
    }
    return { title: it.text.replace(/[:：]$/, ""), desc: steps.join(" · "), steps };
  });
  const last = stages.length - 1, ids = stages.map((_, i) => `n${i + 1}`);
  const nodes: GNode[] = [], edges: GEdge[] = [];
  let k = 0;
  const link = (source: string, target: string, label = "", kind: GEdge["kind"] = "flow") => edges.push({ id: `e${++k}`, source, target, label, kind });

  stages.forEach((s, i) => nodes.push({ id: ids[i], type: i === 0 ? "start" : i === last ? "end" : CHECK.test(s.title) ? "check" : "process", title: s.title, desc: s.desc }));

  // A step that handles failure ("on error switch to next provider", "retry 3 times") becomes a Yes/No decision after its stage.
  const dec = new Map<number, string>();
  stages.forEach((s, i) => {
    if (i === 0 || i === last) return;
    const step = s.steps.find((x) => FAIL.test(x));
    if (!step) return;
    const id = `d${i + 1}`, base = s.title.replace(/\s*(&|and)\s*(failover|retry|fallback|error handling).*$/i, "");
    let back = i - 1;
    for (let j = i - 1; j >= 1; j--) if (ROUTE.test(stages[j].title)) { back = j; break; }
    const lim = step.match(/\b(\d+|two|three|four|five)\s*(?:times|retries|attempts)\b/i), WORD: Record<string, number> = { two: 2, three: 3, four: 4, five: 5 };
    nodes.splice(nodes.findIndex((n) => n.id === ids[i]) + 1, 0, { id, type: "decision", title: `${base} successful?`, desc: clip(step, 90), ...(lim ? { max: Math.min(99, WORD[lim[1].toLowerCase()] ?? +lim[1]) } : {}) });
    dec.set(i, id);
    link(ids[i], id);
    link(id, ids[i + 1], "Yes");
    link(id, ids[back], "No");
  });
  stages.forEach((_, i) => { if (i < last && !dec.has(i)) link(ids[i], ids[i + 1]); });

  // A step that updates/reports to an earlier stage ("Update platform with status") becomes a dashed feedback arrow to it.
  stages.forEach((s, i) => {
    for (const step of s.steps) {
      if (!NOTIFY.test(step)) continue;
      const w = new Set(words(step));
      const j = stages.findIndex((t, x) => x <= i - 2 && words(t.title).some((v) => w.has(v)));
      if (j >= 0) { link(ids[i], ids[j], clip(step, 28), "feedback"); break; }
    }
  });
  return { title, graph: { nodes, edges } };
}

/** Plain indented list with no process verbs = a hierarchy (org chart, feature breakdown): every line becomes a topic, parent -> child. */
export function looksHierarchy(raw: string): boolean {
  return /\n[ \t]+\S/.test(raw) && !/\b(submit|send|receive|check|validat\w*|verif\w*|apply|store|select|updat\w*|deliver\w*|creat\w*|enter|add|pack|ship|retry|if|authori[sz]\w*|approv\w*|notif\w*|request|rout\w*|process)\b/i.test(raw);
}
export function parseHierarchy(raw: string): { title: string; graph: Graph } | null {
  const roots = readItems(raw);
  if (!roots.length) return null;
  const nodes: GNode[] = [], edges: GEdge[] = [];
  let n = 0, k = 0;
  const add = (it: Item, parent?: string) => {
    const id = `n${++n}`;
    nodes.push({ id, type: "topic", title: clip(it.text, 48), desc: it.kids.length ? `${it.kids.length} item${it.kids.length > 1 ? "s" : ""}` : "" });
    if (parent) edges.push({ id: `e${++k}`, source: parent, target: id, label: "", kind: "flow" });
    it.kids.forEach((c) => add(c, id));
  };
  let title = "Untitled diagram";
  if (roots.length === 1) { title = roots[0].text; add(roots[0]); }
  else { nodes.push({ id: "n0", type: "topic", title: "Overview", desc: "" }); roots.forEach((r) => add(r, "n0")); }
  return nodes.length > 1 ? { title, graph: { nodes, edges } } : null;
}
