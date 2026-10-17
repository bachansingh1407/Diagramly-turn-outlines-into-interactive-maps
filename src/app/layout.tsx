import "./globals.css";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
const inter = Inter({ subsets: ["latin"] });
export const metadata = { title: "MapTree — text to diagrams", description: "Turn documents into correct, editable diagrams." };
export default function RootLayout({ children }: { children: ReactNode }) {
  return (<html lang="en"><body className={inter.className}>{children}</body></html>);
}
