import type { ProjectData, Version, Comment } from './types'

const has = () => typeof window !== 'undefined'
const nid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
const KP = 'maptree:projects'
const KV = (id: string) => `maptree:versions:${id}`
const KC = (id: string) => `maptree:comments:${id}`
const MAX_VERSIONS = 40
const MAX_COMMENTS = 300

function read<T>(k: string, fallback: T): T {
  if (!has()) return fallback
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback } catch { return fallback }
}
function write(k: string, v: unknown) { if (has()) try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }

// ---- projects ----
export function listProjects(): ProjectData[] {
  return read<ProjectData[]>(KP, []).sort((a, b) => b.updatedAt - a.updatedAt)
}
export function getProject(id: string): ProjectData | undefined {
  return read<ProjectData[]>(KP, []).find(p => p.id === id)
}
export function createProject(name: string, seed: Partial<ProjectData>): ProjectData {
  const now = Date.now()
  const p: ProjectData = { id: nid(), name, text: '', mode: 'tree', pal: 0, edgeT: 'default', snap: false, showMap: true, createdAt: now, updatedAt: now, ...seed }
  const all = read<ProjectData[]>(KP, []); all.push(p); write(KP, all)
  return p
}
export function upsertProject(p: ProjectData) {
  const all = read<ProjectData[]>(KP, []); const i = all.findIndex(x => x.id === p.id)
  const next = { ...p, updatedAt: Date.now() }
  if (i >= 0) all[i] = next; else all.push(next)
  write(KP, all)
}
export function renameProject(id: string, name: string) {
  const p = getProject(id); if (p) upsertProject({ ...p, name })
}
export function deleteProject(id: string) {
  write(KP, read<ProjectData[]>(KP, []).filter(p => p.id !== id))
  write(KV(id), []); write(KC(id), [])
}
export function duplicateProject(id: string): ProjectData | undefined {
  const p = getProject(id); if (!p) return undefined
  return createProject(p.name + ' (copy)', { text: p.text, mode: p.mode, pal: p.pal, edgeT: p.edgeT, snap: p.snap, showMap: p.showMap })
}

// ---- version history ----
export function listVersions(projectId: string): Version[] {
  return read<Version[]>(KV(projectId), []).sort((a, b) => b.createdAt - a.createdAt)
}
export function snapshotVersion(projectId: string, text: string, label = 'Snapshot'): Version | null {
  const list = read<Version[]>(KV(projectId), [])
  if (list.length && list[list.length - 1].text === text) return null // skip duplicate
  const v: Version = { id: nid(), projectId, text, label, createdAt: Date.now() }
  list.push(v); if (list.length > MAX_VERSIONS) list.splice(0, list.length - MAX_VERSIONS)
  write(KV(projectId), list); return v
}
export function deleteVersion(projectId: string, versionId: string) {
  write(KV(projectId), read<Version[]>(KV(projectId), []).filter(v => v.id !== versionId))
}

// ---- comments (keyed by a stable label-path, since node ids reset on re-parse) ----
export function listComments(projectId: string): Comment[] {
  return read<Comment[]>(KC(projectId), []).sort((a, b) => a.createdAt - b.createdAt)
}
export function commentCounts(projectId: string): Record<string, number> {
  const o: Record<string, number> = {}
  for (const c of listComments(projectId)) o[c.path] = (o[c.path] || 0) + 1
  return o
}
export function addComment(projectId: string, path: string, body: string): Comment {
  const list = read<Comment[]>(KC(projectId), [])
  const c: Comment = { id: nid(), projectId, path, body, createdAt: Date.now() }
  list.push(c); if (list.length > MAX_COMMENTS) list.splice(0, list.length - MAX_COMMENTS)
  write(KC(projectId), list); return c
}
export function deleteComment(projectId: string, commentId: string) {
  write(KC(projectId), read<Comment[]>(KC(projectId), []).filter(c => c.id !== commentId))
}
