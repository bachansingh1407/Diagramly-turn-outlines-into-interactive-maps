// Server-only. Never import this from a 'use client' component — the API key must
// stay on the server. Set GROQ_API_KEY (from console.groq.com/keys) in .env.local —
// or XAI_API_KEY if you'd rather use xAI's Grok. Groq is picked first if both are set.
type Provider = { url: string; key: string; defaultModel: string; label: string }

function pickProvider(): Provider {
  if (process.env.GROQ_API_KEY) return { url: 'https://api.groq.com/openai/v1/chat/completions', key: process.env.GROQ_API_KEY, defaultModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile', label: 'Groq' }
  if (process.env.XAI_API_KEY) return { url: 'https://api.x.ai/v1/chat/completions', key: process.env.XAI_API_KEY, defaultModel: process.env.XAI_MODEL || 'grok-4-fast', label: 'xAI' }
  throw new Error('AI features need an API key. Add GROQ_API_KEY (from console.groq.com/keys) to .env.local and restart the server.')
}

export async function grokChat(system: string, user: string, opts: { json?: boolean; maxTokens?: number } = {}) {
  const p = pickProvider()
  const r = await fetch(p.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}` },
    body: JSON.stringify({
      model: p.defaultModel,
      temperature: 0.4,
      max_tokens: opts.maxTokens ?? 1800,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  })
  if (!r.ok) {
    const t = await r.text().catch(() => '')
    if (r.status === 401) throw new Error(`The configured ${p.label} API key was rejected. Check .env.local.`)
    if (r.status === 429) throw new Error(`${p.label} rate limit hit — wait a moment and try again.`)
    throw new Error(`${p.label} API error (${r.status}): ${t.slice(0, 300)}`)
  }
  const data = await r.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error(`${p.label} returned an unexpected response shape.`)
  return content
}

export const stripFence = (s: string) => s.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/, '').trim()
