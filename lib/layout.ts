import * as dagre from '@dagrejs/dagre'
import type { Tree } from './parse'
export type Mode = 'tree' | 'lr' | 'mind' | 'radial'
type P = Record<string, { x: number; y: number }>
export const size = (l: string, lv: number) => ({ w: Math.max(lv === 0 ? 190 : lv === 1 ? 150 : 130, l.length * 8.4 + 60), h: lv === 0 ? 64 : lv === 1 ? 46 : 36 })
export const kids = (t: Tree, col: Set<string>, id: string) => (col.has(id) ? [] : t.nodes[id].children)
const vis = (t: Tree, col: Set<string>, id: string): string[] => [id, ...kids(t, col, id).flatMap(k => vis(t, col, k))]

function dag(t: Tree, col: Set<string>, ids: string[], dir: string): P {
  const g = new dagre.graphlib.Graph(); g.setGraph({ rankdir: dir, nodesep: 22, ranksep: 80 }); g.setDefaultEdgeLabel(() => ({}))
  const S = new Set(ids)
  ids.forEach(i => { const n = t.nodes[i], s = size(n.label, n.level); g.setNode(i, { width: s.w, height: s.h }) })
  ids.forEach(i => kids(t, col, i).forEach(k => S.has(k) && g.setEdge(i, k)))
  dagre.layout(g); const o: P = {}; ids.forEach(i => { const n = g.node(i); o[i] = { x: n.x, y: n.y } }); return o
}

/** Returns node CENTER positions for the visible part of the tree. */
export function layout(t: Tree, col: Set<string>, mode: Mode): P {
  const all = vis(t, col, t.root)
  if (mode === 'tree' || mode === 'lr') return dag(t, col, all, mode === 'tree' ? 'TB' : 'LR')
  if (mode === 'mind') {
    const k = kids(t, col, t.root), h = Math.ceil(k.length / 2)
    const grp = (ks: string[]) => [t.root, ...ks.flatMap(x => vis(t, col, x))]
    const a = dag(t, col, grp(k.slice(0, h)), 'LR'), b = dag(t, col, grp(k.slice(h)), 'RL')
    const dx = a[t.root].x - b[t.root].x, dy = a[t.root].y - b[t.root].y
    for (const i in b) if (i !== t.root) a[i] = { x: b[i].x + dx, y: b[i].y + dy }
    return a
  }
  const L: Record<string, number> = {}; const lc = (i: string): number => (L[i] = kids(t, col, i).reduce((s, c) => s + lc(c), 0) || 1); lc(t.root)
  const o: P = {}
  const rec = (i: string, a0: number, a1: number) => {
    const m = (a0 + a1) / 2, r = t.nodes[i].level * 240; o[i] = { x: Math.cos(m) * r, y: Math.sin(m) * r }
    let s = a0; kids(t, col, i).forEach(c => { const e = s + ((a1 - a0) * L[c]) / L[i]; rec(c, s, e); s = e })
  }
  rec(t.root, -Math.PI / 2, 1.5 * Math.PI); return o
}
