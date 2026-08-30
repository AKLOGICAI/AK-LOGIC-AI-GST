import { useEffect, useRef, useState } from 'react';
import QR from 'qrcode';

interface Props {
  value: string;        // the data to encode (we pass the full pay URL)
  size?: number;
  dark?: string;
  light?: string;
  className?: string;
}

/**
 * Real, scannable QR code rendered to a <canvas>.
 * Any phone camera can decode it because it encodes the actual `value`
 * using proper QR error-correction (level M).
 */
export default function QRCode({ value, size = 200, dark = '#0a0e1a', light = '#ffffff', className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    QR.toCanvas(
      canvas,
      value,
      {
        width: size,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark, light },
      },
      (err) => {
        if (err) console.error('QR render failed:', err);
        else setReady(true);
      }
    );
  }, [value, size, dark, light]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, borderRadius: 14, display: 'block', opacity: ready ? 1 : 0, transition: 'opacity .25s' }}
    />
  );
}

/** Generate a PNG data URL for the QR (for reliable downloads on mobile).
 * When `label` is given (e.g. the merchant's permanent Merchant ID), it is
 * drawn as a caption band beneath the QR itself, so the exported image —
 * not just the on-screen card — always carries the Merchant ID with it. */
export async function qrToPngDataUrl(value: string, size = 1024, dark = '#0a0e1a', light = '#ffffff', label?: string): Promise<string> {
  const qrDataUrl = await QR.toDataURL(value, { width: size, margin: 2, errorCorrectionLevel: 'M', color: { dark, light } });
  if (!label) return qrDataUrl;

  const bandHeight = Math.round(size * 0.16);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size + bandHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return qrDataUrl; // headless/unsupported environment — fall back to the plain QR

  const img = new Image();
  const drawn = new Promise<string>((resolve) => {
    img.onload = () => {
      ctx.fillStyle = light;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, size, size);
      ctx.fillStyle = dark;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `600 ${Math.round(bandHeight * 0.38)}px 'Segoe UI', Helvetica, Arial, sans-serif`;
      ctx.fillText(label, size / 2, size + bandHeight / 2);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(qrDataUrl);
  });
  img.src = qrDataUrl;
  return drawn;
}

/** Generate an SVG string for the QR (vector download). Same optional
 * `label` caption as qrToPngDataUrl, added as a real <text> element so it
 * stays crisp at any zoom level and stays editable/selectable in the SVG. */
export async function qrToSvgString(value: string, dark = '#0a0e1a', light = '#ffffff', label?: string): Promise<string> {
  const svg = await QR.toString(value, { type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark, light } });
  if (!label) return svg;

  const widthMatch = svg.match(/width="(\d+)"/);
  const heightMatch = svg.match(/height="(\d+)"/);
  const w = widthMatch ? parseInt(widthMatch[1], 10) : 200;
  const h = heightMatch ? parseInt(heightMatch[1], 10) : 200;
  const bandHeight = Math.round(h * 0.16);
  const newHeight = h + bandHeight;

  const withNewDims = svg
    .replace(/width="\d+"/, `width="${w}"`)
    .replace(/height="\d+"/, `height="${newHeight}"`)
    .replace(/viewBox="0 0 (\d+) (\d+)"/, `viewBox="0 0 $1 ${newHeight}"`)
    .replace(
      '</svg>',
      `<rect x="0" y="${h}" width="${w}" height="${bandHeight}" fill="${light}"/>` +
      `<text x="${w / 2}" y="${h + bandHeight / 2}" text-anchor="middle" dominant-baseline="middle" ` +
      `font-family="Segoe UI, Helvetica, Arial, sans-serif" font-weight="600" ` +
      `font-size="${Math.round(bandHeight * 0.4)}" fill="${dark}">${escapeXml(label)}</text></svg>`,
    );
  return withNewDims;
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c] as string));
}
