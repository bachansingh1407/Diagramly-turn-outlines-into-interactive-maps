import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

export type SharePayload = { name: string; text: string; mode: string; pal: number; edgeT: string; createdAt: number }

const DIR = path.join(os.tmpdir(), 'maptree-shares')
async function ensure() { await fs.mkdir(DIR, { recursive: true }) }
const file = (id: string) => path.join(DIR, id.replace(/[^a-z0-9]/gi, '') + '.json')

export async function saveShare(id: string, data: SharePayload) {
  await ensure()
  await fs.writeFile(file(id), JSON.stringify(data))
}
export async function loadShare(id: string): Promise<SharePayload | null> {
  await ensure()
  try { return JSON.parse(await fs.readFile(file(id), 'utf8')) } catch { return null }
}
