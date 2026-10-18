import { z } from "zod";
// Schema v1: the canonical, versioned model. Validates untrusted graphs (AI output, imported files).
export const SCHEMA_VERSION = 1;
export const KINDS = ["flow", "feedback", "contains", "member", "authorizes", "depends", "data"] as const;
export const PROV = ["stated", "inferred", "assumed"] as const; // stated = in the source, inferred = implied, assumed = gap filled
export type Prov = (typeof PROV)[number];
export const NODE_KINDS = ["start", "process", "check", "decision", "external", "end", "topic"] as const;
export const GraphSchema = z.object({
  version: z.number().int().min(1).max(SCHEMA_VERSION).default(1),
  nodes: z.array(z.object({
    id: z.string().min(1), type: z.enum(NODE_KINDS), title: z.string().min(1), desc: z.string().default(""),
    prov: z.enum(PROV).default("stated"), src: z.string().default(""),
    max: z.number().int().min(1).max(99).optional(), // stated attempt limit, on the decision that checks it
  })).min(1),
  edges: z.array(z.object({
    id: z.string().min(1), source: z.string(), target: z.string(), label: z.string().default(""),
    kind: z.enum(KINDS).default("flow"), prov: z.enum(PROV).default("stated"), src: z.string().default(""),
  })),
  questions: z.array(z.object({ id: z.string().default(""), summary: z.string(), node: z.string().default("") })).default([]), // unspecified behaviour: asked, never invented
  conflicts: z.array(z.object({ id: z.string().default(""), summary: z.string(), a: z.string().default(""), b: z.string().default("") })).default([]),
});
