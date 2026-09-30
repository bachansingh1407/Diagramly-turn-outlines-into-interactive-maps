export type ProjectData = {
  id: string
  name: string
  text: string
  mode: string
  pal: number
  edgeT: string
  snap: boolean
  showMap: boolean
  createdAt: number
  updatedAt: number
}
export type Version = { id: string; projectId: string; text: string; label: string; createdAt: number }
export type Comment = { id: string; projectId: string; path: string; body: string; createdAt: number }
