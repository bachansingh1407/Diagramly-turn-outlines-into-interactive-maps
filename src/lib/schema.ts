import { z } from "zod";
// Validates untrusted graphs (AI output, imported files). Defaults make older files load too.
export const GraphSchema = z.object({
  nodes: z.array(z.object({
    id: z.string().min(1), type: z.enum(["start", "process", "check", "decision", "external", "end", "topic"]),
    title: z.string().min(1), desc: z.string().default(""),
  })).min(1),
  edges: z.array(z.object({
    id: z.string().min(1), source: z.string(), target: z.string(), label: z.string().default(""),
    kind: z.enum(["flow", "feedback"]).default("flow"),
  })),
});
