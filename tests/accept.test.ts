import { describe, it, expect } from "vitest";
import { acceptGraph } from "../src/lib/accept";
import { GraphSchema } from "../src/lib/schema";
import { applyChanges } from "../src/lib/patch";
import { layoutView, type View, type CardStyle } from "../src/lib/layout";
import { validate } from "../src/lib/graph";

// Mocked model answers: deterministic, no network, no cost.
const TEXT = "The user enters an email address and password on the login page. After successful password authentication, the system sends an OTP. If the OTP is valid, the user is redirected to the dashboard. If the OTP is invalid, the user may try again. After three consecutive invalid OTP attempts, the system redirects the user to the login page.";
const base = () => ({
  nodes: [{ id: "login", type: "start", title: "Login Page", src: "login page" }, { id: "verify", type: "check", title: "Verify Credentials" }, { id: "send", type: "process", title: "Send OTP", src: "sends an OTP" },
    { id: "enter", type: "process", title: "Enter OTP" }, { id: "valid", type: "decision", title: "OTP Valid?", src: "If the OTP is valid" }, { id: "dash", type: "end", title: "Dashboard", src: "redirected to the dashboard" },
    { id: "limit", type: "decision", title: "Attempt limit reached?", max: 3, src: "three consecutive invalid OTP attempts" }],
  edges: [{ id: "e1", source: "login", target: "verify" }, { id: "e2", source: "verify", target: "send" }, { id: "e3", source: "send", target: "enter" }, { id: "e4", source: "enter", target: "valid" },
    { id: "e5", source: "valid", target: "dash", label: "Valid" }, { id: "e6", source: "valid", target: "limit", label: "Invalid" },
    { id: "e7", source: "limit", target: "enter", label: "Attempts remaining" }, { id: "e8", source: "limit", target: "login", label: "Limit reached" }],
});
const raw = (o: unknown) => JSON.stringify(o);

describe("accepting (mocked) AI output", () => {
  it("accepts the correct OTP graph with its limit, conditions and returns", () => {
    const r = acceptGraph(raw(base()), TEXT);
    expect(r.problems).toEqual([]); expect(r.graph!.nodes.find((x) => x.id === "limit")!.max).toBe(3);
    expect(r.graph!.edges.find((x) => x.label === "Limit reached")!.target).toBe("login");
  });
  it("replaces a 'Return to Login' node with an edge to the existing Login Page", () => {
    const b = base(); b.nodes.push({ id: "ret", type: "end", title: "Return to Login" }); b.edges[7] = { id: "e8", source: "limit", target: "ret", label: "Limit reached" };
    const r = acceptGraph(raw(b), TEXT);
    expect(r.graph!.nodes.some((x) => x.id === "ret")).toBe(false); expect(r.graph!.edges.find((x) => x.id === "e8")!.target).toBe("login"); expect(r.notes.length).toBe(1);
  });
  it("rejects an edge to a missing node instead of inventing the destination", () => {
    const b = base(); b.edges[7] = { id: "e8", source: "limit", target: "ghost", label: "Limit reached" };
    const r = acceptGraph(raw(b), TEXT); expect(r.problems.some((p) => /missing node/.test(p))).toBe(true); expect(r.graph!.nodes.length).toBe(b.nodes.length);
  });
  it("an unspecified outcome becomes a question and adds no edge", () => {
    const b = base(); b.nodes = b.nodes.filter((x) => x.id !== "limit"); b.edges = b.edges.filter((x) => !["e6", "e7", "e8"].includes(x.id));
    const r = acceptGraph(raw(b), TEXT); expect(r.problems).toEqual([]); expect(r.graph!.questions!.length).toBe(1); expect(r.graph!.edges.length).toBe(5);
  });
  it("a quote that is not in the source cannot back a stated claim", () => {
    const b = base(); b.nodes[1] = { id: "verify", type: "check", title: "Verify Credentials", src: "uses bcrypt" } as never;
    const r = acceptGraph(raw(b), TEXT); expect(r.graph!.nodes[1].src).toBe("");
  });
  it("rejects invalid JSON and out-of-range limits", () => {
    expect(acceptGraph("not json", TEXT).problems.length).toBe(1);
    const b = base(); (b.nodes[6] as { max: number }).max = 0; expect(acceptGraph(raw(b), TEXT).problems.length).toBeGreaterThan(0);
  });
  it("T10 older files without kind, provenance or version still load", () => {
    const g = GraphSchema.parse({ nodes: [{ id: "s", type: "start", title: "S" }, { id: "z", type: "end", title: "Z" }], edges: [{ id: "1", source: "s", target: "z" }] });
    expect(g.edges[0].kind).toBe("flow"); expect(g.nodes[0].prov).toBe("stated"); expect(g.questions).toEqual([]);
  });
});

describe("refinement keeps loops", () => {
  const g = () => GraphSchema.parse(base());
  it("T9 renaming an unrelated node leaves every edge (including returns) identical", () => {
    const before = g(), r = applyChanges(before, [{ op: "update_node", id: "send", set: { title: "Send one-time code" } }]);
    expect(r.errors).toEqual([]); expect(r.graph.edges).toEqual(before.edges); expect(r.graph.nodes.find((x) => x.id === "limit")!.max).toBe(3);
  });
  it("refinement may not add a copy node for a return", () => {
    expect(applyChanges(g(), [{ op: "add_node", type: "process", title: "Return to Login" }]).errors.length).toBe(1);
    expect(applyChanges(g(), [{ op: "add_node", type: "process", title: "Enter OTP" }]).errors.length).toBe(1);
  });
  it("a requested return is made with an edge to the existing node", () => {
    const r = applyChanges(g(), [{ op: "add_edge", source: "send", target: "login", label: "Resend failed", kind: "flow" }]);
    expect(r.errors).toEqual([]); expect(r.graph.nodes.length).toBe(g().nodes.length); expect(validate(r.graph).filter((i) => i.level === "error")).toEqual([]);
  });
});

describe("layout handles cycles", () => {
  it("T5 every view places every node of a cyclic graph, including structural cycles", () => {
    const cyc = GraphSchema.parse({ nodes: [{ id: "a", type: "topic", title: "A" }, { id: "b", type: "topic", title: "B" }], edges: [{ id: "1", source: "a", target: "b", kind: "depends" }, { id: "2", source: "b", target: "a", kind: "depends" }] });
    for (const gr of [g0(), cyc]) for (const v of ["flow-tb", "flow-lr", "tree", "mind", "loop"] as View[]) for (const c of ["classic", "workflow", "detail"] as CardStyle[]) {
      const p = layoutView(gr, v, c); gr.nodes.forEach((x) => expect(p[x.id]).toBeDefined());
    }
  });
});
const g0 = () => GraphSchema.parse(base());
