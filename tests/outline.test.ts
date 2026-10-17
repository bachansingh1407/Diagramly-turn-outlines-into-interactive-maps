import { describe, it, expect } from "vitest";
import { parseOutline } from "../src/lib/outline";
import { validate, backEdges } from "../src/lib/graph";

const RCS = `RCS SMS Delivery Flow
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
    Deliver message to end\u2011user phone
    Receive delivery reports (DLRs) and EDRs
    Update platform with status
    Enable real\u2011time customer tracking`;

describe("outline -> connected flow", () => {
  const r = parseOutline(RCS)!;
  const T = (id: string) => r.graph.nodes.find((x) => x.id === id)!.title;
  const link = (a: string, b: string, kind = "flow") => r.graph.edges.find((x) => T(x.source) === a && T(x.target) === b && x.kind === kind);

  it("makes one card per stage, not one per line", () => {
    expect(r.title).toBe("RCS SMS Delivery Flow");
    expect(r.graph.nodes.filter((x) => x.type !== "decision").map((x) => x.title)).toEqual(["API / Customer Panel", "aMaaP Platform", "Validation Process", "Routing Engine", "Provider Delivery & Failover", "End User & Reporting"]);
    expect(r.graph.nodes[1].desc).toBe("Receive request · Store request data · Apply settings (sender IDs, pricing, routing rules)");
  });
  it("types the cards", () => {
    const ty = (t: string) => r.graph.nodes.find((x) => x.title === t)!.type;
    expect(ty("API / Customer Panel")).toBe("start"); expect(ty("Validation Process")).toBe("check");
    expect(ty("Routing Engine")).toBe("process"); expect(ty("End User & Reporting")).toBe("end");
  });
  it("joins the stages in order", () => {
    expect(link("API / Customer Panel", "aMaaP Platform")).toBeDefined();
    expect(link("aMaaP Platform", "Validation Process")).toBeDefined();
    expect(link("Validation Process", "Routing Engine")).toBeDefined();
    expect(link("Routing Engine", "Provider Delivery & Failover")).toBeDefined();
  });
  it("turns the failure step into a decision that loops back to routing", () => {
    expect(link("Provider Delivery & Failover", "Provider Delivery successful?")).toBeDefined();
    expect(link("Provider Delivery successful?", "End User & Reporting")!.label).toBe("Yes");
    expect(link("Provider Delivery successful?", "Routing Engine")!.label).toBe("No");
    expect(backEdges(r.graph).size).toBe(1);
  });
  it("turns 'update platform with status' into a feedback arrow", () => {
    expect(link("End User & Reporting", "aMaaP Platform", "feedback")).toBeDefined();
  });
  it("is structurally valid", () => {
    expect(validate(r.graph).filter((i) => i.level === "error")).toEqual([]);
  });
  it("needs at least two stages", () => {
    expect(parseOutline("just one line")).toBeNull();
    expect(parseOutline("A\nB")).not.toBeNull();
  });
});
