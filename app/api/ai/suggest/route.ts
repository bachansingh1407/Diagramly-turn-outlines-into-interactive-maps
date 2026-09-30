import { NextRequest, NextResponse } from 'next/server'
import { grokChat } from '@/lib/ai/xai'

const SYS = `You help fill gaps in a project or idea outline. Given the path from the root to a node, and that node's current children, suggest 3 to 6 NEW child items that are missing and genuinely useful for that specific domain.
Respond as strict JSON only: {"suggestions": ["short label", ...]}. No prose, no markdown fences.
Each label must be under 6 words. Never repeat an existing child, and stay specific to the path given rather than generic advice.`

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const path: string[] = Array.isArray(body?.path) ? body.path.filter((x: unknown) => typeof x === 'string') : []
  const existing: string[] = Array.isArray(body?.existing) ? body.existing.filter((x: unknown) => typeof x === 'string') : []
  if (!path.length) return NextResponse.json({ error: 'Missing node path.' }, { status: 400 })
  const user = `Path: ${path.join(' > ')}\nExisting children: ${existing.length ? existing.join(', ') : '(none yet)'}`
  try {
    const raw = await grokChat(SYS, user, { json: true, maxTokens: 400 })
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { parsed = {} }
    const list = (parsed as { suggestions?: unknown })?.suggestions
    const suggestions = Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 6) : []
    return NextResponse.json({ suggestions })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'AI request failed' }, { status: 502 })
  }
}
