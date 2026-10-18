"use client";
import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, Handle, Position, MarkerType,
  applyNodeChanges, applyEdgeChanges, useReactFlow, type Node, type Edge, type NodeProps, type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Sparkles, Undo2, Redo2, Download, Sun, Moon, Trash2, Plus, XCircle, CheckCircle2, ChevronDown, Settings2, GitFork, LayoutTemplate, Wand2, ArrowDown, ArrowRight, ListTree, Network, RefreshCw, LayoutList, PanelTop, Rows3, FileText, Play, Flag, Box, Plug, ShieldCheck, Circle, SplitSquareHorizontal, Check, X, MessageSquare } from "lucide-react";
import { classify, toMermaid, validate, NODE_TYPES, type Graph, type NodeType, type EdgeKind } from "@/lib/graph";
import { GraphSchema, KINDS, PROV, type Prov } from "@/lib/schema";
import type { Conflict, Question } from "@/lib/graph";
import { readSaved } from "@/lib/storage";
import { toPng, toSvg } from "html-to-image";
import { getNodesBounds, getViewportForBounds } from "@xyflow/react";
import { layoutView, suggestView, SIZE, type View, type CardStyle } from "@/lib/layout";
import { parseOutline, parseHierarchy, looksHierarchy } from "@/lib/outline";
import { toSRS } from "@/lib/srs";

type ND = { type: NodeType; title: string; desc: string; view?: View; cs?: CardStyle; prov?: Prov; src?: string; max?: number } & Record<string, unknown>;
type N = Node<ND>;
type Snap = { nodes: N[]; edges: Edge[] };

const SAMPLES: Record<string, string> = {
  "RCS delivery": `RCS SMS Delivery Flow
  API / Customer Panel
    Submit request via API
    Entry point from Customer Panel
  aMaaP Platform
    Receive request
    Store request data
    Apply settings (sender IDs, pricing, routing rules)
  Validation Process
    Check account status
    Verify balance or credit limit
    Confirm agent/template approval
    Enforce permissions and routing rules
  Routing Engine
    Select provider by destination country
    Apply routing rules and provider priority
    Use default route
    Configure failover order
  Provider Delivery & Failover
    Send message to selected provider
    Provider accepts and forwards to mobile network
    On error or unavailability switch to next provider
    Continue until accepted or no routes remain
  End User & Reporting
    Deliver message to end-user phone
    Receive delivery reports (DLRs) and EDRs
    Update platform with status
    Enable real-time customer tracking`,
  "Org tree": `Product Company
  Engineering
    Frontend
    Backend
    QA
  Sales
    Inbound
    Enterprise
  Operations
    Support
    Finance`,
  "Online order": `Online Order
  Customer
    Add items to cart
    Enter payment details
  Payment Check
    Validate card details
    If payment fails retry up to 3 times, then cancel the order
  Fulfilment
    Pack items
    Ship order
  Delivered
    Send confirmation email`,
};

const toNodes = (g: Graph, v: View = "flow-tb", cs: CardStyle = "classic"): N[] => {
  const p = layoutView(g, v, cs);
  return g.nodes.map((n) => ({ id: n.id, type: "card", position: p[n.id] ?? { x: 0, y: 0 }, data: { type: n.type, title: n.title, desc: n.desc, prov: n.prov ?? "stated", src: n.src ?? "", max: n.max } }));
};
const toEdges = (g: Graph): Edge[] => g.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.label, data: { kind: e.kind, prov: e.prov ?? "stated", src: e.src ?? "" } }));
const kindOf = (e: Edge): EdgeKind => { const k = (e.data as { kind?: string } | undefined)?.kind ?? ""; return (KINDS as readonly string[]).includes(k) ? (k as EdgeKind) : "flow"; };
const pv = (e: Edge): Prov => ((e.data as { prov?: Prov } | undefined)?.prov ?? "stated");
const KINDLBL: Partial<Record<EdgeKind, string>> = { contains: "contains", member: "member of", authorizes: "authorizes", depends: "depends on", data: "data" };
const sc = (e: Edge) => (e.data as { src?: string } | undefined)?.src ?? "";
const toGraph = (nodes: N[], edges: Edge[]): Graph => ({
  nodes: nodes.map((n) => ({ id: n.id, type: n.data.type, title: n.data.title, desc: n.data.desc, prov: n.data.prov ?? "stated", src: n.data.src ?? "", ...(n.data.max ? { max: n.data.max } : {}) })),
  edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: String(e.label ?? ""), kind: kindOf(e), prov: pv(e), src: sc(e) })),
});
const save = (name: string, text: string) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" })); a.download = name; a.click();
};

