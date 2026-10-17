import { describe, it, expect } from "vitest";
import { parseHierarchy, parseOutline, looksHierarchy } from "../src/lib/outline";
import { layoutView, type View, type CardStyle } from "../src/lib/layout";
import { toSRS } from "../src/lib/srs";
import { validate } from "../src/lib/graph";

const org = "Company\n  Engineering\n    Frontend\n    Backend\n  Sales\n    Inbound";
const flow = "Order\n  Customer\n    Add items\n  Payment Check\n    Validate card\n    If payment fails retry up to 3 times\n  Fulfilment\n    Ship order\n  Delivered\n    Send email";
describe("v4", () => {
  it("reads an org list as a valid hierarchy", () => {
    expect(looksHierarchy(org)).toBe(true); expect(looksHierarchy(flow)).toBe(false);
    const r = parseHierarchy(org)!; expect(r.graph.nodes.length).toBe(6);
    expect(validate(r.graph).filter((i) => i.level === "error")).toEqual([]);
  });
  it("places every node in every view and style", () => {
    for (const g of [parseHierarchy(org)!.graph, parseOutline(flow)!.graph])
      for (const v of ["flow-tb", "flow-lr", "tree", "mind", "loop"] as View[]) for (const c of ["classic", "workflow", "detail"] as CardStyle[]) {
        const p = layoutView(g, v, c); g.nodes.forEach((n) => expect(p[n.id]).toBeDefined());
      }
  });
  it("writes an SRS that covers every card", () => {
    const g = parseOutline(flow)!.graph, md = toSRS("Order", g);
    g.nodes.forEach((n) => expect(md).toContain(n.title)); expect(md).toMatch(/FR-01/);
  });
});
