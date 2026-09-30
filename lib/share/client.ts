export async function createShareLink(payload: { text: string; name?: string; mode?: string; pal?: number; edgeT?: string }) {
  const r = await fetch('/api/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Could not create a share link.')
  return `${location.origin}/view/${data.id}` as string
}
