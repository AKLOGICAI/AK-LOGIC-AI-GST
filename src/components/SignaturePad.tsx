import { useRef, useEffect, useState, useCallback } from 'react';
import { Eraser, PenTool, Check } from 'lucide-react';

interface Props {
  value?: string;
  onChange: (dataUrl: string | undefined) => void;
  /** ink colour drawn on screen; exported PNG is always this colour on transparent bg */
  inkColor?: string;
  height?: number;
}

/**
 * In-app finger/stylus signature pad.
 * - Draws on a TRANSPARENT canvas (no white/coloured box).
 * - Exports a trimmed PNG with a fully transparent background so it composites
 *   cleanly onto the invoice. No image upload / download options.
 */
export default function SignaturePad({ value, onChange, inkColor = '#0a0e1a', height = 170 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const dirty = useRef(false);
  const [hasInk, setHasInk] = useState(!!value);

  const getCtx = () => canvasRef.current?.getContext('2d') ?? null;

  // size canvas to its container (retina aware), keep transparent
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = height * ratio;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = inkColor;
    }
  }, [height, inkColor]);

  useEffect(() => {
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [resize]);

  const pos = (e: PointerEvent | React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: (e as PointerEvent).clientX - rect.left, y: (e as PointerEvent).clientY - rect.top };
  };

  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    drawing.current = true;
    last.current = pos(e);
    canvasRef.current?.setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = getCtx();
    if (!ctx || !last.current) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    dirty.current = true;
    if (!hasInk) setHasInk(true);
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    if (dirty.current) exportTrimmed();
  };

  /** Export the drawn ink as a transparent, tightly-cropped PNG. */
  const exportTrimmed = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height: h } = canvas;
    const img = ctx.getImageData(0, 0, width, h).data;
    let minX = width, minY = h, maxX = 0, maxY = 0, found = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < width; x++) {
        if (img[(y * width + x) * 4 + 3] > 10) {
          found = true;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (!found) { onChange(undefined); setHasInk(false); return; }
    const pad = 8;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(width, maxX + pad); maxY = Math.min(h, maxY + pad);
    const w = maxX - minX, ht = maxY - minY;
    const out = document.createElement('canvas');
    out.width = w; out.height = ht;
    out.getContext('2d')!.drawImage(canvas, minX, minY, w, ht, 0, 0, w, ht);
    onChange(out.toDataURL('image/png'));
  };

  const clear = () => {
    const ctx = getCtx();
    const canvas = canvasRef.current;
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    dirty.current = false;
    setHasInk(false);
    onChange(undefined);
  };

  return (
    <div>
      <div
        className="relative rounded-xl overflow-hidden border-2 border-dashed border-[var(--color-line)]"
        style={{
          height,
          // subtle checkerboard ONLY in the editor to communicate transparency.
          backgroundImage:
            'linear-gradient(45deg,rgba(255,255,255,0.03) 25%,transparent 25%),linear-gradient(-45deg,rgba(255,255,255,0.03) 25%,transparent 25%),linear-gradient(45deg,transparent 75%,rgba(255,255,255,0.03) 75%),linear-gradient(-45deg,transparent 75%,rgba(255,255,255,0.03) 75%)',
          backgroundSize: '16px 16px',
          backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
        }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full touch-none cursor-crosshair"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
        />
        {!hasInk && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <span className="flex items-center gap-2 text-sm text-[var(--color-mist-2)]">
              <PenTool size={16} /> Sign here with your finger or mouse
            </span>
          </div>
        )}
        {/* baseline guide */}
        <div className="absolute left-6 right-6 bottom-9 border-b border-[var(--color-line)] pointer-events-none" />
      </div>
      <div className="flex items-center justify-between mt-2">
        <p className="text-[11px] text-[var(--color-mist-2)] flex items-center gap-1">
          {hasInk ? <><Check size={12} className="text-[var(--color-emerald)]" /> Signature captured · transparent background</> : 'Transparent — blends into the invoice'}
        </p>
        <button
          type="button"
          onClick={clear}
          className="text-[11px] flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[var(--color-ink)] text-[var(--color-mist)] hover:text-[var(--color-rose)] transition"
        >
          <Eraser size={12} /> Clear
        </button>
      </div>
    </div>
  );
}
