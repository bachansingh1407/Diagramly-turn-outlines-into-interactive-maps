import { NextRequest, NextResponse } from 'next/server'
import { saveShare, loadShare } from '@/lib/share/store'

const nid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const text = typeof body?.text === 'string' ? body.text : ''
  if (!text.trim()) return NextResponse.json({ error: 'There is no diagram to share yet.' }, { status: 400 })
  if (text.length > 100000) return NextResponse.json({ error: 'This diagram is too large to share as a link.' }, { status: 413 })
  const id = nid()
  await saveShare(id, {
    name: typeof body?.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 120) : 'Shared diagram',
    text,
    mode: typeof body?.mode === 'string' ? body.mode : 'tree',
    pal: typeof body?.pal === 'number' ? body.pal : 0,
    edgeT: typeof body?.edgeT === 'string' ? body.edgeT : 'default',
    createdAt: Date.now(),
  })
  return NextResponse.json({ id })
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const data = await loadShare(id)
  if (!data) return NextResponse.json({ error: 'This share link was not found. It may have been cleared from the server.' }, { status: 404 })
  return NextResponse.json(data)
}
