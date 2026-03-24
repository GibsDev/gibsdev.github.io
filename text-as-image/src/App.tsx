import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { toBlob } from 'html-to-image'
import './App.css'

const RES_PRESETS: { label: string; w: number; h: number }[] = [
  { label: '1080 × 1080', w: 1080, h: 1080 },
  { label: '1920 × 1080', w: 1920, h: 1080 },
  { label: '1200 × 630', w: 1200, h: 630 },
  { label: '800 × 600', w: 800, h: 600 },
]

const FONT_OPTIONS: { label: string; stack: string }[] = [
  { label: 'System UI', stack: 'system-ui, sans-serif' },
  { label: 'Georgia', stack: 'Georgia, serif' },
  { label: 'Times New Roman', stack: '"Times New Roman", Times, serif' },
  { label: 'Arial', stack: 'Arial, Helvetica, sans-serif' },
  { label: 'Verdana', stack: 'Verdana, Geneva, sans-serif' },
  { label: 'Courier New', stack: '"Courier New", Courier, monospace' },
  { label: 'Trebuchet MS', stack: '"Trebuchet MS", sans-serif' },
  { label: 'Impact', stack: 'Impact, Haettenschweiler, sans-serif' },
]

function clampSize(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.round(n)))
}

export default function App() {
  const captureRef = useRef<HTMLDivElement>(null)
  const previewWrapRef = useRef<HTMLDivElement>(null)
  const [previewScale, setPreviewScale] = useState(1)
  const [text, setText] = useState('Your text here')
  const [width, setWidth] = useState(1200)
  const [height, setHeight] = useState(630)
  const [fontSize, setFontSize] = useState(56)
  const [fontStack, setFontStack] = useState(FONT_OPTIONS[0]!.stack)
  const [bgColor, setBgColor] = useState('#1e293b')
  const [textColor, setTextColor] = useState('#f8fafc')
  const [align, setAlign] = useState<'center' | 'left'>('center')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const captureOptions = useMemo(
    () => ({
      width,
      height,
      pixelRatio: 1,
      cacheBust: true,
      backgroundColor: bgColor,
    }),
    [width, height, bgColor],
  )

  const updatePreviewScale = useCallback(() => {
    const wrap = previewWrapRef.current
    if (!wrap) return
    const aw = wrap.clientWidth
    const ah = wrap.clientHeight
    if (aw <= 0 || ah <= 0) return
    const s = Math.min(1, aw / width, ah / height)
    setPreviewScale(s)
  }, [width, height])

  useLayoutEffect(() => {
    updatePreviewScale()
  }, [updatePreviewScale])

  useLayoutEffect(() => {
    const wrap = previewWrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => updatePreviewScale())
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [updatePreviewScale])

  const blobFromPreview = useCallback(async (): Promise<Blob | null> => {
    const el = captureRef.current
    if (!el) return null
    return toBlob(el, captureOptions)
  }, [captureOptions])

  const saveImage = useCallback(async () => {
    setStatus(null)
    setBusy(true)
    try {
      const blob = await blobFromPreview()
      if (!blob) {
        setStatus('Could not create image.')
        return
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `text-as-image-${width}x${height}.png`
      a.rel = 'noopener'
      a.click()
      URL.revokeObjectURL(url)
      setStatus('Image saved.')
    } catch {
      setStatus('Save failed — try another browser or size.')
    } finally {
      setBusy(false)
    }
  }, [blobFromPreview, height, width])

  const copyImage = useCallback(async () => {
    setStatus(null)
    setBusy(true)
    try {
      const blob = await blobFromPreview()
      if (!blob) {
        setStatus('Could not create image.')
        return
      }
      if (!navigator.clipboard?.write) {
        setStatus('Clipboard copy is not supported here — use Save.')
        return
      }
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ])
      setStatus('Image copied to clipboard.')
    } catch {
      setStatus('Copy failed — use Save or check permissions.')
    } finally {
      setBusy(false)
    }
  }, [blobFromPreview])

  return (
    <div className="tai-app">
      <header className="tai-header">
        <h1>Text as image</h1>
      </header>

      <div className="tai-layout">
        <div className="tai-panel">
          <h2>Content</h2>
          <div className="tai-field">
            <label className="tai-label" htmlFor="tai-text">
              Text
            </label>
            <textarea
              id="tai-text"
              className="tai-textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck
            />
          </div>

          <div className="tai-field">
            <span className="tai-label">Resolution (px)</span>
            <div className="tai-row">
              <div className="tai-field">
                <label className="tai-label" htmlFor="tai-w">
                  Width
                </label>
                <input
                  id="tai-w"
                  className="tai-input-num"
                  type="number"
                  min={64}
                  max={8192}
                  value={width}
                  onChange={(e) =>
                    setWidth(clampSize(Number(e.target.value), 64, 8192))
                  }
                />
              </div>
              <div className="tai-field">
                <label className="tai-label" htmlFor="tai-h">
                  Height
                </label>
                <input
                  id="tai-h"
                  className="tai-input-num"
                  type="number"
                  min={64}
                  max={8192}
                  value={height}
                  onChange={(e) =>
                    setHeight(clampSize(Number(e.target.value), 64, 8192))
                  }
                />
              </div>
            </div>
          </div>

          <div className="tai-field">
            <span className="tai-label">Presets</span>
            <div className="tai-presets">
              {RES_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className="tai-preset"
                  onClick={() => {
                    setWidth(p.w)
                    setHeight(p.h)
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="tai-field">
            <label className="tai-label" htmlFor="tai-font">
              Font
            </label>
            <select
              id="tai-font"
              className="tai-select"
              value={fontStack}
              onChange={(e) => setFontStack(e.target.value)}
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.stack} value={f.stack}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <div className="tai-field">
            <label className="tai-label" htmlFor="tai-size">
              Font size (px)
            </label>
            <input
              id="tai-size"
              className="tai-input-num"
              type="number"
              min={8}
              max={800}
              value={fontSize}
              onChange={(e) =>
                setFontSize(clampSize(Number(e.target.value), 8, 800))
              }
            />
          </div>

          <div className="tai-field">
            <span className="tai-label">Colors</span>
            <div className="tai-color-row">
              <label className="tai-color-field">
                <span>Background</span>
                <input
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  aria-label="Background color"
                />
              </label>
              <label className="tai-color-field">
                <span>Text</span>
                <input
                  type="color"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  aria-label="Text color"
                />
              </label>
            </div>
          </div>

          <div className="tai-field">
            <span className="tai-label">Alignment</span>
            <div className="tai-align">
              <label>
                <input
                  type="radio"
                  name="tai-align"
                  checked={align === 'center'}
                  onChange={() => setAlign('center')}
                />
                Center
              </label>
              <label>
                <input
                  type="radio"
                  name="tai-align"
                  checked={align === 'left'}
                  onChange={() => setAlign('left')}
                />
                Left
              </label>
            </div>
          </div>

          <div className="tai-actions">
            <button
              type="button"
              className="tai-btn tai-btn-primary"
              disabled={busy}
              onClick={() => void copyImage()}
            >
              Copy image
            </button>
            <button
              type="button"
              className="tai-btn tai-btn-secondary"
              disabled={busy}
              onClick={() => void saveImage()}
            >
              Save PNG
            </button>
          </div>
          {status && (
            <p className="tai-status" role="status">
              {status}
            </p>
          )}
        </div>

        <div className="tai-panel">
          <h2>Preview</h2>
          <div ref={previewWrapRef} className="tai-preview-wrap">
            <div
              className="tai-preview-scaler"
              style={{
                width: width * previewScale,
                height: height * previewScale,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width,
                  height,
                  transform: `scale(${previewScale})`,
                  transformOrigin: 'top left',
                }}
              >
                <div
                  ref={captureRef}
                  className={
                    'tai-capture ' +
                    (align === 'center'
                      ? 'tai-capture--center'
                      : 'tai-capture--left')
                  }
                  style={{
                    width,
                    height,
                    backgroundColor: bgColor,
                    color: textColor,
                    fontFamily: fontStack,
                    fontSize,
                    lineHeight: 1.25,
                  }}
                >
                  <div className="tai-capture-inner">{text}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
