import { describe, it, expect } from "vitest";
import { validate, backEdges, classify, toMermaid, type Graph, type NodeType } from "../src/lib/graph";
import { GraphSchema } from "../src/lib/schema";

const n = (id: string, type: NodeType = "process", title = id) => ({ id, type, title, desc: "" });
const e = (id: string, source: string, target: string, label = "", kind: "flow" | "feedback" = "flow") => ({ id, source, target, label, kind });
const errs = (g: Graph) => validate(g).filter((i) => i.level === "error");

describe("graph validation", () => {
  it("accepts a linear flow", () => {
    expect(errs({ nodes: [n("s", "start"), n("a"), n("z", "end")], edges: [e("1", "s", "a"), e("2", "a", "z")] })).toEqual([]);
  });
  it("accepts a conditional branch with merge", () => {
    const g = { nodes: [n("s", "start"), n("d", "decision"), n("a"), n("b"), n("z", "end")], edges: [e("1", "s", "d"), e("2", "d", "a", "Yes"), e("3", "d", "b", "No"), e("4", "a", "z"), e("5", "b", "z")] };
    expect(errs(g)).toEqual([]);
  });
  it("flags disconnected nodes and missing-node edges", () => {
    const m = errs({ nodes: [n("s", "start"), n("x"), n("z", "end")], edges: [e("1", "s", "z"), e("2", "s", "ghost")] }).map((i) => i.msg).join("|");
    expect(m).toMatch(/disconnected/); expect(m).toMatch(/missing node/);
  });
  it("flags decisions with one branch", () => {
    expect(errs({ nodes: [n("s", "start"), n("d", "decision"), n("z", "end")], edges: [e("1", "s", "d"), e("2", "d", "z", "Yes")] }).length).toBeGreaterThan(0);
  });
  it("accepts a bounded retry loop", () => {
    const g = { nodes: [n("s", "start"), n("p"), n("k", "decision", "Retries left (max 3)?"), n("z", "end")], edges: [e("1", "s", "p"), e("2", "p", "k"), e("3", "k", "p", "Yes"), e("4", "k", "z", "No")] };
    expect(backEdges(g).size).toBe(1);
    expect(validate(g).filter((i) => /loop/i.test(i.msg))).toEqual([]);
  });
  it("rejects an unbounded loop", () => {
    const g = { nodes: [n("s", "start"), n("a"), n("b"), n("z", "end")], edges: [e("1", "s", "a"), e("2", "a", "b"), e("3", "b", "a"), e("4", "s", "z")] };
    expect(errs(g).some((i) => /Unbounded/.test(i.msg))).toBe(true);
  });
  it("feedback arrows are not loops and don't count as flow", () => {
    const g = { nodes: [n("s", "start"), n("a"), n("z", "end")], edges: [e("1", "s", "a"), e("2", "a", "z"), e("3", "z", "a", "status", "feedback")] };
    expect(errs(g)).toEqual([]);
    expect(classify(g).feedback.has("3")).toBe(true);
    expect(backEdges(g).size).toBe(0);
    expect(toMermaid(g)).toMatch(/-\.->\|status\|/);
  });
  it("round-trips through JSON and fills defaults for older files", () => {
    const g = GraphSchema.parse({ nodes: [{ id: "s", type: "start", title: "S" }, { id: "z", type: "end", title: "Z" }], edges: [{ id: "1", source: "s", target: "z" }] });
    expect(g.edges[0].kind).toBe("flow");
    expect(GraphSchema.parse(JSON.parse(JSON.stringify(g)))).toEqual(g);
  });
});
