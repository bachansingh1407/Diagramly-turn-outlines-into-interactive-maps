import type { Config } from "tailwindcss";
const c = (v: string) => `rgb(var(--${v}) / <alpha-value>)`;
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: { colors: { bg: c("bg"), panel: c("panel"), line: c("line"), ink: c("ink"), mute: c("mute"), accent: c("accent"), ok: c("ok"), no: c("no") } } },
} satisfies Config;
