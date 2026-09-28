'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, useNodesState, useEdgesState, useReactFlow, getNodesBounds, getViewportForBounds, type Node, type Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { toPng, toSvg } from 'html-to-image'
import DiagramNode, { type D } from '@/components/DiagramNode'
import Icon from '@/components/Icons'
import { parse, serialize, icon, isStructured, type Tree, type InputMode } from '@/lib/parse'
import { layout, size, kids, type Mode } from '@/lib/layout'
import { EXAMPLES } from '@/lib/examples'

const nodeTypes = { n: DiagramNode }
const asData = (d: D) => d as unknown as Record<string, unknown>
const PAL = [{ n: 'Meadow', h: [152, 205, 168, 220, 140, 190] }, { n: 'Lagoon', h: [210, 190, 172, 225, 158, 200] }, { n: 'Forest', h: [140, 122, 158, 104, 172, 132] }, { n: 'Amber', h: [32, 152, 210, 44, 168, 222] }]
type EdgeT = 'default' | 'smoothstep' | 'straight'
const nid = () => 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
const fromJson = (j: any, d = 0): string => Array.isArray(j) ? j.map(x => fromJson(x, d)).join('') : typeof j === 'string' ? '  '.repeat(d) + j + '\n' : '  '.repeat(d) + String(j.label ?? j.name ?? j.title ?? 'Item') + '\n' + (j.children ?? []).map((c: any) => fromJson(c, d + 1)).join('') // eslint-disable-line
const SHORTCUTS: [string, string][] = [['Tab', 'Add child to selected node'], ['Enter', 'Add sibling'], ['Delete', 'Delete selected node'], ['F2', 'Rename selected node'], ['Space', 'Collapse / expand'], ['← → ↑ ↓', 'Move selection through the tree'], ['Ctrl + Z', 'Undo'], ['Ctrl + Shift + Z', 'Redo'], ['Ctrl + K', 'Search nodes'], ['Enter / Shift+Enter', 'Next / previous search match'], ['?', 'Show this help'], ['Esc', 'Close / deselect / exit presentation']]

