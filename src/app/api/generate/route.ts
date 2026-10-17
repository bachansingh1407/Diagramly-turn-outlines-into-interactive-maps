import { NextRequest, NextResponse } from "next/server";
import { validate, type Graph } from "@/lib/graph";
import { GraphSchema } from "@/lib/schema";

export const maxDuration = 60;
const MAX_CHARS = 24000;

const SYSTEM = `You turn a process description into a STAGE-LEVEL flow diagram. Reply with ONE JSON object only:
{"nodes":[{"id":"n1","type":"start|process|check|decision|external|end","title":"2-4 words","desc":"one short line summarising the step or its sub-steps"}],"edges":[{"id":"e1","source":"n1","target":"n2","label":"","kind":"flow|feedback"}]}
Rules:
- One node per stage (heading or top-level item), in order. Never one node per sub-bullet: fold sub-bullets into "desc" (max about 80 characters).
- First node type "start", last node type "end". Use "check" for validation/verification stages, "external" for outside systems, "process" otherwise.
- Use "decision" ONLY where the text states a condition (if, on error, until, retry). A decision MUST have at least two outgoing edges, each labelled (Yes/No or the outcome).
- Every stage connects to the next stage with a "flow" edge. A retry or failover is a "flow" edge from the decision back to the earlier stage (label "No"), and the decision also has a labelled exit.
- Use kind "feedback" for non-blocking updates sent back to an earlier stage (status, reports, callbacks). They are not loops.
- Do not invent steps, rules or numbers. Ids are unique; every edge uses existing ids.`;

class ApiErr extends Error { constructor(public status: number, msg: string) { super(msg); } }
type Msg = { role: "system" | "user" | "assistant"; content: string };

async function groq(key: string, model: string, messages: Msg[]): Promise<string> {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, temperature: 0.1, response_format: { type: "json_object" } }),
  });
  if (!r.ok) {
    const t = await r.text();
    if (r.status === 401) throw new ApiErr(401, "Groq rejected the API key. Check GROQ_API_KEY or the key in Settings.");
    if (r.status === 429) throw new ApiErr(429, "Groq rate limit reached. Wait a moment and try again.");
    if (r.status === 404 || /model_not_found|does not exist|decommissioned|model_permission/i.test(t)) throw new ApiErr(400, `Groq says model "${model}" is unavailable: ${t.slice(0, 200)}`);
    throw new ApiErr(502, `Groq error ${r.status}: ${t.slice(0, 200)}`);
  }
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? "";
}

function parse(raw: string): { graph?: Graph; problems: string[] } {
  let obj: unknown;
  try { obj = JSON.parse(raw); } catch { return { problems: ["Output was not valid JSON."] }; }
  const p = GraphSchema.safeParse(obj);
  if (!p.success) return { problems: p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  return { graph: p.data as Graph, problems: validate(p.data as Graph).filter((i) => i.level === "error").map((i) => i.msg) };
}

export async function POST(req: NextRequest) {
  try {
    const { text, model } = await req.json();
    const key = req.headers.get("x-groq-key") || process.env.GROQ_API_KEY;
    if (!key) throw new ApiErr(401, "No Groq API key. Add GROQ_API_KEY to .env.local or paste one in Settings.");
    if (typeof text !== "string" || !text.trim()) throw new ApiErr(400, "Document is empty.");
    if (text.length > MAX_CHARS) throw new ApiErr(413, `Document is too long (${text.length} chars, max ${MAX_CHARS}). Split it into sections.`);
    const m = (typeof model === "string" && model.trim()) || process.env.GROQ_MODEL || "openai/gpt-oss-120b";
    const numbered = text.split("\n").filter((l: string) => l.trim()).join("\n");
    const msgs: Msg[] = [{ role: "system", content: SYSTEM }, { role: "user", content: numbered }];
    let raw = await groq(key, m, msgs);
    let res = parse(raw);
    if (res.problems.length) { // one repair pass
      msgs.push({ role: "assistant", content: raw }, { role: "user", content: `Fix these structural problems and return the full corrected JSON only:\n- ${res.problems.join("\n- ")}` });
      raw = await groq(key, m, msgs);
      res = parse(raw);
    }
    if (!res.graph) throw new ApiErr(422, `The model returned an unusable graph: ${res.problems.join("; ")}`);
    return NextResponse.json({ graph: res.graph, issues: validate(res.graph) });
  } catch (e) {
    const s = e instanceof ApiErr ? e.status : 500;
    return NextResponse.json({ error: (e as Error).message || "Unexpected error" }, { status: s });
  }
}
