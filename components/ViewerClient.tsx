'use client'
import { useEffect, useMemo, useState } from 'react'
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, useNodesState, useEdgesState, useReactFlow, type Node, type Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import DiagramNode, { type D } from '@/components/DiagramNode'
import Icon from '@/components/Icons'
import { parse, icon } from '@/lib/parse'
import { layout, size, kids } from '@/lib/layout'
import type { Mode } from '@/lib/layout'

const nodeTypes = { n: DiagramNode }
const asData = (d: D) => d as unknown as Record<string, unknown>
const PAL = [[152, 205, 168, 220, 140, 190], [210, 190, 172, 225, 158, 200], [140, 122, 158, 104, 172, 132], [32, 152, 210, 44, 168, 222]]

function Inner({ text, mode, pal }: { text: string; mode: Mode; pal: number }) {
  const [dark, setDark] = useState(false)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const { fitView } = useReactFlow()
  const tree = useMemo(() => { try { return parse(text, 'tree') } catch { return null } }, [text])
  const hue = (br: number) => { const h = PAL[pal] || PAL[0]; return h[br % h.length] }

  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light' }, [dark])
  useEffect(() => {
    if (!tree) { setNodes([]); setEdges([]); return }
    const pos = layout(tree, new Set(), mode), straight = mode === 'mind' || mode === 'radial'
    setNodes(Object.entries(pos).map(([id, p]) => {
      const n = tree.nodes[id], s = size(n.label, n.level)
      const d: D = { label: n.label, level: n.level, hue: hue(n.br), icon: icon(n.label), count: n.children.length, collapsed: false, dim: false, hit: false, sel: false, vert: mode === 'tree', center: mode === 'mind' || mode === 'radial', toggle: () => {} }
      return { id, type: 'n', position: { x: p.x - s.w / 2, y: p.y - s.h / 2 }, style: { width: s.w, height: s.h }, data: asData(d) }
    }))
    setEdges(Object.keys(pos).flatMap(id => kids(tree, new Set(), id).map(k => ({ id: id + '-' + k, source: id, target: k, type: straight ? 'straight' : 'default', style: { stroke: `hsl(${hue(tree.nodes[k].br)} var(--node-s) var(--node-l))`, strokeWidth: 2 } }))))
    const t = setTimeout(() => fitView({ duration: 400, padding: 0.15 }), 60); return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, mode, pal])

  return (
    <div className="app">
      <header>
        <div className="logo"><span className="mark"><Icon n="spark" size={18} /></span><div><b>MapTree</b><small>Shared diagram · view only</small></div></div>
        <button className="ico" title="Toggle theme" aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setDark(d => !d)}><Icon n={dark ? 'sun' : 'moon'} size={18} /></button>
      </header>
      <main style={{ gridTemplateColumns: '1fr' }}>
        <section className="cv">
          <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} colorMode={dark ? 'dark' : 'light'} minZoom={0.1} maxZoom={3} nodesConnectable={false} nodesDraggable={false} onlyRenderVisibleElements proOptions={{ hideAttribution: true }}>
            <Background gap={24} size={1.6} /><Controls showInteractive={false} /><MiniMap pannable zoomable nodeBorderRadius={6} />
          </ReactFlow>
          {!tree && <div className="empty"><div><h2>Couldn&apos;t read this diagram</h2><p>The shared outline could not be parsed.</p></div></div>}
        </section>
      </main>
    </div>
  )
}

export default function ViewerClient({ text, mode, pal }: { text: string; mode: string; pal: number }) {
  const m: Mode = mode === 'lr' || mode === 'mind' || mode === 'radial' ? mode : 'tree'
  return <ReactFlowProvider><Inner text={text} mode={m} pal={pal} /></ReactFlowProvider>
}