function App() {
  const [text, setText] = useState(EXAMPLES[0][1]), [im, setIM] = useState<InputMode>('auto')
  const [tree, setTree] = useState<Tree | null>(null), [err, setErr] = useState(''), [col, setCol] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<Mode>('tree'), [sel, setSel] = useState<string | null>(null), [q, setQ] = useState('')
  const [live, setLive] = useState(true), [dark, setDark] = useState(false), [tab, setTab] = useState('diagram'), [label, setLabel] = useState('')
  const [pal, setPal] = useState(0), [edgeT, setEdgeT] = useState<EdgeT>('default'), [snap, setSnap] = useState(false), [showMap, setShowMap] = useState(true)
  const [view, setView] = useState(false), [help, setHelp] = useState(false), [toast, setToast] = useState(''), [drag, setDrag] = useState(false)
  const [present, setPresent] = useState(false), [pi, setPi] = useState(0), [dp, setDp] = useState<number | null>(null), [mi, setMi] = useState(-1)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]), [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const { fitView } = useReactFlow(), skip = useRef(false)
  const nameRef = useRef<HTMLInputElement>(null), searchRef = useRef<HTMLInputElement>(null), fileRef = useRef<HTMLInputElement>(null)
  const H = useRef({ s: [] as string[], i: -1, t: 0, skip: false }), toastT = useRef(0), K = useRef<(e: KeyboardEvent) => void>(() => {})
  const hue = useCallback((br: number) => { const h = PAL[pal].h; return h[br % h.length] }, [pal])
  const say = (m: string) => { setToast(m); clearTimeout(toastT.current); toastT.current = window.setTimeout(() => setToast(''), 2200) }

  const gen = useCallback((t: string, m: InputMode) => {
    if (!t.trim()) { setTree(null); setErr(''); return }
    try { setTree(parse(t, m)); setCol(new Set()); setDp(null); setSel(null); setErr('') }
    catch { setErr('Unable to understand the hierarchy. Try indentation, bullets ("- item"), tree characters (├── └── │) or plain sentences.') }
  }, [])

  useEffect(() => { // restore session + share links + theme
    let s: any = null // eslint-disable-line
    try { s = JSON.parse(localStorage.getItem('ttd:v1') || 'null') } catch {}
    if (location.hash.startsWith('#t=')) setText(decodeURIComponent(location.hash.slice(3)))
    else if (s?.text) setText(s.text)
    if (s) { if (s.mode) setMode(s.mode); if (typeof s.pal === 'number' && s.pal >= 0 && s.pal < PAL.length) setPal(s.pal); if (s.edgeT) setEdgeT(s.edgeT); if (typeof s.snap === 'boolean') setSnap(s.snap); if (typeof s.showMap === 'boolean') setShowMap(s.showMap) }
    setDark(typeof s?.dark === 'boolean' ? s.dark : matchMedia('(prefers-color-scheme: dark)').matches)
  }, [])
  useEffect(() => { try { localStorage.setItem('ttd:v1', JSON.stringify({ text, mode, pal, edgeT, dark, snap, showMap })) } catch {} }, [text, mode, pal, edgeT, dark, snap, showMap])
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light' }, [dark])
  useEffect(() => { // live preview, debounced
    if (skip.current) { skip.current = false; return }
    if (!live && tree) return
    const t = setTimeout(() => gen(text, im), tree ? 400 : 0); return () => clearTimeout(t)
  }, [text, im, live]) // eslint-disable-line

  // ---- undo / redo (snapshots of the text) ----
  const push = (t: string) => { const h = H.current; if (h.s[h.i] === t) return; h.s = h.s.slice(0, h.i + 1); h.s.push(t); if (h.s.length > 100) h.s.shift(); h.i = h.s.length - 1 }
  useEffect(() => { const h = H.current; if (h.skip) { h.skip = false; return } clearTimeout(h.t); h.t = window.setTimeout(() => push(text), 500) }, [text])
  const jump = (t: string) => { if (t !== text) { H.current.skip = true; setText(t) } gen(t, im) }
  const undo = () => { const h = H.current; clearTimeout(h.t); push(text); if (h.i > 0) { h.i--; jump(h.s[h.i]); say('Undo') } else say('Nothing to undo') }
  const redo = () => { const h = H.current; clearTimeout(h.t); if (h.i < h.s.length - 1) { h.i++; jump(h.s[h.i]); say('Redo') } else say('Nothing to redo') }

  const hit = useMemo(() => {
    const s = new Set<string>(), m = new Set<string>()
    if (tree && q) for (const n of Object.values(tree.nodes)) if (n.label.toLowerCase().includes(q.toLowerCase())) { m.add(n.id); let x: string | null = n.id; while (x) { s.add(x); x = tree.nodes[x].parent } }
    return { s, m }
  }, [tree, q])
  const stats = useMemo(() => { if (!tree) return null; const ns = Object.values(tree.nodes); return { n: ns.length, d: Math.max(...ns.map(x => x.level)) + 1, l: ns.filter(x => !x.children.length).length } }, [tree])
  const maxD = stats ? stats.d - 1 : 0
  const order = useMemo(() => { const o: string[] = []; if (tree) { const w = (i: string) => { o.push(i); tree.nodes[i].children.forEach(w) }; w(tree.root) } return o }, [tree])
  const toggle = useCallback((id: string) => setCol(c => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n }), [])
  const mk = useCallback((id: string): D => {
    const n = tree!.nodes[id]
    return { label: n.label, level: n.level, hue: hue(n.br), icon: icon(n.label), count: n.children.length, collapsed: col.has(id), dim: !!q && !hit.s.has(id), hit: hit.m.has(id), sel: sel === id, vert: mode === 'tree', center: mode === 'mind' || mode === 'radial', toggle: () => toggle(id) }
  }, [tree, col, q, hit, sel, mode, toggle, hue])

  useEffect(() => { // layout: only when structure/mode changes (keeps manual drags otherwise)
    if (!tree) { setNodes([]); setEdges([]); return }
    const pos = layout(tree, col, mode), straight = mode === 'mind' || mode === 'radial'
    setNodes(Object.entries(pos).map(([id, p]) => { const n = tree.nodes[id], s = size(n.label, n.level); return { id, type: 'n', position: { x: p.x - s.w / 2, y: p.y - s.h / 2 }, style: { width: s.w, height: s.h }, data: asData(mk(id)) } }))
    setEdges(Object.keys(pos).flatMap(id => kids(tree, col, id).map(k => ({ id: id + '-' + k, source: id, target: k, type: straight && edgeT === 'default' ? 'straight' : edgeT, style: { stroke: `hsl(${hue(tree.nodes[k].br)} var(--node-s) var(--node-l))`, strokeWidth: 2 } }))))
    if (present) return
    const t = setTimeout(() => fitView({ duration: 500, padding: 0.15 }), 60); return () => clearTimeout(t)
  }, [tree, col, mode, pal, edgeT]) // eslint-disable-line
  useEffect(() => { if (tree) setNodes(ns => ns.map(n => (tree.nodes[n.id] ? { ...n, data: asData(mk(n.id)) } : n))) }, [mk]) // eslint-disable-line
  useEffect(() => { if (tree && sel && tree.nodes[sel]) setLabel(tree.nodes[sel].label) }, [sel]) // eslint-disable-line
  useEffect(() => { // presentation: fly to the current node
    if (!present || !order[pi]) return
    setSel(order[pi]); const t = setTimeout(() => fitView({ nodes: [{ id: order[pi] }], duration: 650, maxZoom: 1.5, padding: 0.9 }), pi === 0 ? 400 : 60); return () => clearTimeout(t)
  }, [present, pi, order]) // eslint-disable-line

  const edit = (f: (t: Tree) => void) => { if (!tree) return; const t: Tree = structuredClone(tree); f(t); skip.current = true; setTree(t); setText(serialize(t)) }
  const s = tree && sel ? tree.nodes[sel] : null
  const focusName = () => setTimeout(() => { nameRef.current?.focus(); nameRef.current?.select() }, 130)
  const addChild = () => { edit(t => { const p = t.nodes[sel!], id = nid(); t.nodes[id] = { id, label: label && label !== p.label ? label : 'New node', parent: p.id, children: [], level: p.level + 1, br: p.level === 0 ? p.children.length : p.br }; p.children.push(id); setCol(c => { const n = new Set(c); n.delete(p.id); return n }); setSel(id) }); focusName() }
  const addSibling = () => { if (!s?.parent) return; edit(t => { const n = t.nodes[sel!], p = t.nodes[n.parent!], id = nid(); t.nodes[id] = { id, label: 'New node', parent: p.id, children: [], level: n.level, br: p.level === 0 ? p.children.length : n.br }; p.children.splice(p.children.indexOf(n.id) + 1, 0, id); setSel(id) }); focusName() }
  const del = () => edit(t => { const rm = (i: string) => { t.nodes[i].children.forEach(rm); delete t.nodes[i] }; const p = t.nodes[t.nodes[sel!].parent!]; p.children = p.children.filter(i => i !== sel); rm(sel!); setSel(null) })
  const rename = () => label.trim() && edit(t => { t.nodes[sel!].label = label.trim() })
  const search = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || !tree || !q) return
    const ms = Object.values(tree.nodes).filter(n => n.label.toLowerCase().includes(q.toLowerCase())); if (!ms.length) return
    const i = mi < 0 ? (e.shiftKey ? ms.length - 1 : 0) : (mi + (e.shiftKey ? -1 : 1) + ms.length) % ms.length, m = ms[i]; setMi(i)
    setCol(c => { const n = new Set(c); let x = m.parent; while (x) { n.delete(x); x = tree.nodes[x].parent }; return n }); setSel(m.id)
    setTimeout(() => fitView({ nodes: [{ id: m.id }], duration: 500, maxZoom: 1.3 }), 150)
  }
  const applyDepth = (d: number) => { if (!tree) return; setDp(d); setCol(d >= maxD ? new Set() : new Set(Object.values(tree.nodes).filter(n => n.level === d && n.children.length).map(n => n.id))) }
  const collapseAll = () => { if (!tree) return; setDp(null); setCol(new Set(Object.values(tree.nodes).filter(n => n.level >= 1 && n.children.length).map(n => n.id))) }
  const startPresent = () => { if (!tree) return say('Create a diagram first'); setCol(new Set()); setDp(null); setPi(0); setView(false); setPresent(true) }
  const exitPresent = () => { setPresent(false); setSel(null); setTimeout(() => fitView({ duration: 500, padding: 0.15 }), 80) }

  const dl = (u: string, n: string) => { const a = document.createElement('a'); a.href = u; a.download = n; a.click() }
  const exp = async (f: string) => {
    if (!tree || !f) return
    if (f === 'json') { const o = (id: string): unknown => ({ label: tree.nodes[id].label, children: tree.nodes[id].children.map(o) }); dl('data:application/json,' + encodeURIComponent(JSON.stringify(o(tree.root), null, 2)), 'diagram.json'); return say('JSON exported') }
    if (f === 'mermaid') { const m = 'graph TD\n' + Object.values(tree.nodes).flatMap(n => n.children.map(c => `  ${n.id}["${n.label.replace(/"/g, "'")}"] --> ${c}["${tree.nodes[c].label.replace(/"/g, "'")}"]`)).join('\n'); navigator.clipboard?.writeText(m); dl('data:text/plain,' + encodeURIComponent(m), 'diagram.mmd'); return say('Mermaid saved and copied') }
    if (f === 'md') { const o = (id: string, d: number): string => (d ? '  '.repeat(d - 1) + '- ' : '# ') + tree.nodes[id].label + '\n' + tree.nodes[id].children.map(c => o(c, d + 1)).join(''); const m = o(tree.root, 0); navigator.clipboard?.writeText(m); dl('data:text/markdown,' + encodeURIComponent(m), 'diagram.md'); return say('Markdown outline saved and copied') }
    const b = getNodesBounds(nodes), W = Math.max(800, b.width + 160), H2 = Math.max(500, b.height + 160), v = getViewportForBounds(b, W, H2, 0.1, 4, 0.05)
    const o = { backgroundColor: getComputedStyle(document.body).backgroundColor, width: W, height: H2, pixelRatio: 2, style: { width: `${W}px`, height: `${H2}px`, transform: `translate(${v.x}px,${v.y}px) scale(${v.zoom})` } }
    const el = document.querySelector('.react-flow__viewport') as HTMLElement
    if (f === 'clip') { try { const blob = await (await fetch(await toPng(el, o))).blob(); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); say('Image copied to clipboard') } catch { say('Your browser blocked clipboard access') } return }
    dl(f === 'png' ? await toPng(el, o) : await toSvg(el, o), 'diagram.' + f); say(f.toUpperCase() + ' exported')
  }
  const readFile = async (f: File) => {
    try {
      let t = await f.text(); if (t.length > 200000) return say('File is too large (max 200 KB)')
      if (/\.json$/i.test(f.name)) t = fromJson(JSON.parse(t)); else if (/\.(md|markdown)$/i.test(f.name)) t = t.replace(/^(\s*)#{1,6}\s+/gm, '$1')
      setText(t); setTab('diagram'); say('Imported ' + f.name)
    } catch { say('Could not read that file') }
  }
  const prose = im === 'prose' || (im === 'auto' && !!text.trim() && !isStructured(text))

  const onKey = (e: KeyboardEvent) => {
    const tg = e.target as HTMLElement, typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName), mod = e.ctrlKey || e.metaKey, k = e.key
    if (mod && k.toLowerCase() === 'k') { e.preventDefault(); searchRef.current?.focus(); return }
    if (k === 'Escape') { if (present) exitPresent(); else if (help) setHelp(false); else if (view) setView(false); else { setSel(null); (document.activeElement as HTMLElement)?.blur?.() } return }
    if (present) { if (['ArrowRight', 'ArrowDown', ' '].includes(k)) { e.preventDefault(); setPi(i => Math.min(i + 1, order.length - 1)) } else if (['ArrowLeft', 'ArrowUp'].includes(k)) { e.preventDefault(); setPi(i => Math.max(i - 1, 0)) } return }
    if (typing) return
    if (mod && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return }
    if (mod && k.toLowerCase() === 'y') { e.preventDefault(); redo(); return }
    if (k === '?') { setHelp(h => !h); return }
    if (!tree || !sel || !s || tg.tagName === 'BUTTON' || !(tg === document.body || tg.closest('.react-flow'))) return
    const sib = s.parent ? tree.nodes[s.parent].children : [sel], ix = sib.indexOf(sel)
    if (k === 'Tab') { e.preventDefault(); addChild() }
    else if (k === 'Enter' && s.parent) { e.preventDefault(); addSibling() }
    else if ((k === 'Delete' || k === 'Backspace') && s.parent) { e.preventDefault(); del() }
    else if (k === 'F2') { e.preventDefault(); nameRef.current?.focus(); nameRef.current?.select() }
    else if (k === ' ') { e.preventDefault(); if (s.children.length) toggle(sel) }
    else if (k === 'ArrowLeft' && s.parent) { e.preventDefault(); setSel(s.parent) }
    else if (k === 'ArrowRight' && s.children.length && !col.has(sel)) { e.preventDefault(); setSel(s.children[0]) }
    else if (k === 'ArrowUp' && ix > 0) { e.preventDefault(); setSel(sib[ix - 1]) }
    else if (k === 'ArrowDown' && ix < sib.length - 1) { e.preventDefault(); setSel(sib[ix + 1]) }
  }
  K.current = onKey
  useEffect(() => { const h = (e: KeyboardEvent) => K.current(e); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [])

  return (
    <div className="app" data-tab={tab} data-present={present ? '1' : '0'} onDragOver={e => { e.preventDefault(); if (!drag) setDrag(true) }} onDragLeave={e => { if (!e.relatedTarget) setDrag(false) }} onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) readFile(f) }}>
      <header>
        <div className="logo"><span className="mark"><Icon n="spark" size={18} /></span><div><b>Text → Diagram</b><small>Turn outlines into interactive maps</small></div></div>
        <select aria-label="Load an example" value="" onChange={e => { if (e.target.value) { setText(EXAMPLES[+e.target.value][1]); setTab('diagram') } }}><option value="">Examples…</option>{EXAMPLES.map((x, i) => <option key={i} value={i}>{x[0]}</option>)}</select>
        <label className="sw"><input type="checkbox" checked={live} onChange={e => setLive(e.target.checked)} /> Live preview</label>
        <button className="pri" onClick={() => { gen(text, im); setTab('diagram') }}><Icon n="spark" />Generate</button>
        <button onClick={() => { navigator.clipboard?.writeText(location.origin + location.pathname + '#t=' + encodeURIComponent(text)); say('Share link copied') }}>Copy share link</button>
        <button className="ico" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts" onClick={() => setHelp(true)}><Icon n="help" size={18} /></button>
        <button className="ico" title="Toggle theme" aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setDark(d => !d)}><Icon n={dark ? 'sun' : 'moon'} size={18} /></button>
      </header>
      <div className="tabs" role="tablist"><button role="tab" aria-selected={tab === 'input'} className={tab === 'input' ? 'on' : ''} onClick={() => setTab('input')}>Input</button><button role="tab" aria-selected={tab === 'diagram'} className={tab === 'diagram' ? 'on' : ''} onClick={() => setTab('diagram')}>Diagram</button></div>
      <main>
        <aside>
          <div className="ph"><b>Your outline</b><span>{text ? text.split('\n').length : 0} lines</span><div className="row"><button className="ico" title="Undo (Ctrl+Z)" aria-label="Undo" onClick={undo}><Icon n="undo" /></button><button className="ico" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" onClick={redo}><Icon n="redo" /></button></div></div>
          <div className="row"><select className="wide" aria-label="Input format" value={im} onChange={e => setIM(e.target.value as InputMode)}><option value="auto">Auto-detect</option><option value="tree">Structured</option><option value="prose">Plain text</option></select>{prose && <span className="badge">Converting plain text</span>}</div>
          <textarea aria-label="Outline text" aria-invalid={!!err} aria-describedby="outline-err" value={text} spellCheck={false} onChange={e => setText(e.target.value)} placeholder={'Paste a tree, an indented list, bullets — or just write sentences.\n\nProject\n├── Frontend\n└── Backend\n\nTip: drop a .txt, .md or .json file anywhere to import it.'} />
          <div className="err" id="outline-err" role="alert">{err}</div>
          <div className="row"><button onClick={() => setText('')}>Clear</button><button onClick={() => setText(EXAMPLES[0][1])}>Load example</button><button onClick={() => fileRef.current?.click()}>Import file</button>
            <input ref={fileRef} type="file" hidden accept=".txt,.md,.markdown,.json,text/plain" onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = '' }} /></div>
        </aside>
        <section className="cv">
          {!tree && <div className="empty"><div>
            <svg className="ghost-art" viewBox="0 0 300 130" fill="none" aria-hidden="true">
              <path d="M84 65H118C130 65 130 30 142 30H176M118 65C130 65 130 100 142 100H176" stroke="var(--border-strong)" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M226 30H240M226 100H240" stroke="var(--border-strong)" strokeWidth="2.5" strokeLinecap="round" />
              <rect x="8" y="46" width="76" height="38" rx="12" fill="var(--primary)" />
              <rect x="176" y="14" width="50" height="32" rx="10" fill="var(--secondary-soft)" stroke="var(--secondary)" strokeWidth="2" />
              <rect x="176" y="84" width="50" height="32" rx="10" fill="var(--primary-soft)" stroke="var(--primary)" strokeWidth="2" />
              <rect x="240" y="20" width="44" height="20" rx="8" fill="var(--surface)" stroke="var(--border-strong)" strokeWidth="2" />
              <rect x="240" y="90" width="44" height="20" rx="8" fill="var(--surface)" stroke="var(--border-strong)" strokeWidth="2" />
            </svg>
            <h2>Turn ideas into diagrams</h2><p>Paste structured text — or plain sentences — and get an interactive map.</p><button className="pri" onClick={() => setText(EXAMPLES[0][1])}>Try an Example</button></div></div>}
          <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={(_, n) => setSel(n.id)} onNodeDoubleClick={(_, n) => tree && tree.nodes[n.id].children.length && toggle(n.id)} onPaneClick={() => { if (!present) setSel(null); setView(false) }} colorMode={dark ? 'dark' : 'light'} minZoom={0.1} maxZoom={3} nodesConnectable={false} snapToGrid={snap} snapGrid={[20, 20]} onlyRenderVisibleElements proOptions={{ hideAttribution: true }}>
            <Background gap={24} size={1.6} /><Controls showInteractive={false} />{showMap && <MiniMap pannable zoomable nodeBorderRadius={6} />}
          </ReactFlow>
          <div className="glass sr"><Icon n="search" size={15} /><input ref={searchRef} aria-label="Search nodes" value={q} onChange={e => { setQ(e.target.value); setMi(-1) }} onKeyDown={search} placeholder="Search nodes…  Ctrl K" />{q && <span className="cnt">{hit.m.size}</span>}</div>
          {stats && <div className="glass st"><span><b>{stats.n}</b> nodes</span><span><b>{stats.d}</b> levels</span><span><b>{stats.l}</b> leaves</span></div>}
          {s && !present && <div className="glass pn"><div className="pt"><span className="dot" style={{ ['--h' as string]: hue(s.br) }} /><b>{s.label}</b></div><small>{s.parent ? 'Parent: ' + tree!.nodes[s.parent].label : 'Root node'} · {s.children.length} children</small>
            <input ref={nameRef} aria-label="Node name" value={label} onChange={e => setLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { rename(); (e.target as HTMLInputElement).blur() } }} />
            <div className="row">{s.children.length > 0 && <button onClick={() => toggle(s.id)}>{col.has(s.id) ? 'Expand' : 'Collapse'}</button>}<button onClick={() => fitView({ nodes: [{ id: s.id }], duration: 500, maxZoom: 1.3 })}>Focus</button><button onClick={rename}>Rename</button><button className="pri" onClick={addChild}><Icon n="plus" size={14} />Child</button>{s.parent && <button onClick={addSibling}><Icon n="plus" size={14} />Sibling</button>}{s.parent && <button className="danger" onClick={del}>Delete</button>}</div></div>}
          {view && !present && <div className="glass vw">
            <div className="vt">Color theme</div>
            <div className="pals">{PAL.map((p, i) => <button key={p.n} className={'pal' + (pal === i ? ' on' : '')} title={p.n} aria-label={p.n + ' color theme'} aria-pressed={pal === i} onClick={() => setPal(i)} style={{ background: `linear-gradient(90deg,${p.h.slice(0, 3).map(x => `hsl(${x} 48% 48%)`).join(',')})` }} />)}</div>
            <div className="vt">Connectors</div>
            <div className="seg3">{([['default', 'Curved'], ['smoothstep', 'Step'], ['straight', 'Straight']] as [EdgeT, string][]).map(([k, l]) => <button key={k} className={edgeT === k ? 'on' : ''} onClick={() => setEdgeT(k)}>{l}</button>)}</div>
            {tree && <><div className="vt">Levels shown <span>{(dp ?? maxD) + 1} / {maxD + 1}</span></div>
              <input type="range" min={0} max={maxD} value={dp ?? maxD} onChange={e => applyDepth(+e.target.value)} />
              <div className="row"><button onClick={() => { setCol(new Set()); setDp(null) }}>Expand all</button><button onClick={collapseAll}>Collapse all</button></div></>}
            <label className="sw"><input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)} /> Snap to grid</label>
            <label className="sw"><input type="checkbox" checked={showMap} onChange={e => setShowMap(e.target.checked)} /> Show minimap</label>
          </div>}
          {present && <div className="glass pbar"><button onClick={() => setPi(i => Math.max(i - 1, 0))} disabled={pi === 0} aria-label="Previous"><Icon n="left" /></button><div className="pt2"><b>{tree?.nodes[order[pi]]?.label}</b><small>{pi + 1} / {order.length} · arrow keys to move</small></div><button onClick={() => setPi(i => Math.min(i + 1, order.length - 1))} disabled={pi >= order.length - 1} aria-label="Next"><Icon n="right" /></button><button className="danger" onClick={exitPresent}>Exit</button><i style={{ width: ((pi + 1) / Math.max(order.length, 1)) * 100 + '%' }} /></div>}
          <div className="glass bar">
            <select aria-label="Diagram layout" value={mode} onChange={e => setMode(e.target.value as Mode)}><option value="tree">Tree</option><option value="lr">Left → Right</option><option value="mind">Mind Map</option><option value="radial">Radial</option></select>
            <button onClick={() => { setSel(null); setCol(new Set(col)) }}><Icon n="refresh" />Re-layout</button>
            <button aria-pressed={view} aria-expanded={view} onClick={() => setView(v => !v)}><Icon n="eye" />View</button>
            <button className="ico" title="Fullscreen" aria-label="Fullscreen" onClick={() => document.fullscreenElement ? document.exitFullscreen() : document.querySelector('.cv')?.requestFullscreen()}><Icon n="expand" /></button>
            <select aria-label="Export diagram" value="" onChange={e => exp(e.target.value)}><option value="">Export…</option><option value="png">PNG image</option><option value="svg">SVG</option><option value="clip">Copy image</option><option value="json">JSON</option><option value="md">Markdown outline</option><option value="mermaid">Copy Mermaid</option></select>
            <button className="pri" onClick={startPresent}><Icon n="play" size={14} />Present</button>
          </div>
        </section>
      </main>
      {help && <div className="modal" onClick={() => setHelp(false)}><div className="glass mcard" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={e => e.stopPropagation()}><div className="ph"><b>Keyboard shortcuts</b><button className="ico" aria-label="Close" onClick={() => setHelp(false)}><Icon n="close" /></button></div><div className="krows">{SHORTCUTS.map(([k, d]) => <div key={k}><kbd>{k}</kbd><span>{d}</span></div>)}</div></div></div>}
      {drag && <div className="drop"><div>Drop a .txt, .md or .json file to import</div></div>}
      <div className={'toast' + (toast ? ' show' : '')} role="status">{toast}</div>
    </div>
  )
}
export default function Page() { return <ReactFlowProvider><App /></ReactFlowProvider> }
