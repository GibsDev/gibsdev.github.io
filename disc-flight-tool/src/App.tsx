import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import { buildShareUrl, decodeBagFromSearchParams } from './bagUrlCodec'
import { BagCanvas, type FlightDisc } from './BagCanvas'
import './App.css'

const MOBILE_SIDEBAR_QUERY = '(max-width: 720px)'

function useMobileSidebarLayout(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const mq = window.matchMedia(MOBILE_SIDEBAR_QUERY)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_SIDEBAR_QUERY).matches,
    () => false,
  )
}

/** Same cyan as `public/favicon.svg` disc fill */
const DEFAULT_INITIAL_DISC_COLOR = '#06b6d4'

/** Landing distance (feet) for new discs; handles sit on the same vertical (x = 0) for a straight line. */
const DEFAULT_END_Y = 300

function straightVerticalDefaults(): Pick<
  FlightDisc,
  'startHandle' | 'endHandle' | 'end'
> {
  const y = DEFAULT_END_Y
  return {
    startHandle: { x: 0, y: y / 3 },
    endHandle: { x: 0, y: (2 * y) / 3 },
    end: { x: 0, y },
  }
}

function newDisc(partial: Partial<FlightDisc> & Pick<FlightDisc, 'name' | 'color'>): FlightDisc {
  const base = straightVerticalDefaults()
  return {
    id: crypto.randomUUID(),
    name: partial.name,
    color: partial.color,
    startHandle: partial.startHandle ?? base.startHandle,
    endHandle: partial.endHandle ?? base.endHandle,
    end: partial.end ?? base.end,
  }
}

/** Full-saturation-ish HSL → `#rrggbb` for `<input type="color">`. */
function hslToHex(h: number, s: number, l: number): string {
  const s1 = s / 100
  const l1 = l / 100
  const c = (1 - Math.abs(2 * l1 - 1)) * s1
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let rp = 0
  let gp = 0
  let bp = 0
  if (hp >= 0 && hp < 1) {
    rp = c
    gp = x
  } else if (hp < 2) {
    rp = x
    gp = c
  } else if (hp < 3) {
    gp = c
    bp = x
  } else if (hp < 4) {
    gp = x
    bp = c
  } else if (hp < 5) {
    rp = x
    bp = c
  } else {
    rp = c
    bp = x
  }
  const m = l1 - c / 2
  const byte = (v: number) =>
    Math.round(Math.min(255, Math.max(0, (v + m) * 255)))
  const hx = (n: number) => n.toString(16).padStart(2, '0')
  return `#${hx(byte(rp))}${hx(byte(gp))}${hx(byte(bp))}`
}

function randomVibrantHex(): string {
  const h = Math.random() * 360
  const s = 78 + Math.random() * 22
  const l = 46 + Math.random() * 14
  return hslToHex(h, s, l)
}

const initialDiscs: FlightDisc[] = [
  newDisc({ name: 'Buzzz', color: DEFAULT_INITIAL_DISC_COLOR }),
]

function loadDiscsFromUrl(): FlightDisc[] {
  const fromUrl = decodeBagFromSearchParams(
    new URLSearchParams(window.location.search),
  )
  if (fromUrl && fromUrl.length > 0) return fromUrl
  return initialDiscs
}

