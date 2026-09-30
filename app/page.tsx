'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, useNodesState, useEdgesState, useReactFlow, getNodesBounds, getViewportForBounds, type Node, type Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { toPng, toSvg } from 'html-to-image'
import DiagramNode, { type D } from '@/components/DiagramNode'
import Icon from '@/components/Icons'
import { parse, serialize, icon, isStructured, type Tree, type InputMode } from '@/lib/parse'
import { layout, size, kids, type Mode } from '@/lib/layout'
import { EXAMPLES, TEMPLATES } from '@/lib/examples'
import { createShareLink } from '@/lib/share/client'
import {
  listProjects, getProject, createProject, upsertProject, renameProject, deleteProject, duplicateProject,
  listVersions, snapshotVersion, deleteVersion,
  listComments, addComment, deleteComment,
} from '@/lib/store/local'
import type { ProjectData, Version, Comment as NoteT } from '@/lib/store/types'

const nodeTypes = { n: DiagramNode }
const asData = (d: D) => d as unknown as Record<string, unknown>
const PAL = [{ n: 'Meadow', h: [152, 205, 168, 220, 140, 190] }, { n: 'Lagoon', h: [210, 190, 172, 225, 158, 200] }, { n: 'Forest', h: [140, 122, 158, 104, 172, 132] }, { n: 'Amber', h: [32, 152, 210, 44, 168, 222] }]
type EdgeT = 'default' | 'smoothstep' | 'straight'
type AiJob = '' | 'diagram' | 'suggest' | 'srs' | 'prd' | 'share'
const nid = () => 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
const fromJson = (j: any, d = 0): string => Array.isArray(j) ? j.map(x => fromJson(x, d)).join('') : typeof j === 'string' ? '  '.repeat(d) + j + '\n' : '  '.repeat(d) + String(j.label ?? j.name ?? j.title ?? 'Item') + '\n' + (j.children ?? []).map((c: any) => fromJson(c, d + 1)).join('') // eslint-disable-line
const toOutline = (t: Tree, id: string, d = 0): string => '  '.repeat(d) + t.nodes[id].label + '\n' + t.nodes[id].children.map(c => toOutline(t, c, d + 1)).join('')
const rel = (ts: number) => { const s = (Date.now() - ts) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago' }
const SHORTCUTS: [string, string][] = [['Tab', 'Add child to selected node'], ['Enter', 'Add sibling'], ['Delete', 'Delete selected node'], ['F2', 'Rename selected node'], ['Space', 'Collapse / expand'], ['← → ↑ ↓', 'Move selection through the tree'], ['Ctrl + Z', 'Undo'], ['Ctrl + Shift + Z', 'Redo'], ['Ctrl + S', 'Save current project'], ['Ctrl + K', 'Search nodes'], ['Enter / Shift+Enter', 'Next / previous search match'], ['?', 'Show this help'], ['Esc', 'Close / deselect / exit presentation']]
const templateGroups = (() => { const o: Record<string, { i: number; name: string }[]> = {}; TEMPLATES.forEach((t, i) => { (o[t.category] ??= []).push({ i, name: t.name }) }); return Object.entries(o) })()

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

  // ---- projects, versions, notes ----
  const [projects, setProjects] = useState<ProjectData[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [showProjects, setShowProjects] = useState(false), [newName, setNewName] = useState('')
  const [showHistory, setShowHistory] = useState(false), [versions, setVersions] = useState<Version[]>([])
  const [notes, setNotes] = useState<NoteT[]>([]), [noteDraft, setNoteDraft] = useState('')
  const [aiBusy, setAiBusy] = useState<AiJob>(''), [suggestions, setSuggestions] = useState<string[]>([])
  const [shareOpen, setShareOpen] = useState(false), [shareUrl, setShareUrl] = useState('')
  const refreshProjects = () => setProjects(listProjects())
  const current = currentId ? projects.find(p => p.id === currentId) : undefined

  const gen = useCallback((t: string, m: InputMode) => {
    if (!t.trim()) { setTree(null); setErr(''); return }
    try { setTree(parse(t, m)); setCol(new Set()); setDp(null); setSel(null); setErr('') }
    catch { setErr('Unable to understand the hierarchy. Try indentation, bullets ("- item"), tree characters (├── └── │) or plain sentences.') }
  }, [])

  useEffect(() => { // restore session + share links + theme + projects
    let s: any = null // eslint-disable-line
    try { s = JSON.parse(localStorage.getItem('maptree:v1') || localStorage.getItem('ttd:v1') || 'null') } catch {}
    if (location.hash.startsWith('#t=')) setText(decodeURIComponent(location.hash.slice(3)))
    else if (s?.text) setText(s.text)
    if (s) { if (s.mode) setMode(s.mode); if (typeof s.pal === 'number' && s.pal >= 0 && s.pal < PAL.length) setPal(s.pal); if (s.edgeT) setEdgeT(s.edgeT); if (typeof s.snap === 'boolean') setSnap(s.snap); if (typeof s.showMap === 'boolean') setShowMap(s.showMap) }
    setDark(typeof s?.dark === 'boolean' ? s.dark : matchMedia('(prefers-color-scheme: dark)').matches)
    const ps = listProjects(); setProjects(ps)
    const cur = localStorage.getItem('maptree:current')
    if (cur && ps.find(p => p.id === cur)) setCurrentId(cur)
    else if (!ps.length && s?.text && s.text !== EXAMPLES[0][1]) { const p = createProject('My diagram', { text: s.text, mode: s.mode || 'tree', pal: s.pal ?? 0, edgeT: s.edgeT || 'default', snap: !!s.snap, showMap: s.showMap !== false }); setProjects(listProjects()); setCurrentId(p.id); localStorage.setItem('maptree:current', p.id) }
  }, [])
  useEffect(() => { try { localStorage.setItem('maptree:v1', JSON.stringify({ text, mode, pal, edgeT, dark, snap, showMap })) } catch {} }, [text, mode, pal, edgeT, dark, snap, showMap])
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light' }, [dark])
  useEffect(() => { setNotes(currentId ? listComments(currentId) : []) }, [currentId])
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
  const pathStrs = useMemo(() => { const o: Record<string, string> = {}; if (tree) { const w = (id: string, anc: string[]) => { const p = [...anc, tree.nodes[id].label]; o[id] = p.join(' > '); tree.nodes[id].children.forEach(c => w(c, p)) }; w(tree.root, []) } return o }, [tree])
  const noteCounts = useMemo(() => { const o: Record<string, number> = {}; for (const n of notes) o[n.path] = (o[n.path] || 0) + 1; return o }, [notes])
  const mk = useCallback((id: string): D => {
    const n = tree!.nodes[id]
    return { label: n.label, level: n.level, hue: hue(n.br), icon: icon(n.label), count: n.children.length, notes: noteCounts[pathStrs[id]] || 0, collapsed: col.has(id), dim: !!q && !hit.s.has(id), hit: hit.m.has(id), sel: sel === id, vert: mode === 'tree', center: mode === 'mind' || mode === 'radial', toggle: () => toggle(id) }
  }, [tree, col, q, hit, sel, mode, toggle, hue, noteCounts, pathStrs])

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
  useEffect(() => { setSuggestions([]) }, [sel])
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

  // ---- projects ----
  const saveProject = () => {
    if (current) { upsertProject({ ...current, text, mode, pal, edgeT, snap, showMap }); refreshProjects(); say(`Saved "${current.name}"`); return }
    const name = (newName.trim() || prompt('Name this project', 'Untitled diagram') || '').trim()
    if (!name) return
    const p = createProject(name, { text, mode, pal, edgeT, snap, showMap })
    setCurrentId(p.id); localStorage.setItem('maptree:current', p.id); setNewName(''); refreshProjects(); say(`Saved as "${name}"`)
  }
  const openProject = (p: ProjectData) => {
    setText(p.text); setMode(p.mode as Mode); setPal(p.pal); setEdgeT(p.edgeT as EdgeT); setSnap(p.snap); setShowMap(p.showMap)
    setCurrentId(p.id); localStorage.setItem('maptree:current', p.id); setSel(null); setCol(new Set()); setShowProjects(false); setTab('diagram'); say(`Opened "${p.name}"`)
  }
  const dupProject = (id: string) => { const p = duplicateProject(id); refreshProjects(); if (p) say(`Duplicated as "${p.name}"`) }
  const renameProjectHandler = (p: ProjectData) => { const n = prompt('Rename project', p.name); if (n?.trim()) { renameProject(p.id, n.trim()); refreshProjects() } }
  const delProject = (id: string) => {
    if (!confirm('Delete this project? Its version history and notes will be removed too.')) return
    deleteProject(id); if (id === currentId) { setCurrentId(null); localStorage.removeItem('maptree:current') }
    refreshProjects()
  }
  const newProject = () => { setText(''); setCurrentId(null); localStorage.removeItem('maptree:current'); setSel(null); setCol(new Set()); setTree(null); setShowProjects(false); setTab('input'); say('Started a new, unsaved diagram') }

  // ---- version history ----
  const openHistory = () => { if (!currentId) return say('Save this as a project first to use version history'); setVersions(listVersions(currentId)); setShowHistory(true) }
  const saveVersion = () => { if (!currentId) return; const v = snapshotVersion(currentId, text, 'Manual save'); setVersions(listVersions(currentId)); say(v ? 'Version saved' : 'No changes since the last version') }
  const restoreVersion = (v: Version) => { setText(v.text); setShowHistory(false); say('Restored version from ' + new Date(v.createdAt).toLocaleString()) }
  const rmVersion = (id: string) => { if (!currentId) return; deleteVersion(currentId, id); setVersions(listVersions(currentId)) }

  // ---- notes / comments ----
  const addNote = () => { if (!currentId || !sel || !noteDraft.trim()) return; addComment(currentId, pathStrs[sel], noteDraft.trim()); setNoteDraft(''); setNotes(listComments(currentId)) }
  const rmNote = (id: string) => { if (!currentId) return; deleteComment(currentId, id); setNotes(listComments(currentId)) }
  const selNotes = sel ? notes.filter(n => n.path === pathStrs[sel]) : []

  // ---- AI ----
  const aiGenerate = async () => {
    if (!text.trim()) return say('Type or paste something first')
    setAiBusy('diagram')
    try {
      const r = await fetch('/api/ai/diagram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
      const data = await r.json(); if (!r.ok) throw new Error(data.error || 'AI request failed')
      setText(data.outline); setIM('tree'); setTab('diagram'); say('AI structured your text')
    } catch (e: any) { say(e?.message || 'AI request failed') } finally { setAiBusy('') }
  }
  const suggestChildren = async () => {
    if (!tree || !sel) return
    setAiBusy('suggest'); setSuggestions([])
    try {
      const path = pathStrs[sel].split(' > '), existing = tree.nodes[sel].children.map(c => tree.nodes[c].label)
      const r = await fetch('/api/ai/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, existing }) })
      const data = await r.json(); if (!r.ok) throw new Error(data.error || 'AI request failed')
      setSuggestions(data.suggestions || []); if (!data.suggestions?.length) say('No new suggestions')
    } catch (e: any) { say(e?.message || 'AI request failed') } finally { setAiBusy('') }
  }
  const acceptSuggestion = (lbl: string) => {
    edit(t => { const p = t.nodes[sel!], id = nid(); t.nodes[id] = { id, label: lbl, parent: p.id, children: [], level: p.level + 1, br: p.level === 0 ? p.children.length : p.br }; p.children.push(id) })
    setSuggestions(s => s.filter(x => x !== lbl))
  }
  const genDoc = async (kind: 'srs' | 'prd') => {
    if (!tree) return say('Create a diagram first')
    setAiBusy(kind)
    try {
      const outline = toOutline(tree, tree.root)
      const r = await fetch('/api/ai/srs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ outline, kind, name: current?.name }) })
      const data = await r.json(); if (!r.ok) throw new Error(data.error || 'AI request failed')
      navigator.clipboard?.writeText(data.markdown)
      dl('data:text/markdown,' + encodeURIComponent(data.markdown), (kind === 'srs' ? 'SRS' : 'PRD') + '.md')
      say((kind === 'srs' ? 'SRS' : 'PRD') + ' generated and copied')
    } catch (e: any) { say(e?.message || 'AI request failed') } finally { setAiBusy('') }
  }

  // ---- share ----
  const quickLink = () => { const u = location.origin + location.pathname + '#t=' + encodeURIComponent(text); navigator.clipboard?.writeText(u); say('Quick link copied (works offline, can get long)') }
  const hostedLink = async () => {
    if (!tree) return say('Create a diagram first')
    setAiBusy('share')
    try { const u = await createShareLink({ text, name: current?.name, mode, pal, edgeT }); setShareUrl(u); navigator.clipboard?.writeText(u); say('Hosted link copied') }
    catch (e: any) { say(e?.message || 'Could not create link') } finally { setAiBusy('') }
  }

  const dl = (u: string, n: string) => { const a = document.createElement('a'); a.href = u; a.download = n; a.click() }
  const exp = async (f: string) => {
    if (!tree || !f) return
    if (f === 'ai-srs' || f === 'ai-prd') return genDoc(f === 'ai-srs' ? 'srs' : 'prd')
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
    if (mod && k.toLowerCase() === 's') { e.preventDefault(); saveProject(); return }
    if (k === 'Escape') { if (present) exitPresent(); else if (help) setHelp(false); else if (view) setView(false); else if (showProjects) setShowProjects(false); else if (showHistory) setShowHistory(false); else if (shareOpen) setShareOpen(false); else { setSel(null); (document.activeElement as HTMLElement)?.blur?.() } return }
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
        <div className="logo"><span className="mark"><Icon n="spark" size={18} /></span><div><b>MapTree</b><small>{current ? current.name : 'Turn ideas into interactive maps'}</small></div></div>
        <select aria-label="Load a template" value="" onChange={e => { if (e.target.value) { setText(EXAMPLES[+e.target.value][1]); setTab('diagram') } }}>
          <option value="">Templates…</option>
          {templateGroups.map(([cat, items]) => <optgroup key={cat} label={cat}>{items.map(x => <option key={x.i} value={x.i}>{x.name}</option>)}</optgroup>)}
        </select>
        <label className="sw"><input type="checkbox" checked={live} onChange={e => setLive(e.target.checked)} /> Live preview</label>
        <button className="pri" disabled={aiBusy === 'diagram'} onClick={() => { gen(text, im); if (currentId) snapshotVersion(currentId, text, 'Generate'); setTab('diagram') }}><Icon n="spark" />Generate</button>
        <button disabled={aiBusy === 'diagram'} onClick={aiGenerate}><Icon n="spark" />{aiBusy === 'diagram' ? 'Thinking…' : 'AI Generate'}</button>
        <button onClick={() => setShowProjects(true)}>Projects{projects.length ? ` (${projects.length})` : ''}</button>
        <button onClick={() => setShareOpen(true)}>Share</button>
        <button className="ico" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts" onClick={() => setHelp(true)}><Icon n="help" size={18} /></button>
        <button className="ico" title="Toggle theme" aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setDark(d => !d)}><Icon n={dark ? 'sun' : 'moon'} size={18} /></button>
      </header>
      <div className="tabs" role="tablist"><button role="tab" aria-selected={tab === 'input'} className={tab === 'input' ? 'on' : ''} onClick={() => setTab('input')}>Input</button><button role="tab" aria-selected={tab === 'diagram'} className={tab === 'diagram' ? 'on' : ''} onClick={() => setTab('diagram')}>Diagram</button></div>
      <main>
        <aside>
          <div className="ph"><b>Your outline</b><span>{text ? text.split('\n').length : 0} lines</span><div className="row"><button className="ico" title="Undo (Ctrl+Z)" aria-label="Undo" onClick={undo}><Icon n="undo" /></button><button className="ico" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" onClick={redo}><Icon n="redo" /></button></div></div>
          <div className="row"><select className="wide" aria-label="Input format" value={im} onChange={e => setIM(e.target.value as InputMode)}><option value="auto">Auto-detect</option><option value="tree">Structured</option><option value="prose">Plain text</option></select>{prose && <span className="badge">Converting plain text</span>}</div>
          <textarea aria-label="Outline text" aria-invalid={!!err} aria-describedby="outline-err" value={text} spellCheck={false} onChange={e => setText(e.target.value)} placeholder={'Paste a tree, an indented list, bullets, or messy notes — then try AI Generate.\n\nProject\n├── Frontend\n└── Backend\n\nTip: drop a .txt, .md or .json file anywhere to import it.'} />
          <div className="err" id="outline-err" role="alert">{err}</div>
          <div className="row"><button onClick={() => setText('')}>Clear</button><button onClick={() => setText(EXAMPLES[0][1])}>Load example</button><button onClick={() => fileRef.current?.click()}>Import file</button>
            <input ref={fileRef} type="file" hidden accept=".txt,.md,.markdown,.json,text/plain" onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = '' }} /></div>
          <p className="hint">Paste anything — a rough paragraph, meeting notes, a spec — and <b>AI Generate</b> will restructure it into a clean outline before drawing the map.</p>
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
            <h2>Turn ideas into diagrams</h2><p>Paste structured text, plain sentences, or messy notes — MapTree (and optionally AI) turns it into an interactive map.</p><button className="pri" onClick={() => setText(EXAMPLES[0][1])}>Try an Example</button></div></div>}
          <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={(_, n) => setSel(n.id)} onNodeDoubleClick={(_, n) => tree && tree.nodes[n.id].children.length && toggle(n.id)} onPaneClick={() => { if (!present) setSel(null); setView(false) }} colorMode={dark ? 'dark' : 'light'} minZoom={0.1} maxZoom={3} nodesConnectable={false} snapToGrid={snap} snapGrid={[20, 20]} onlyRenderVisibleElements proOptions={{ hideAttribution: true }}>
            <Background gap={24} size={1.6} /><Controls showInteractive={false} />{showMap && <MiniMap pannable zoomable nodeBorderRadius={6} />}
          </ReactFlow>
          <div className="glass sr"><Icon n="search" size={15} /><input ref={searchRef} aria-label="Search nodes" value={q} onChange={e => { setQ(e.target.value); setMi(-1) }} onKeyDown={search} placeholder="Search nodes…  Ctrl K" />{q && <span className="cnt">{hit.m.size}</span>}</div>
          {stats && <div className="glass st"><span><b>{stats.n}</b> nodes</span><span><b>{stats.d}</b> levels</span><span><b>{stats.l}</b> leaves</span></div>}
          {s && !present && <div className="glass pn"><div className="pt"><span className="dot" style={{ ['--h' as string]: hue(s.br) }} /><b>{s.label}</b></div><small>{s.parent ? 'Parent: ' + tree!.nodes[s.parent].label : 'Root node'} · {s.children.length} children</small>
            <input ref={nameRef} aria-label="Node name" value={label} onChange={e => setLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { rename(); (e.target as HTMLInputElement).blur() } }} />
            <div className="row">{s.children.length > 0 && <button onClick={() => toggle(s.id)}>{col.has(s.id) ? 'Expand' : 'Collapse'}</button>}<button onClick={() => fitView({ nodes: [{ id: s.id }], duration: 500, maxZoom: 1.3 })}>Focus</button><button onClick={rename}>Rename</button><button className="pri" onClick={addChild}><Icon n="plus" size={14} />Child</button>{s.parent && <button onClick={addSibling}><Icon n="plus" size={14} />Sibling</button>}{s.parent && <button className="danger" onClick={del}>Delete</button>}</div>
            <div className="row"><button disabled={aiBusy === 'suggest'} onClick={suggestChildren}><Icon n="spark" size={14} />{aiBusy === 'suggest' ? 'Thinking…' : 'AI: Suggest children'}</button></div>
            {suggestions.length > 0 && <div className="chips">{suggestions.map(x => <button key={x} className="chip" onClick={() => acceptSuggestion(x)}><Icon n="plus" size={12} />{x}</button>)}</div>}
            <div className="notes">
              <small>{currentId ? `Notes (${selNotes.length})` : 'Save as a project to add notes'}</small>
              {currentId && <>
                {selNotes.map(n => <div key={n.id} className="note"><span>{n.body}</span><button className="ico" aria-label="Delete note" onClick={() => rmNote(n.id)}><Icon n="close" size={12} /></button></div>)}
                <div className="row"><input className="wide" aria-label="Add a note to this node" value={noteDraft} onChange={e => setNoteDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addNote() }} placeholder="Add a note…" /><button onClick={addNote}>Add</button></div>
              </>}
            </div>
          </div>}
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
            <div className="vt">Templates</div>
            <div className="tmpl">{templateGroups.map(([cat, items]) => <div key={cat} className="tmplg"><small>{cat}</small><div className="row">{items.map(x => <button key={x.i} onClick={() => { setText(EXAMPLES[x.i][1]); say('Loaded "' + x.name + '"') }}>{x.name}</button>)}</div></div>)}</div>
          </div>}
          {present && <div className="glass pbar"><button onClick={() => setPi(i => Math.max(i - 1, 0))} disabled={pi === 0} aria-label="Previous"><Icon n="left" /></button><div className="pt2"><b>{tree?.nodes[order[pi]]?.label}</b><small>{pi + 1} / {order.length} · arrow keys to move</small></div><button onClick={() => setPi(i => Math.min(i + 1, order.length - 1))} disabled={pi >= order.length - 1} aria-label="Next"><Icon n="right" /></button><button className="danger" onClick={exitPresent}>Exit</button><i style={{ width: ((pi + 1) / Math.max(order.length, 1)) * 100 + '%' }} /></div>}
          <div className="glass bar">
            <select aria-label="Diagram layout" value={mode} onChange={e => setMode(e.target.value as Mode)}><option value="tree">Tree</option><option value="lr">Left → Right</option><option value="mind">Mind Map</option><option value="radial">Radial</option></select>
            <button onClick={() => { setSel(null); setCol(new Set(col)) }}><Icon n="refresh" />Re-layout</button>
            <button aria-pressed={view} aria-expanded={view} onClick={() => setView(v => !v)}><Icon n="eye" />View</button>
            <button className="ico" title="Fullscreen" aria-label="Fullscreen" onClick={() => document.fullscreenElement ? document.exitFullscreen() : document.querySelector('.cv')?.requestFullscreen()}><Icon n="expand" /></button>
            <button onClick={openHistory}><Icon n="refresh" size={14} />History</button>
            <select aria-label="Export diagram" value="" disabled={!!aiBusy} onChange={e => exp(e.target.value)}>
              <option value="">{aiBusy === 'srs' ? 'Generating SRS…' : aiBusy === 'prd' ? 'Generating PRD…' : 'Export…'}</option>
              <option value="png">PNG image</option><option value="svg">SVG</option><option value="clip">Copy image</option><option value="json">JSON</option><option value="md">Markdown outline</option><option value="mermaid">Copy Mermaid</option>
              <option value="ai-srs">AI: SRS document (.md)</option><option value="ai-prd">AI: PRD document (.md)</option>
            </select>
            <button className="pri" onClick={startPresent}><Icon n="play" size={14} />Present</button>
          </div>
        </section>
      </main>

      {showProjects && <div className="modal" onClick={() => setShowProjects(false)}><div className="glass mcard" role="dialog" aria-modal="true" aria-label="Projects" onClick={e => e.stopPropagation()}>
        <div className="ph"><b>Projects</b><button className="ico" aria-label="Close" onClick={() => setShowProjects(false)}><Icon n="close" /></button></div>
        <div className="row"><button className="pri" onClick={newProject}><Icon n="plus" size={14} />New</button>
          {current ? <button onClick={saveProject}>Update &quot;{current.name}&quot;</button> : <><input className="wide" aria-label="New project name" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name this diagram…" onKeyDown={e => { if (e.key === 'Enter') saveProject() }} /><button onClick={saveProject}>Save current</button></>}
        </div>
        <div className="plist">
          {!projects.length && <small>No saved projects yet — save your current diagram to start switching between them.</small>}
          {projects.map(p => <div key={p.id} className={'prow' + (p.id === currentId ? ' on' : '')}>
            <div className="pinfo"><b>{p.name}</b><small>Updated {rel(p.updatedAt)}</small></div>
            <div className="row"><button onClick={() => openProject(p)}>Open</button><button onClick={() => dupProject(p.id)}>Duplicate</button><button onClick={() => renameProjectHandler(p)}>Rename</button><button className="danger" onClick={() => delProject(p.id)}>Delete</button></div>
          </div>)}
        </div>
      </div></div>}

      {showHistory && <div className="modal" onClick={() => setShowHistory(false)}><div className="glass mcard" role="dialog" aria-modal="true" aria-label="Version history" onClick={e => e.stopPropagation()}>
        <div className="ph"><b>Version history{current ? ` · ${current.name}` : ''}</b><button className="ico" aria-label="Close" onClick={() => setShowHistory(false)}><Icon n="close" /></button></div>
        <div className="row"><button className="pri" onClick={saveVersion}>Save version now</button></div>
        <div className="plist">
          {!versions.length && <small>No versions yet. One is saved automatically each time you click Generate, or save one manually above.</small>}
          {versions.map(v => <div key={v.id} className="prow"><div className="pinfo"><b>{v.label}</b><small>{new Date(v.createdAt).toLocaleString()}</small></div><div className="row"><button onClick={() => restoreVersion(v)}>Restore</button><button className="danger" onClick={() => rmVersion(v.id)}>Delete</button></div></div>)}
        </div>
      </div></div>}

      {shareOpen && <div className="modal" onClick={() => setShareOpen(false)}><div className="glass mcard" role="dialog" aria-modal="true" aria-label="Share diagram" onClick={e => e.stopPropagation()}>
        <div className="ph"><b>Share</b><button className="ico" aria-label="Close" onClick={() => setShareOpen(false)}><Icon n="close" /></button></div>
        <div className="sharerow"><b>Quick link</b><p>Encodes the outline in the URL itself — works with no server, but can get long.</p><button onClick={quickLink}>Copy quick link</button></div>
        <div className="sharerow"><b>Hosted link</b><p>Short link that loads a read-only view — good for sharing with a team or client.</p><button className="pri" disabled={aiBusy === 'share'} onClick={hostedLink}>{aiBusy === 'share' ? 'Creating…' : 'Create & copy hosted link'}</button>
          {shareUrl && <div className="row"><input className="wide" readOnly value={shareUrl} onFocus={e => e.currentTarget.select()} /></div>}
        </div>
      </div></div>}

      {help && <div className="modal" onClick={() => setHelp(false)}><div className="glass mcard" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={e => e.stopPropagation()}><div className="ph"><b>Keyboard shortcuts</b><button className="ico" aria-label="Close" onClick={() => setHelp(false)}><Icon n="close" /></button></div><div className="krows">{SHORTCUTS.map(([k, d]) => <div key={k}><kbd>{k}</kbd><span>{d}</span></div>)}</div></div></div>}
      {drag && <div className="drop"><div>Drop a .txt, .md or .json file to import</div></div>}
      <div className={'toast' + (toast ? ' show' : '')} role="status">{toast}</div>
    </div>
  )
}
export default function Page() { return <ReactFlowProvider><App /></ReactFlowProvider> }
