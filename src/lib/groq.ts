import { NextResponse } from "next/server";
export class ApiErr extends Error { constructor(public status: number, msg: string) { super(msg); } }
export type Msg = { role: "system" | "user" | "assistant"; content: string };

export function creds(req: Request, model?: unknown) { // keys stay server-side unless the user supplies their own
  const key = req.headers.get("x-groq-key") || process.env.GROQ_API_KEY;
  if (!key) throw new ApiErr(401, "No Groq API key. Add GROQ_API_KEY to .env.local or paste one in Settings.");
  return { key, model: (typeof model === "string" && model.trim()) || process.env.GROQ_MODEL || "openai/gpt-oss-120b" };
}
export async function groq(key: string, model: string, messages: Msg[]): Promise<string> {
  let r: Response;
  try {
    r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", signal: AbortSignal.timeout(45_000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, temperature: 0.1, max_tokens: 4000, response_format: { type: "json_object" } }),
    });
  } catch { throw new ApiErr(504, "The AI provider did not answer in time. Your diagram is unchanged; try again."); }
  if (!r.ok) {
    const t = await r.text();
    if (r.status === 401) throw new ApiErr(401, "Groq rejected the API key. Check GROQ_API_KEY or the key in Settings.");
    if (r.status === 429) throw new ApiErr(429, "Groq rate limit reached. Wait a moment and try again.");
    if (r.status === 404 || /model_not_found|does not exist|decommissioned|model_permission/i.test(t)) throw new ApiErr(400, `Groq says model "${model}" is unavailable: ${t.slice(0, 200)}`);
    throw new ApiErr(502, `Groq error ${r.status}: ${t.slice(0, 200)}`);
  }
  const content = (await r.json()).choices?.[0]?.message?.content;
  if (!content || !String(content).trim()) throw new ApiErr(502, "The model returned an empty answer. Try again.");
  return String(content);
}
export const parseJson = (raw: string): unknown => JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
/** Source text and graph text are data: fence them so they cannot close the fence or pose as instructions. */
export const isolate = (text: string, tag = "source") => `<${tag}>\n${text.replace(new RegExp(`</?${tag}>`, "gi"), "")}\n</${tag}>`;
export const fail = (e: unknown) => NextResponse.json({ error: (e as Error).message || "Unexpected error" }, { status: e instanceof ApiErr ? e.status : 500 });
