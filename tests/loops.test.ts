import { describe, it, expect } from "vitest";
import { validate, backEdges, classify, type Graph, type GNode, type GEdge, type NodeType } from "../src/lib/graph";
import { repairGraph } from "../src/lib/repair";
import { readSaved } from "../src/lib/storage";
import { parseOutline } from "../src/lib/outline";

const n = (id: string, type: NodeType, title: string, extra: Partial<GNode> = {}): GNode => ({ id, type, title, desc: "", ...extra });
const e = (id: string, source: string, target: string, label = "", kind: GEdge["kind"] = "flow"): GEdge => ({ id, source, target, label, kind });
const errs = (g: Graph) => validate(g).filter((i) => i.level === "error");
const warns = (g: Graph) => validate(g).filter((i) => i.level === "warn");

/** The OTP requirement: returns are edges to EXISTING nodes; the stated limit (3) lives on the decision. */
const otp = (): Graph => ({
  nodes: [n("login", "start", "Login Page"), n("verify", "check", "Verify Email and Password"), n("send", "process", "Send OTP"), n("enter", "process", "Enter OTP"),
    n("valid", "decision", "OTP Valid?"), n("dash", "end", "Dashboard"), n("limit", "decision", "Attempt limit reached?", { max: 3 })],
  edges: [e("e1", "login", "verify"), e("e2", "verify", "send"), e("e3", "send", "enter"), e("e4", "enter", "valid"), e("e5", "valid", "dash", "Valid"),
    e("e6", "valid", "limit", "Invalid"), e("e7", "limit", "enter", "Attempts remaining"), e("e8", "limit", "login", "Limit reached")],
});

describe("conditional transitions and returns (OTP)", () => {
  it("T1 success branch targets the existing dashboard with its condition", () => {
    const g = otp(), ed = g.edges.find((x) => x.source === "valid" && x.label === "Valid")!;
    expect(g.nodes.find((x) => x.id === ed.target)!.title).toBe("Dashboard"); expect(errs(g)).toEqual([]);
  });
  it("T2 retry is an edge to the existing Enter OTP; no node describes the retry", () => {
    const g = otp(), ed = g.edges.find((x) => x.label === "Attempts remaining")!;
    expect(ed.target).toBe("enter"); expect(g.nodes.some((x) => /return|retry|try again/i.test(x.title))).toBe(false);
    expect(backEdges(g).has("e7")).toBe(true); expect(warns(g)).toEqual([]);
  });
  it("T3 limit reached returns to the existing Login Page and the limit is kept", () => {
    const g = otp(), ed = g.edges.find((x) => x.label === "Limit reached")!;
    expect(ed.target).toBe("login"); expect(g.nodes.find((x) => x.id === "limit")!.max).toBe(3);
    expect(g.nodes.filter((x) => /login/i.test(x.title)).length).toBe(1); expect(backEdges(g).has("e8")).toBe(true);
  });
  it("T4 two independent loops keep distinct targets and conditions", () => {
    const g: Graph = { nodes: [n("s", "start", "Start"), n("a", "process", "Upload file"), n("va", "decision", "Upload ok?", { max: 2 }), n("b", "process", "Pay"), n("vb", "decision", "Payment ok?", { max: 3 }), n("z", "end", "Done"), n("f", "end", "Failed")],
      edges: [e("1", "s", "a"), e("2", "a", "va"), e("3", "va", "b", "Yes"), e("4", "va", "a", "Retry"), e("5", "b", "vb"), e("6", "vb", "z", "Yes"), e("7", "vb", "b", "Retry"), e("8", "vb", "f", "Declined")] };
    expect(errs(g)).toEqual([]); expect([...backEdges(g)].sort()).toEqual(["4", "7"]);
    expect(g.edges.find((x) => x.id === "4")!.target).toBe("a"); expect(g.edges.find((x) => x.id === "7")!.target).toBe("b");
  });
  it("T5 a legitimate cycle is accepted, also when controllers are not typed 'decision'", () => {
    const g = otp(); g.nodes.find((x) => x.id === "limit")!.type = "check"; g.nodes.find((x) => x.id === "valid")!.type = "check";
    expect(errs(g)).toEqual([]);
  });
  it("T5b a loop with no exit is still an error", () => {
    const g: Graph = { nodes: [n("s", "start", "S"), n("a", "process", "A"), n("b", "process", "B"), n("z", "end", "Z")], edges: [e("1", "s", "a"), e("2", "a", "b"), e("3", "b", "a"), e("4", "s", "z")] };
    expect(errs(g).some((x) => /Unbounded/.test(x.msg))).toBe(true);
  });
  it("retry without a stated limit warns; with a limit it does not", () => {
    const g: Graph = { nodes: [n("s", "start", "S"), n("p", "process", "Enter OTP"), n("k", "decision", "OTP valid?"), n("z", "end", "Done")], edges: [e("1", "s", "p"), e("2", "p", "k"), e("3", "k", "p", "Try again"), e("4", "k", "z", "Valid")] };
    expect(warns(g).some((x) => /no stated attempt limit/.test(x.msg))).toBe(true);
    g.nodes[2].max = 3; expect(warns(g).some((x) => /no stated attempt limit/.test(x.msg))).toBe(false);
  });
});