const ICON: Record<NodeType, typeof Box> = { start: Play, end: Flag, process: Box, check: ShieldCheck, decision: GitFork, external: Plug, topic: Circle };
const TILE: Record<NodeType, string> = { start: "bg-ok/10 text-ok", end: "bg-line text-mute", process: "bg-bg text-mute", check: "bg-accent/10 text-accent", decision: "bg-accent/10 text-accent", external: "bg-ink/5 text-ink", topic: "bg-bg text-mute" };
const LABEL: Record<NodeType, string> = { start: "Trigger", end: "End", process: "Step", check: "Check", decision: "Condition", external: "External", topic: "Topic" };
const HP = {
  tb: { in: Position.Top, out: Position.Bottom, rout: Position.Right, rin: Position.Right, lout: Position.Left, lin: Position.Left },
  lr: { in: Position.Left, out: Position.Right, rout: Position.Top, rin: Position.Top, lout: Position.Bottom, lin: Position.Bottom },
};
const SIDE = { t: Position.Top, r: Position.Right, b: Position.Bottom, l: Position.Left };
const OPP: Record<string, string> = { t: "b", b: "t", l: "r", r: "l" };
function Handles({ view }: { view: View }) {
  if (view === "mind" || view === "loop") return <>{(["t", "r", "b", "l"] as const).map((k) => (<span key={k}><Handle id={k + "s"} type="source" position={SIDE[k]} /><Handle id={k + "t"} type="target" position={SIDE[k]} /></span>))}</>;
  const p = view === "flow-lr" ? HP.lr : HP.tb;
  return (<><Handle id="in" type="target" position={p.in} /><Handle id="out" type="source" position={p.out} /><Handle id="rout" type="source" position={p.rout} /><Handle id="rin" type="target" position={p.rin} /><Handle id="lout" type="source" position={p.lout} /><Handle id="lin" type="target" position={p.lin} /></>);
}

function Card({ data, selected }: NodeProps<N>) {
  const cs = data.cs ?? "classic", view = data.view ?? "flow-tb", Icon = ICON[data.type], ring = (selected ? "ring-4 ring-accent/25 !border-accent" : "") + (data.prov === "assumed" ? " !border-dashed" : "");
  const rows = data.desc ? data.desc.split(" · ") : [];
  if (cs === "workflow") return (
    <div title={data.desc} className={`flex h-[84px] w-[320px] items-center gap-3 rounded-xl border border-line bg-panel px-3 shadow-sm ${ring}`}>
      <Handles view={view} />
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${TILE[data.type]}`}><Icon size={18} /></div>
      <div className="min-w-0"><div className="truncate text-[14px] font-semibold">{data.title}</div>{data.desc && <div className="line-clamp-2 text-[11.5px] leading-snug text-mute">{data.desc}</div>}</div>
    </div>);
  if (cs === "detail") return (
    <div title={data.desc} className={`h-[150px] w-[300px] overflow-hidden rounded-xl border border-line bg-panel shadow-sm ${ring}`}>
      <Handles view={view} />
      <div className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold ${TILE[data.type]}`}><Icon size={12} />{LABEL[data.type]}</div>
      <div className="px-3 pt-2 text-[13.5px] font-semibold"><div className="truncate">{data.title}</div></div>
      <div className="mt-1.5 space-y-1 px-3 text-[11px] text-mute">
        {rows.slice(0, 3).map((r, i) => (<div key={i} className="truncate border-t border-line pt-1">{r}</div>))}
        {rows.length > 3 && <div className="border-t border-line pt-1 text-accent">+{rows.length - 3} more</div>}
      </div>
    </div>);
  return (
    <div title={data.desc ? `${data.title} — ${data.desc}` : data.title}
      className={`c-${data.type} flex h-[92px] w-[420px] flex-col items-center justify-center rounded-xl border px-5 text-center shadow-sm transition ${selected ? "ring-4 ring-accent/25" : ""} ${data.prov === "assumed" ? "border-dashed" : ""}`}>
      <Handles view={view} />
      <div className="w-full truncate text-[15px] font-semibold leading-tight">{data.title}</div>
      {data.desc && <div className="mt-1 line-clamp-2 w-full text-[12px] leading-snug opacity-80">{data.desc}</div>}
    </div>);
}
const nodeTypes = { card: Card };

