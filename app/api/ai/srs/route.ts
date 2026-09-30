import { NextRequest, NextResponse } from 'next/server'
import { grokChat, stripFence } from '@/lib/ai/xai'

const SYS: Record<'srs' | 'prd', string> = {
  srs: `You are a software architect. Write a formal Software Requirements Specification (SRS) in Markdown, grounded strictly in the given project outline.
Structure with headings: 1. Introduction (Purpose, Scope, Definitions) 2. Overall Description (Product Perspective, User Classes, Assumptions & Dependencies) 3. Functional Requirements — numbered "FR-1", "FR-2"... derived from the outline's branches and leaves 4. Non-Functional Requirements (performance, security, reliability, usability — infer sensibly from context, mark anything uncertain as "To be confirmed") 5. System Architecture Overview (brief, based on the outline) 6. Appendix: Outline Reference.
Output ONLY the Markdown document — no preamble, no commentary, no code fences.`,
  prd: `You are a senior product manager. Write a Product Requirements Document (PRD) in Markdown, grounded strictly in the given project outline.
Structure: 1. Overview & Problem Statement 2. Goals & Non-Goals 3. Target Users 4. Features — one section per major outline branch, each with a short user story ("As a ___, I want ___ so that ___") 5. Success Metrics 6. Risks & Open Questions.
Output ONLY the Markdown document — no preamble, no commentary, no code fences.`,
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const outline = typeof body?.outline === 'string' ? body.outline.trim() : ''
  const kind: 'srs' | 'prd' = body?.kind === 'prd' ? 'prd' : 'srs'
  const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 120) : 'Untitled project'
  if (!outline) return NextResponse.json({ error: 'Generate a diagram first so there is an outline to document.' }, { status: 400 })
  if (outline.length > 12000) return NextResponse.json({ error: 'This outline is too large to document in one pass.' }, { status: 413 })
  try {
    const md = await grokChat(SYS[kind], `Project name: ${name}\n\nOutline:\n${outline}`, { maxTokens: 2600 })
    return NextResponse.json({ markdown: stripFence(md) })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'AI request failed' }, { status: 502 })
  }
}