describe("references, ambiguity and duplicates", () => {
  it("T6 an edge to a missing node is reported and no destination is invented", () => {
    const g = otp(); g.edges[7] = e("e8", "limit", "ghost", "Limit reached");
    expect(errs(g).some((x) => /missing node/.test(x.msg))).toBe(true);
    const r = repairGraph(g).graph; expect(r.nodes.length).toBe(g.nodes.length); expect(r.edges.find((x) => x.id === "e8")!.target).toBe("ghost");
  });
  it("T7 an unspecified failure outcome becomes an open question, not an edge", () => {
    const g = otp(); g.nodes = g.nodes.filter((x) => x.id !== "limit"); g.edges = g.edges.filter((x) => !["e6", "e7", "e8"].includes(x.id));
    expect(errs(g).length).toBeGreaterThan(0);
    const r = repairGraph(g).graph;
    expect(r.questions!.length).toBe(1); expect(r.questions![0].node).toBe("valid"); expect(r.edges.length).toBe(g.edges.length); expect(r.nodes.length).toBe(g.nodes.length);
    expect(errs(r)).toEqual([]); expect(warns(r).some((x) => /unresolved outcome/.test(x.msg))).toBe(true);
  });
  it("a 'Return to Login' copy is replaced by an edge to the existing Login Page", () => {
    const g = otp(); g.nodes.push(n("ret", "end", "Return to Login")); g.edges = g.edges.filter((x) => x.id !== "e8"); g.edges.push(e("e8", "limit", "ret", "Limit reached"));
    expect(warns(g).some((x) => /may duplicate/.test(x.msg))).toBe(true);
    const { graph, notes } = repairGraph(g);
    expect(graph.nodes.some((x) => x.id === "ret")).toBe(false); expect(graph.edges.find((x) => x.id === "e8")).toEqual(e("e8", "limit", "login", "Limit reached"));
    expect(notes.length).toBe(1); expect(errs(graph)).toEqual([]);
  });
  it("an ambiguous return target is asked about, not guessed", () => {
    const g = otp(); g.nodes.push(n("l2", "process", "Login Screen"), n("ret", "end", "Return to Login")); g.edges.push(e("e9", "limit", "ret", "Other"));
    const r = repairGraph(g).graph; expect(r.nodes.some((x) => x.id === "ret")).toBe(true); expect(r.questions!.some((q) => q.node === "ret")).toBe(true);
  });
  it("duplicate identical connections are an error", () => {
    const g = otp(); g.edges.push(e("e9", "valid", "dash", "Valid")); expect(errs(g).some((x) => /Duplicate connection/.test(x.msg))).toBe(true);
  });
  it("repair is idempotent and leaves a correct graph (and its loops) untouched", () => {
    const g = otp(), r1 = repairGraph(g), r2 = repairGraph(r1.graph);
    expect(r1.graph.edges).toEqual(g.edges); expect(r1.graph.nodes).toEqual(g.nodes); expect(r1.notes).toEqual([]); expect(r2.graph).toEqual(r1.graph);
  });
});

describe("structural relationships are not process steps", () => {
  it("T8 contains / member / authorizes / data / depends keep their kind and are never loops", () => {
    const g: Graph = { nodes: [n("t", "topic", "Tenant"), n("w", "topic", "Workspace"), n("u", "topic", "Admin"), n("db", "topic", "Billing DB")],
      edges: [e("1", "t", "w", "", "contains"), e("2", "u", "w", "", "member"), e("3", "u", "db", "", "authorizes"), e("4", "w", "db", "", "data"), e("5", "db", "w", "", "depends"), e("6", "w", "db", "", "depends")] };
    expect(errs(g)).toEqual([]); expect(backEdges(g).size).toBe(0); expect(classify(g).feedback.size).toBe(0);
    expect(repairGraph(g).graph.edges.map((x) => x.kind)).toEqual(["contains", "member", "authorizes", "data", "depends", "depends"]);
  });
  it("process cards linked only by structural edges are not flagged as dead ends", () => {
    const g: Graph = { nodes: [n("a", "process", "API"), n("b", "external", "Database")], edges: [e("1", "a", "b", "", "data")] };
    expect(errs(g)).toEqual([]);
  });
});

describe("persistence and local builder", () => {
  it("T10 reads the newest save, falls back to the v3 key, and ignores corrupt data", () => {
    const v3 = JSON.stringify({ nodes: [{ id: "n1", data: { type: "start", title: "A", desc: "" } }], edges: [], text: "old", title: "Old project" });
    expect(readSaved((k) => (k === "maptree:v3" ? v3 : null))!.title).toBe("Old project");
    expect(readSaved((k) => (k === "maptree:v4" ? JSON.stringify({ title: "New" }) : v3))!.title).toBe("New");
    expect(readSaved((k) => (k === "maptree:v4" ? "{not json" : v3))!.title).toBe("Old project");
    expect(readSaved(() => null)).toBeNull();
  });
  it("the local builder keeps a stated retry limit on its decision", () => {
    const r = parseOutline("Order\n  Submit order\n  Authorize payment\n    If authorization fails, retry up to 3 times\n  Ship\n  Done")!;
    expect(r.graph.nodes.find((x) => x.type === "decision")!.max).toBe(3);
  });
});