const Btn = ({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button {...p} className={`grid h-8 min-w-8 place-items-center rounded-lg px-2 text-mute transition hover:bg-bg hover:text-ink disabled:opacity-30 ${p.className ?? ""}`}>{children}</button>
);
function Seg<T extends string>({ v, set, items }: { v: T; set: (x: T) => void; items: { id: T; label: string; Icon: typeof Box; title?: string }[] }) {
  return (<div className="flex rounded-lg bg-bg p-0.5">{items.map(({ id, label, Icon, title }) => (
    <button key={id} title={title ?? label} onClick={() => set(id)} className={`flex h-7 items-center gap-1 rounded-md px-2 text-[12px] ${v === id ? "bg-panel text-ink shadow-sm" : "text-mute"}`}><Icon size={14} />{label}</button>))}</div>);
}
const VIEWS = [{ id: "flow-tb" as View, label: "", Icon: ArrowDown, title: "Flow, top to bottom" }, { id: "flow-lr" as View, label: "", Icon: ArrowRight, title: "Flow, left to right" },
  { id: "tree" as View, label: "Tree", Icon: ListTree }, { id: "mind" as View, label: "Mind map", Icon: Network }, { id: "loop" as View, label: "Loop", Icon: RefreshCw }];
const STYLES = [{ id: "classic" as CardStyle, label: "Classic", Icon: Rows3 }, { id: "workflow" as CardStyle, label: "Workflow", Icon: LayoutList }, { id: "detail" as CardStyle, label: "Detail", Icon: PanelTop }];
const MODES = [{ id: "auto" as const, label: "Auto", Icon: Wand2 }, { id: "process" as const, label: "Process", Icon: SplitSquareHorizontal }, { id: "hier" as const, label: "Hierarchy", Icon: ListTree }];
const Pill = "rounded-2xl border border-line bg-panel shadow-sm";
const Field = "w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-[13px] outline-none focus:border-accent";

function Inner() {
  const rf = useReactFlow();
  const [nodes, setNodes] = useState<N[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [hist, setHist] = useState<Snap[]>([]);
  const [fut, setFut] = useState<Snap[]>([]);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("Untitled diagram");
  const [model, setModel] = useState(""); // blank = server uses GROQ_MODEL
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [dark, setDark] = useState(false);
  const [menu, setMenu] = useState(false);
  const [cfg, setCfg] = useState(false);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>("flow-tb");
  const [cs, setCs] = useState<CardStyle>("workflow");
  const [mode, setMode] = useState<"auto" | "process" | "hier">("auto");
  const [srsOpen, setSrsOpen] = useState(false);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [instr, setInstr] = useState("");
  const [prev, setPrev] = useState<{ explanation: string; applied: string[]; graph: Graph } | null>(null);
  const [refining, setRefining] = useState(false);
  const [store, setStore] = useState<"saved" | "failed">("saved");

  const fit = () => setTimeout(() => rf.fitView({ padding: 0.15, duration: 350 }), 120);
  const show = (g: Graph, v = view, c = cs) => { setNodes(toNodes(g, v, c)); setEdges(toEdges(g)); fit(); };
  const snap = () => { setHist((h) => [...h.slice(-49), { nodes, edges }]); setFut([]); };
  const undo = () => { const p = hist.at(-1); if (!p) return; setFut((f) => [...f, { nodes, edges }]); setHist((h) => h.slice(0, -1)); setNodes(p.nodes); setEdges(p.edges); };
  const redo = () => { const p = fut.at(-1); if (!p) return; setHist((h) => [...h, { nodes, edges }]); setFut((f) => f.slice(0, -1)); setNodes(p.nodes); setEdges(p.edges); };

  useEffect(() => {
    let d = null as { nodes?: N[]; edges?: Edge[]; text?: string; title?: string; key?: string; dark?: boolean; view?: View; cs?: CardStyle; conflicts?: Conflict[]; questions?: Question[] } | null;
    try { d = readSaved((k) => localStorage.getItem(k)) as typeof d; } catch {}
    if (d?.nodes?.length) { setNodes(d.nodes); setEdges(d.edges ?? []); setText(d.text ?? ""); setTitle(d.title ?? "Untitled diagram"); setKey(d.key ?? ""); setDark(!!d.dark); setView(d.view ?? "flow-tb"); setCs(d.cs ?? "workflow"); setConflicts(d.conflicts ?? []); setQuestions(d.questions ?? []); fit(); }
    else { // first visit: show the example already built
      const t = SAMPLES["RCS delivery"], r = parseOutline(t);
      setText(t); if (r) { setTitle(r.title); show(r.graph, "flow-tb", "workflow"); }
      setDark(!!d?.dark);
    }
    setReady(true);
  }, []); // eslint-disable-line
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    if (!ready) return;
    try { localStorage.setItem("maptree:v4", JSON.stringify({ nodes, edges, text, title, key, dark, view, cs, conflicts, questions })); setStore("saved"); } catch { setStore("failed"); }
  }, [nodes, edges, text, title, key, dark, view, cs, conflicts, questions, ready]);

  const cur = useMemo(() => toGraph(nodes, edges), [nodes, edges]);
  const issues = useMemo(() => validate(cur), [cur]);
  const cls = useMemo(() => classify(cur), [cur]);
  const errors = issues.filter((i) => i.level === "error").length;

  const radial = view === "mind" || view === "loop";
  const shownNodes = useMemo(() => nodes.map((n) => ({ ...n, data: { ...n.data, view, cs, desc: n.data.desc || (n.data.max ? `Limit: ${n.data.max} attempts` : "") } })), [nodes, view, cs]);
  const shownEdges = useMemo<Edge[]>(() => {
    const pos = new Map(nodes.map((n) => [n.id, n.position])), lane = new Map<string, number>();
    edges.forEach((e) => { if (cls.back.has(e.id)) lane.set(e.id, lane.size); });
    return edges.map((e): Edge => {
      const fb = cls.feedback.has(e.id), bk = cls.back.has(e.id), l = String(e.label ?? "").toLowerCase();
      const tone = /^(yes|ok|success|true)/.test(l) ? "rgb(var(--ok))" : /^(no|fail|error|false)/.test(l) ? "rgb(var(--no))" : "rgb(var(--mute))";
      let sh = fb ? "rout" : bk ? "lout" : "out", th = fb ? "rin" : bk ? "lin" : "in", extra: Partial<Edge> = fb || bk ? { type: "smoothstep", pathOptions: { offset: 38 + 26 * (lane.get(e.id) ?? 0), borderRadius: 16 } } : {};
      if (radial) {
        const a = pos.get(e.source), c = pos.get(e.target); extra = {};
        if (a && c) { const dx = c.x - a.x, dy = c.y - a.y, k = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "r" : "l") : dy > 0 ? "b" : "t"; sh = k + "s"; th = OPP[k] + "t"; }
      }
      return {
        ...e, label: e.label || KINDLBL[kindOf(e)] || undefined, sourceHandle: sh, targetHandle: th, ...extra,
        style: { stroke: e.selected ? "rgb(var(--accent))" : "rgb(var(--mute))", strokeWidth: 2, strokeDasharray: fb || bk || (e.data as { prov?: string } | undefined)?.prov === "assumed" ? "6 5" : undefined },
        markerEnd: { type: MarkerType.ArrowClosed, color: "rgb(var(--mute))", width: 18, height: 18 },
        labelStyle: { fontSize: 11, fontWeight: 600, fill: tone }, labelBgPadding: [8, 4] as [number, number], labelBgBorderRadius: 10,
        labelBgStyle: { fill: "rgb(var(--panel))", stroke: "rgb(var(--line))" },
      };
    });
  }, [edges, cls, nodes, radial]);
  const srs = useMemo(() => (srsOpen ? toSRS(title, cur) : ""), [srsOpen, title, cur]);
  const arrange = (v: View, c: CardStyle) => { snap(); setView(v); setCs(c); const p = layoutView(cur, v, c); setNodes((ns) => ns.map((n) => ({ ...n, position: p[n.id] ?? n.position }))); fit(); };
  const insertOn = (e: Edge) => {
    const id = "n" + Date.now().toString(36), g = cur, old = g.edges.find((x) => x.id === e.id); if (!old) return;
    snap();
    show({ nodes: [...g.nodes, { id, type: "process", title: "New step", desc: "" }],
      edges: [...g.edges.filter((x) => x.id !== old.id), { ...old, target: id }, { id: "e" + Date.now().toString(36), source: id, target: old.target, label: "", kind: "flow" }] });
  };

  const buildLocal = (t = text) => {
    const hier = mode === "hier" || (mode === "auto" && looksHierarchy(t)), r = hier ? parseHierarchy(t) : parseOutline(t);
    if (!r) { setErr(hier ? "Need at least two lines in the list." : "Need at least two steps. Put each stage on its own line and indent its sub-steps underneath."); return; }
    const v = suggestView(r.graph);
    setErr(""); snap(); setTitle(r.title); setView(v); show(r.graph, v, cs); setConflicts([]); setQuestions([]); setPrev(null);
  };
  const buildAI = async () => {
    if (!text.trim()) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json", "x-groq-key": key }, body: JSON.stringify({ text, model }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Generation failed");
      snap(); const v = suggestView(j.graph as Graph); setView(v); show(j.graph as Graph, v, cs); setConflicts((j.graph as Graph).conflicts ?? []); setQuestions((j.graph as Graph).questions ?? []); setPrev(null);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const assumed = useMemo(() => [
    ...nodes.filter((n) => n.data.prov === "assumed").map((n) => ({ t: "n" as const, id: n.id, label: n.data.title })),
    ...edges.filter((e) => pv(e) === "assumed").map((e) => ({ t: "e" as const, id: e.id, label: `${nodes.find((n) => n.id === e.source)?.data.title ?? "?"} → ${nodes.find((n) => n.id === e.target)?.data.title ?? "?"}` })),
  ], [nodes, edges]);
  const acceptAssumed = (a: { t: "n" | "e"; id: string }) => { snap(); if (a.t === "n") patch(a.id, { prov: "stated" }); else setEdges((es) => es.map((e) => (e.id === a.id ? { ...e, data: { ...(e.data as object), prov: "stated" } } : e))); };
  const rejectAssumed = (a: { t: "n" | "e"; id: string }) => { snap(); if (a.t === "n") { setNodes((ns) => ns.filter((n) => n.id !== a.id)); setEdges((es) => es.filter((e) => e.source !== a.id && e.target !== a.id)); } else setEdges((es) => es.filter((e) => e.id !== a.id)); };
  const refine = async () => {
    if (!instr.trim() || !nodes.length) return;
    setRefining(true); setErr("");
    try {
      const r = await fetch("/api/refine", { method: "POST", headers: { "Content-Type": "application/json", "x-groq-key": key }, body: JSON.stringify({ graph: { ...cur, conflicts, questions }, instruction: instr, model }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || "Refinement failed");
      setPrev({ explanation: j.explanation, applied: j.applied, graph: j.graph });
    } catch (e) { setErr((e as Error).message); } finally { setRefining(false); } // the current diagram is never touched here
  };
  const applyPreview = () => { // untouched cards keep their positions
    if (!prev) return; snap(); const old = new Map(nodes.map((n) => [n.id, n.position]));
    setNodes(toNodes(prev.graph, view, cs).map((n) => ({ ...n, position: old.get(n.id) ?? n.position }))); setEdges(toEdges(prev.graph)); setPrev(null); setInstr(""); fit();
  };
  const exportImage = async (fmt: "png" | "svg") => {
    setMenu(false);
    const el = document.querySelector(".react-flow__viewport") as HTMLElement | null; if (!el || !nodes.length) return;
    try {
      const b = getNodesBounds(nodes.map((n) => ({ ...n, width: SIZE[cs].w, height: SIZE[cs].h }))), w = Math.ceil(b.width) + 80, h = Math.ceil(b.height) + 80, vp = getViewportForBounds(b, w, h, 0.1, 2, 0.05);
      const o = { backgroundColor: dark ? "#0f1013" : "#f8f8f6", width: w, height: h, style: { width: `${w}px`, height: `${h}px`, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` } };
      const url = fmt === "png" ? await toPng(el, { ...o, pixelRatio: 2 }) : await toSvg(el, o);
      const a = document.createElement("a"); a.href = url; a.download = `${title || "diagram"}.${fmt}`; a.click();
    } catch { setErr("Image export failed in this browser. JSON and Mermaid export still work."); }
  };
  const tidy = () => { snap(); const p = layoutView(cur, view, cs); setNodes((ns) => ns.map((n) => ({ ...n, position: p[n.id] ?? n.position }))); fit(); };
  const onConnect = (c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    snap();
    const src = nodes.find((n) => n.id === c.source), out = edges.filter((e) => e.source === c.source);
    const label = src?.data.type === "decision" ? (out.some((e) => /yes/i.test(String(e.label))) ? "No" : "Yes") : "";
    setEdges((es) => [...es, { id: "e" + Date.now().toString(36), source: c.source!, target: c.target!, label, data: { kind: "flow" } }]);
  };
  const addNode = () => {
    snap(); const id = "n" + Date.now().toString(36), p = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { id, type: "card", selected: true, position: { x: p.x - SIZE[cs].w / 2, y: p.y - SIZE[cs].h / 2 }, data: { type: "process", title: "New step", desc: "" } }]);
  };
  const patch = (id: string, d: Partial<ND>) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...d } } : n)));
  const del = () => {
    snap(); const ids = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
    setNodes((ns) => ns.filter((n) => !n.selected)); setEdges((es) => es.filter((e) => !e.selected && !ids.has(e.source) && !ids.has(e.target)));
  };
  const importFile = async (f?: File) => {
    if (!f) return;
    try {
      const o = JSON.parse(await f.text()), p = GraphSchema.safeParse(o);
      if (!p.success) throw new Error("Not a valid MapTree graph file (or a newer schema version).");
      setConflicts(p.data.conflicts ?? []); setQuestions(p.data.questions ?? []);
      snap(); if (o.title) setTitle(o.title); show(p.data as Graph);
    } catch (e) { setErr((e as Error).message); }
  };

  const selN = nodes.find((n) => n.selected), selE = edges.find((e) => e.selected);
  const looksProse = !!text.trim() && !/\n[ \t]+\S/.test(text);

  return (
    <div className="flex h-screen w-screen text-ink">
      <aside className="flex w-[340px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-line bg-panel p-4">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-accent text-white"><GitFork size={16} /></div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" aria-label="Title" />
          <Btn onClick={() => setCfg(!cfg)} title="AI settings"><Settings2 size={15} /></Btn>
        </div>
        <textarea className={`${Field} h-72 resize-none font-mono text-[12px] leading-relaxed`} spellCheck={false} value={text} placeholder={"Title\n  Stage one\n    step\n    step\n  Stage two\n    step"}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") buildLocal(); }} />
        <div className="flex flex-wrap gap-1.5">
          {Object.keys(SAMPLES).map((k) => (<button key={k} onClick={() => { setText(SAMPLES[k]); buildLocal(SAMPLES[k]); }} className="rounded-full border border-line px-2.5 py-1 text-[11px] text-mute hover:border-accent hover:text-accent">{k}</button>))}
        </div>
        <div className="flex items-center justify-between text-xs text-mute"><span>Read as</span><Seg v={mode} set={setMode} items={MODES} /></div>
        <button onClick={() => buildLocal()} disabled={!text.trim()} className="flex h-9 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-medium text-white hover:opacity-90 disabled:opacity-40">
          <Wand2 size={15} />Build diagram <span className="text-[11px] opacity-70">Ctrl+Enter</span>
        </button>
        <button onClick={buildAI} disabled={busy || !text.trim()} className={`flex h-8 items-center justify-center gap-2 rounded-xl border text-[13px] hover:border-accent hover:text-accent disabled:opacity-40 ${looksProse ? "border-accent text-accent" : "border-line text-mute"}`}>
          <Sparkles size={14} />{busy ? "Reading…" : "Build with AI"}
        </button>
        {looksProse && <p className="text-[11px] text-mute">Plain sentences (no indentation) work best with AI. Indented outlines build instantly without it.</p>}
        {cfg && (<div className="space-y-2">
          <input className={Field} type="password" placeholder="Groq API key (or set GROQ_API_KEY)" value={key} onChange={(e) => setKey(e.target.value)} />
          <input className={Field} placeholder="Model (blank = GROQ_MODEL)" value={model} onChange={(e) => setModel(e.target.value)} />
        </div>)}
        {err && <p className="rounded-lg bg-no/10 p-2 text-xs text-no">{err}</p>}
        {nodes.length > 0 && (<div className="space-y-2 border-t border-line pt-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-mute"><MessageSquare size={13} />Refine</div>
          <input className={Field} placeholder='e.g. "Show the failure path"' value={instr} onChange={(e) => setInstr(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") refine(); }} />
          <button onClick={refine} disabled={refining || !instr.trim()} className="h-8 w-full rounded-lg border border-line text-[13px] hover:border-accent disabled:opacity-40">{refining ? "Working…" : "Preview change"}</button>
          {prev && (<div className="space-y-2 rounded-lg bg-bg p-2 text-xs">
            {prev.explanation && <p>{prev.explanation}</p>}
            {prev.applied.length ? <ul className="list-disc pl-4">{prev.applied.map((a, i) => <li key={i}>{a}</li>)}</ul> : <p className="text-mute">No change proposed.</p>}
            <div className="flex gap-2">{prev.applied.length > 0 && <button onClick={applyPreview} className="rounded-md bg-accent px-2.5 py-1 text-white">Apply</button>}<button onClick={() => setPrev(null)} className="rounded-md border border-line px-2.5 py-1">Discard</button></div>
          </div>)}
        </div>)}
        {(assumed.length > 0 || conflicts.length > 0 || questions.length > 0) && (<div className="space-y-2 border-t border-line pt-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-mute">Review</div>
          {assumed.map((a) => (<div key={a.t + a.id} className="flex items-start gap-2 rounded-lg bg-bg p-2 text-xs"><span className="flex-1"><b className="font-medium">Assumed:</b> {a.label}</span>
            <button title="Accept as stated" className="text-ok" onClick={() => acceptAssumed(a)}><Check size={14} /></button><button title="Reject and remove" className="text-no" onClick={() => rejectAssumed(a)}><X size={14} /></button></div>))}
          {questions.map((q, i) => (<div key={(q.id || "q") + i} className="rounded-lg bg-bg p-2 text-xs"><b className="font-medium">Open question:</b> {q.summary}
            <button className="ml-2 text-accent" onClick={() => setQuestions((x) => x.filter((_, j) => j !== i))}>Answered</button></div>))}
          {conflicts.map((c, i) => (<div key={(c.id || "c") + i} className="rounded-lg bg-no/10 p-2 text-xs"><b className="font-medium">Conflict:</b> {c.summary}
            {c.a && <p className="mt-1 text-mute">“{c.a}”</p>}{c.b && <p className="text-mute">“{c.b}”</p>}
            <button className="mt-1 text-accent" onClick={() => setConflicts((x) => x.filter((_, j) => j !== i))}>Mark resolved</button></div>))}
        </div>)}
        {nodes.length > 0 && (<div className="border-t border-line pt-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-mute">
            {errors ? <XCircle size={13} className="text-no" /> : <CheckCircle2 size={13} className="text-ok" />}
            {errors ? `${errors} structural issue${errors > 1 ? "s" : ""}` : "Structure valid"}
          </div>
          {issues.length > 0 && <ul className="mt-2 space-y-1.5 text-xs">{issues.map((i, k) => (<li key={k} className={i.level === "error" ? "text-no" : "text-mute"}>{i.msg}</li>))}</ul>}
          <p className="mt-2 text-[11px] text-mute">Solid arrows = flow · dashed on the left = retry loop · dashed on the right = status fed back. Drag from a card edge to connect; select anything to edit it.</p>
        </div>)}
      </aside>

      <main className="relative min-w-0 flex-1">
        <ReactFlow nodes={shownNodes} edges={shownEdges} nodeTypes={nodeTypes} minZoom={0.1} maxZoom={2} fitView proOptions={{ hideAttribution: true }}
          onNodesChange={(c) => { if (c.some((x) => x.type === "remove")) snap(); setNodes((ns) => applyNodeChanges(c, ns) as N[]); }}
          onEdgesChange={(c) => { if (c.some((x) => x.type === "remove")) snap(); setEdges((es) => applyEdgeChanges(c, es)); }}
          onNodeDragStart={snap} onConnect={onConnect} onPaneClick={() => setMenu(false)}>
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="rgb(var(--line))" />
          <Controls showInteractive={false} position="bottom-left" />
        </ReactFlow>

        <div className={`${Pill} absolute left-4 top-4 flex flex-wrap items-center gap-2 p-1.5`}>
          <Seg v={view} set={(v) => arrange(v, cs)} items={VIEWS} />
          <span className="h-5 w-px bg-line" />
          <Seg v={cs} set={(c) => arrange(view, c)} items={STYLES} />
        </div>
        <div className={`${Pill} absolute right-4 top-4 flex items-center gap-1 p-1.5`}>
          <span className="px-1.5 text-[11px] text-mute">{busy || refining ? "Processing…" : store === "saved" ? "Saved" : "Not saved"}</span>
          <Btn onClick={() => setSrsOpen(true)} disabled={!nodes.length} title="Generate SRS document"><FileText size={16} /></Btn>
          <Btn onClick={undo} disabled={!hist.length} title="Undo"><Undo2 size={16} /></Btn>
          <Btn onClick={redo} disabled={!fut.length} title="Redo"><Redo2 size={16} /></Btn>
          <Btn onClick={addNode} title="Add card"><Plus size={16} /></Btn>
          <Btn onClick={tidy} disabled={!nodes.length} title="Tidy layout"><LayoutTemplate size={16} /></Btn>
          <Btn onClick={() => setDark(!dark)} title="Theme">{dark ? <Sun size={16} /> : <Moon size={16} />}</Btn>
          <div className="relative">
            <button onClick={() => setMenu(!menu)} className="flex h-8 items-center gap-1 rounded-lg bg-accent px-3 text-[13px] font-medium text-white hover:opacity-90"><Download size={14} />Export<ChevronDown size={12} /></button>
            {menu && (
              <div className={`${Pill} absolute right-0 top-10 z-10 w-44 p-1 text-[13px]`}>
                <button className="block w-full rounded-md px-3 py-1.5 text-left hover:bg-bg" onClick={() => { save("diagram.json", JSON.stringify({ version: 1, title, ...cur, conflicts, questions }, null, 2)); setMenu(false); }}>Graph JSON</button>
                <button className="block w-full rounded-md px-3 py-1.5 text-left hover:bg-bg" onClick={() => { save("diagram.mmd", toMermaid(cur)); setMenu(false); }}>Mermaid</button>
                <button className="block w-full rounded-md px-3 py-1.5 text-left hover:bg-bg" onClick={() => exportImage("png")}>PNG image</button>
                <button className="block w-full rounded-md px-3 py-1.5 text-left hover:bg-bg" onClick={() => exportImage("svg")}>SVG image</button>
                <label className="block cursor-pointer rounded-md px-3 py-1.5 hover:bg-bg">Import JSON…<input type="file" accept=".json" hidden onChange={(e) => { importFile(e.target.files?.[0]); setMenu(false); }} /></label>
              </div>)}
          </div>
        </div>

        {(selN || selE) && (
          <div className={`${Pill} absolute right-4 top-20 w-[260px] space-y-3 p-4`}>
            {selN ? (<>
              <div className="text-xs font-semibold uppercase tracking-wide text-mute">Card</div>
              <input className={Field} value={selN.data.title} onFocus={snap} onChange={(e) => patch(selN.id, { title: e.target.value })} />
              <select className={Field} value={selN.data.type} onChange={(e) => { snap(); patch(selN.id, { type: e.target.value as NodeType }); }}>{NODE_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
              <textarea className={`${Field} h-20 resize-none`} placeholder="Subtitle / details" value={selN.data.desc} onFocus={snap} onChange={(e) => patch(selN.id, { desc: e.target.value })} />
              {selN.data.type === "decision" && <input className={Field} type="number" min={1} max={99} placeholder="Attempt limit (optional)" value={selN.data.max ?? ""} onFocus={snap} onChange={(e) => patch(selN.id, { max: e.target.value ? Math.max(1, Math.min(99, Math.round(+e.target.value))) : undefined })} />}
              <select className={Field} value={selN.data.prov ?? "stated"} title="Provenance" onChange={(e) => { snap(); patch(selN.id, { prov: e.target.value as Prov }); }}>{PROV.map((p) => <option key={p}>{p}</option>)}</select>
              {selN.data.src ? <p className="rounded-lg bg-bg p-2 text-[11px] text-mute">“{selN.data.src}”</p> : selN.data.prov !== "stated" ? <p className="text-[11px] text-mute">No source text supports this card ({selN.data.prov}).</p> : null}
            </>) : selE && (<>
              <div className="text-xs font-semibold uppercase tracking-wide text-mute">Connection</div>
              <input className={Field} placeholder="Label (Yes / No / retry…)" value={String(selE.label ?? "")} onFocus={snap} onChange={(e) => setEdges((es) => es.map((x) => (x.id === selE.id ? { ...x, label: e.target.value } : x)))} />
              <select className={Field} value={kindOf(selE)} onChange={(e) => { snap(); setEdges((es) => es.map((x) => (x.id === selE.id ? { ...x, data: { ...(x.data as object), kind: e.target.value } } : x))); }}>{KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select>
              {sc(selE) ? <p className="rounded-lg bg-bg p-2 text-[11px] text-mute">“{sc(selE)}”</p> : pv(selE) !== "stated" ? <p className="text-[11px] text-mute">No source text supports this connection ({pv(selE)}).</p> : null}
              <button className="text-xs text-mute hover:text-ink" onClick={() => insertOn(selE)}>+ Insert a step here</button>
              <button className="block text-xs text-mute hover:text-ink" onClick={() => { snap(); setEdges((es) => es.map((x) => (x.id === selE.id ? { ...x, source: x.target, target: x.source } : x))); }}>Reverse direction</button>
            </>)}
            <button onClick={del} className="flex items-center gap-1.5 text-xs text-no hover:opacity-80"><Trash2 size={13} />Delete</button>
          </div>
        )}

        {!nodes.length && ready && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="text-center"><h1 className="text-2xl font-semibold">Paste an outline, press Build.</h1>
              <p className="mt-1 text-sm text-mute">Each top-level line becomes a card, its sub-lines the subtitle.</p></div>
          </div>
        )}
        {srsOpen && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-black/30 p-6" onClick={() => setSrsOpen(false)}>
            <div className={`${Pill} flex max-h-full w-[720px] max-w-full flex-col gap-3 p-4`} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between"><span className="text-sm font-semibold">Requirements (SRS) from this diagram</span>
                <div className="flex gap-1"><Btn onClick={() => navigator.clipboard?.writeText(srs)}>Copy</Btn><Btn onClick={() => save("srs.md", srs)}>Download .md</Btn><Btn onClick={() => setSrsOpen(false)}>Close</Btn></div></div>
              <pre className="overflow-auto whitespace-pre-wrap rounded-lg bg-bg p-3 text-[12px] leading-relaxed">{srs}</pre>
            </div>
          </div>)}
      </main>
    </div>
  );
}
export default function Editor() { return (<ReactFlowProvider><Inner /></ReactFlowProvider>); }
