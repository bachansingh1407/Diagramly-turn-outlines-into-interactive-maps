/** Newest save first; older versions are still read so earlier projects are never orphaned. */
export const SAVE_KEYS = ["maptree:v4", "maptree:v3"] as const;
export function readSaved(get: (k: string) => string | null): Record<string, unknown> | null {
  for (const k of SAVE_KEYS) { try { const v = get(k); if (v) { const d = JSON.parse(v); if (d && typeof d === "object") return d; } } catch { /* try the next key */ } }
  return null;
}
