'use client'
import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
export type D = { label: string; level: number; hue: number; icon: string; count: number; collapsed: boolean; dim: boolean; hit: boolean; sel: boolean; vert: boolean; center: boolean; toggle: () => void }

export default memo(function DiagramNode({ data }: NodeProps) {
  const d = data as unknown as D
  const cls = `n l${Math.min(d.level, 2)}${d.sel ? ' sel' : ''}${d.hit ? ' hit' : ''}${d.dim ? ' dim' : ''}${d.vert ? ' v' : ''}${d.center ? ' c' : ''}`
  return (
    <div className={cls} style={{ ['--h' as string]: d.hue }} title={`${d.label} · ${d.count} children`}>
      <Handle type="target" position={d.vert ? Position.Top : Position.Left} />
      {d.level === 0 ? <><div>{d.icon} {d.label}</div><small style={{ fontWeight: 400, opacity: .85, fontSize: 12 }}>{d.count} major areas</small></> : <span>{d.icon} {d.label}</span>}
      {d.count > 0 && <button className="bd" aria-label={d.collapsed ? `Expand ${d.label}` : `Collapse ${d.label}`} aria-expanded={!d.collapsed} onClick={e => { e.stopPropagation(); d.toggle() }}>{d.collapsed ? d.count : '–'}</button>}
      <Handle type="source" position={d.vert ? Position.Bottom : Position.Right} />
    </div>
  )
})
