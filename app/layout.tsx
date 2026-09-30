import './globals.css'
export const metadata = { title: 'MapTree — turn ideas into diagrams', description: 'MapTree turns outlines, plain prose, or AI-structured notes into interactive diagrams, with projects, version history, notes, and SRS/PRD generation.' }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><head>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  </head><body>{children}</body></html>
}
