import type { FlightDisc } from './BagCanvas'
import { clampWorld } from './bagCoords'

const SCHEMA_VERSION = 1
const PARAM_KEY = 'bag'

/** Compact wire shape to keep URLs shorter */
type WireDisc = {
  n: string
  c: string
  sh: [number, number]
  eh: [number, number]
  en: [number, number]
}

type BagPayload = {
  v: number
  discs: WireDisc[]
}

function utf8ToBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function base64UrlToUtf8(b64: string): string {
  let b64p = b64.replace(/-/g, '+').replace(/_/g, '/')
  while (b64p.length % 4) b64p += '='
  const binary = atob(b64p)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

function wireToFlightDisc(w: WireDisc): FlightDisc {
  const sh = clampWorld(w.sh[0]!, w.sh[1]!)
  const eh = clampWorld(w.eh[0]!, w.eh[1]!)
  const en = clampWorld(w.en[0]!, w.en[1]!)
  return {
    id: crypto.randomUUID(),
    name: typeof w.n === 'string' ? w.n.slice(0, 120) : 'Disc',
    color: typeof w.c === 'string' && /^#[0-9a-fA-F]{6}$/.test(w.c) ? w.c : '#06b6d4',
    startHandle: { x: sh.x, y: sh.y },
    endHandle: { x: eh.x, y: eh.y },
    end: { x: en.x, y: en.y },
  }
}

function flightDiscToWire(d: FlightDisc): WireDisc {
  return {
    n: d.name,
    c: d.color,
    sh: [d.startHandle.x, d.startHandle.y],
    eh: [d.endHandle.x, d.endHandle.y],
    en: [d.end.x, d.end.y],
  }
}

export function encodeBagToSearchParam(discs: FlightDisc[]): string {
  const payload: BagPayload = {
    v: SCHEMA_VERSION,
    discs: discs.map(flightDiscToWire),
  }
  return utf8ToBase64Url(JSON.stringify(payload))
}

export function decodeBagFromSearchParam(param: string): FlightDisc[] | null {
  try {
    const json = base64UrlToUtf8(param)
    const data = JSON.parse(json) as BagPayload
    if (data.v !== SCHEMA_VERSION || !Array.isArray(data.discs)) return null
    if (data.discs.length === 0) return null
    const out: FlightDisc[] = []
    for (const row of data.discs) {
      if (
        !row ||
        typeof row.n !== 'string' ||
        typeof row.c !== 'string' ||
        !Array.isArray(row.sh) ||
        !Array.isArray(row.eh) ||
        !Array.isArray(row.en) ||
        row.sh.length !== 2 ||
        row.eh.length !== 2 ||
        row.en.length !== 2
      ) {
        return null
      }
      const sh: [number, number] = [Number(row.sh[0]), Number(row.sh[1])]
      const eh: [number, number] = [Number(row.eh[0]), Number(row.eh[1])]
      const en: [number, number] = [Number(row.en[0]), Number(row.en[1])]
      if (sh.some((x) => Number.isNaN(x)) || eh.some((x) => Number.isNaN(x)) || en.some((x) => Number.isNaN(x))) {
        return null
      }
      out.push(wireToFlightDisc({ ...row, sh, eh, en }))
    }
    return out
  } catch {
    return null
  }
}

/** Read `?bag=` from the current window location search string. */
export function decodeBagFromSearchParams(params: URLSearchParams): FlightDisc[] | null {
  const raw = params.get(PARAM_KEY)
  if (!raw) return null
  return decodeBagFromSearchParam(raw)
}

/** Full URL with `bag=` set (for sharing). */
export function buildShareUrl(discs: FlightDisc[]): string {
  const url = new URL(window.location.href)
  url.searchParams.set(PARAM_KEY, encodeBagToSearchParam(discs))
  return url.toString()
}
