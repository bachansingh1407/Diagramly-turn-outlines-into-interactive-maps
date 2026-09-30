import { loadShare } from '@/lib/share/store'
import ViewerClient from '@/components/ViewerClient'

export default async function ViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await loadShare(id)
  if (!data) {
    return (
      <div className="app" style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <h2>Link not found</h2>
          <p style={{ color: 'var(--foreground-muted)' }}>This share link doesn&apos;t exist or has expired.</p>
        </div>
      </div>
    )
  }
  return <ViewerClient text={data.text} mode={data.mode} pal={data.pal} />
}
