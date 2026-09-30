import { NextRequest, NextResponse } from 'next/server'
import { grokChat, stripFence } from '@/lib/ai/xai'

const SYS = `You convert any text — messy notes, a transcript, a requirements doc, a rambling paragraph, anything — into a strict hierarchical outline that a diagram tool renders as a tree.
Rules:
- Output ONLY the outline text. No preamble, no code fences, no explanation, no trailing commentary.
- Use exactly 2 spaces of indentation per level. Do not use tree characters, numbers, or bullet symbols.
- The first line is a short title for the whole thing (it becomes the root node).
- Keep every label short — under 8 words. Split long ideas into a parent label plus child details rather than one long line.
- Prefer 3 to 6 top-level branches, each with 2 to 5 children, going 2 to 4 levels deep depending on how much the input supports.
- Organize and summarize only what the input implies. Do not invent unrelated facts.`

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!text) return NextResponse.json({ error: 'Missing text to convert.' }, { status: 400 })
  if (text.length > 12000) return NextResponse.json({ error: 'That text is too long (max 12,000 characters). Try a shorter excerpt.' }, { status: 413 })
  try {
    const outline = await grokChat(SYS, text)
    return NextResponse.json({ outline: stripFence(outline) })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'AI request failed' }, { status: 502 })
  }
}
