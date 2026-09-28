export type TNode = { id: string; label: string; parent: string | null; children: string[]; level: number; br: number }
export type Tree = { nodes: Record<string, TNode>; root: string }
export type InputMode = 'auto' | 'tree' | 'prose'

const ICONS: [RegExp, string][] = [['secur|shield|abuse','🛡️'],['auth|login|password|token|key','🔑'],['cache|caching','💾'],['data|sql|storage|retriev','🗄️'],['perform|speed|latency','⚡'],['api|endpoint|rest|http|resource','🧩'],['test|qa','🧪'],['deploy|release|docker|ci/cd|ops','🚀'],['monitor|log|observ|metric','📈'],['front|ui|react|page|component|web|mobile|client|design','🖥️'],['back|server|service|order|platform','⚙️'],['network|dns|cdn|gateway|rout','🌐'],['user|customer|team|people|org','👤'],['pay|billing|checkout|invoice|financ|budget|pricing|funding','💳'],['analytic|report|chart','📊'],['market|social|campaign','📣'],['version|evolution|git|branch|source','🌿'],['reliab|retry|retries|timeout|rate|limit','🔁']].map(([r, e]) => [new RegExp('\\b(' + r + ')', 'i'), e] as [RegExp, string])
export const icon = (l: string) => ICONS.find(([r]) => r.test(l))?.[1] ?? '●'

/** Tree characters, indentation or bullets => structured. Anything else is treated as prose. */
export const isStructured = (t: string) => /[├└│]/.test(t) || /^\s*[-*•+]\s+/m.test(t) || /^[ \t]+\S/m.test(t)

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const cut = (s: string) => (s.length > 42 ? s.slice(0, 40).trim() + '…' : s)
const items = (s: string) => s.split(/,\s*|;\s*|\s+and\s+|\s+or\s+/).map(x => x.replace(/^(and|or)\s+/i, '').trim()).filter(Boolean)

/** Plain sentences => bullet outline. "Heading: a, b and c" becomes a branch with leaves. */
export function proseToText(t: string) {
  const ps = t.split(/\n+/).map(s => s.trim()).filter(Boolean)
  const title = ps.length > 1 && ps[0].split(/\s+/).length <= 6 && !/[.:!?]$/.test(ps[0]) ? ps.shift()! : 'Overview'
  let o = title + '\n'
  for (const p of ps) for (const s of p.split(/(?<=[.!?])\s+/)) {
    const x = s.replace(/[.!?]+$/, '').trim(); if (!x) continue
    const m = x.match(/^([^:]{2,40}):\s*(.+)$/)
    const parts = m ? items(m[2]) : items(x), multi = !!m || parts.length > 1
    const head = m ? m[1] : multi ? parts.shift()! : x
    o += `- ${cut(cap(head))}\n`
    if (multi) parts.forEach(k => (o += `  - ${cut(cap(k))}\n`))
  }
  return o
}

export function parse(input: string, mode: InputMode = 'auto'): Tree {
  const prose = mode === 'prose' || (mode === 'auto' && !isStructured(input))
  const src = prose ? proseToText(input) : input
  const N: Record<string, TNode> = {}; let c = 0; const st: { id: string; ind: number }[] = []; const tops: string[] = []
  for (const raw of src.replace(/\t/g, '    ').split('\n')) {
    const m = raw.match(/^[\s│|├└┬┼─`]*(?:[-*•+]\s+)?/)![0]
    const label = raw.slice(m.length).trim().replace(/^\*\*(.*)\*\*$/, '$1'); if (!label) continue
    while (st.length && st[st.length - 1].ind >= m.length) st.pop()
    const p = st.length ? st[st.length - 1].id : null, id = 'n' + c++
    N[id] = { id, label, parent: p, children: [], level: 0, br: 0 }
    if (p) N[p].children.push(id); else tops.push(id)
    st.push({ id, ind: m.length })
  }
  if (!tops.length) throw new Error('empty')
  let root = tops[0]
  if (tops.length > 1) { root = 'root'; N.root = { id: 'root', label: 'Diagram', parent: null, children: tops, level: 0, br: 0 }; tops.forEach(i => (N[i].parent = 'root')) }
  const lv = (id: string, l: number, b: number) => { const n = N[id]; n.level = l; n.br = b; n.children.forEach((k, i) => lv(k, l + 1, l === 0 ? i : b)) }
  lv(root, 0, 0)
  return { nodes: N, root }
}

export function serialize(t: Tree) {
  const rec = (id: string, pre: string, last: boolean, root: boolean): string => {
    const n = t.nodes[id]; let s = root ? n.label + '\n' : pre + (last ? '└── ' : '├── ') + n.label + '\n'
    const cp = root ? '' : pre + (last ? '    ' : '│   ')
    n.children.forEach((k, i) => (s += rec(k, cp, i === n.children.length - 1, false))); return s
  }
  return rec(t.root, '', true, true)
}