function App() {
  const [discs, setDiscs] = useState<FlightDisc[]>(() => loadDiscsFromUrl())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [shareFeedback, setShareFeedback] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const mobileLayout = useMobileSidebarLayout()
  const mobileSidebarOpen = mobileLayout && sidebarOpen

  useEffect(() => {
    if (!mobileSidebarOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileSidebarOpen])

  const focusDisc = useCallback(
    (id: string) => {
      setSelectedId(id)
      if (mobileLayout) setSidebarOpen(false)
    },
    [mobileLayout],
  )

  const activeId = useMemo(() => {
    if (selectedId != null && discs.some((d) => d.id === selectedId)) {
      return selectedId
    }
    return null
  }, [discs, selectedId])

  const onUpdateDisc = useCallback((id: string, patch: Partial<FlightDisc>) => {
    setDiscs((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    )
  }, [])

  const addDisc = () => {
    const d = newDisc({ name: 'New disc', color: randomVibrantHex() })
    setDiscs((prev) => [...prev, d])
    setSelectedId(d.id)
  }

  const removeDisc = (id: string) => {
    setDiscs((prev) => prev.filter((d) => d.id !== id))
  }

  const shareFlights = useCallback(async () => {
    const url = buildShareUrl(discs)
    window.history.replaceState(null, '', url)
    try {
      await navigator.clipboard.writeText(url)
      setShareFeedback('Link copied to clipboard')
      window.setTimeout(() => setShareFeedback(null), 2500)
    } catch {
      setShareFeedback('Copy blocked — copy the link from the address bar.')
      window.setTimeout(() => setShareFeedback(null), 4000)
    }
  }, [discs])

  const onSidebarDeadClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement
    if (t.closest('button, input, label')) return
    setSelectedId(null)
  }

  return (
    <div className="bag-app">
      {mobileSidebarOpen && (
        <button
          type="button"
          className="bag-sidebar-backdrop"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <main className="bag-main">
        {mobileLayout && (
          <button
            type="button"
            className="bag-menu-toggle"
            onClick={() => setSidebarOpen(true)}
            aria-expanded={mobileSidebarOpen}
            aria-controls="disc-flight-sidebar"
            id="disc-flight-menu-button"
          >
            Discs
          </button>
        )}
        <BagCanvas
          discs={discs}
          selectedId={activeId}
          onSelectDisc={setSelectedId}
          onClearFocus={() => setSelectedId(null)}
          onUpdateDisc={onUpdateDisc}
        />
      </main>
      <aside
        id="disc-flight-sidebar"
        className={
          'bag-sidebar' +
          (mobileSidebarOpen ? ' bag-sidebar--open' : '')
        }
        aria-label="Sidebar"
        aria-hidden={mobileLayout && !sidebarOpen}
      >
        <div className="bag-sidebar-scroll" onClick={onSidebarDeadClick}>
          {mobileLayout && (
            <div className="bag-sidebar-mobile-top">
              <span className="bag-sidebar-mobile-title">Discs</span>
              <button
                type="button"
                className="bag-sidebar-close"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close sidebar"
              >
                ×
              </button>
            </div>
          )}
          <header className="bag-sidebar-header">
            <div className="bag-sidebar-actions">
              <button type="button" className="bag-btn-primary" onClick={addDisc}>
                Add disc
              </button>
              <button
                type="button"
                className="bag-btn-neutral"
                onClick={() => void shareFlights()}
              >
                Share
              </button>
              {shareFeedback && (
                <p className="bag-share-feedback" role="status">
                  {shareFeedback}
                </p>
              )}
            </div>
          </header>
          <ul className="bag-disc-list">
          {discs.map((d) => (
            <li key={d.id}>
              <div
                className={
                  'bag-disc-card' + (d.id === activeId ? ' is-selected' : '')
                }
              >
                <label
                  className="bag-disc-color-btn"
                  onClick={() => setSelectedId(d.id)}
                >
                  <span className="bag-visually-hidden">
                    Color for {d.name}
                  </span>
                  <span
                    className="bag-disc-preview"
                    style={{ backgroundColor: d.color }}
                    aria-hidden
                  />
                  <input
                    type="color"
                    className="bag-color-input-overlay"
                    value={d.color}
                    onChange={(e) =>
                      onUpdateDisc(d.id, { color: e.target.value })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="bag-disc-select"
                  onClick={() => focusDisc(d.id)}
                >
                  <div className="bag-disc-fields">
                    <label className="bag-label">
                      <span className="bag-label-text">Name</span>
                      <input
                        className="bag-input"
                        value={d.name}
                        onChange={(e) =>
                          onUpdateDisc(d.id, { name: e.target.value })
                        }
                        onClick={(e) => e.stopPropagation()}
                      />
                    </label>
                  </div>
                </button>
                <button
                  type="button"
                  className="bag-disc-remove"
                  onClick={() => removeDisc(d.id)}
                  aria-label={`Remove ${d.name}`}
                >
                  ×
                </button>
              </div>
            </li>
          ))}
          </ul>
        </div>
      </aside>
    </div>
  )
}

export default App
