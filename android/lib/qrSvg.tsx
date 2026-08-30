// AK-LOGIC AI GST — Scannable QR Code SVG Generator & Component
import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Rect, Path, G, Text as SvgText } from 'react-native-svg';
import QRCodeGenerator from 'qrcode';

interface QRCodeProps {
  value: string;
  size?: number;
  dark?: string;
  light?: string;
  label?: string;
}

export function generateQrPath(value: string, size: number = 200, margin: number = 2) {
  try {
    const qr = QRCodeGenerator.create(value || 'https://gst.ak-logicai.in', {
      errorCorrectionLevel: 'M',
    });
    const moduleCount = qr.modules.size;
    const totalCount = moduleCount + margin * 2;
    const cellSize = size / totalCount;

    let path = '';
    for (let r = 0; r < moduleCount; r++) {
      for (let c = 0; c < moduleCount; c++) {
        if (qr.modules.get(r, c)) {
          const x = (c + margin) * cellSize;
          const y = (r + margin) * cellSize;
          path += `M${x},${y}h${cellSize}v${cellSize}h-${cellSize}z `;
        }
      }
    }
    return { path, moduleCount, cellSize, size };
  } catch (e) {
    console.warn('QR Code generation failed:', e);
    return null;
  }
}

export function QRCodeSvg({
  value,
  size = 200,
  dark = '#0c1322',
  light = '#ffffff',
  label,
}: QRCodeProps) {
  const qrData = useMemo(() => generateQrPath(value, size, 2), [value, size]);

  if (!qrData) {
    return <View style={{ width: size, height: size, backgroundColor: light }} />;
  }

  const extraHeight = label ? Math.round(size * 0.16) : 0;
  const totalHeight = size + extraHeight;

  return (
    <Svg width={size} height={totalHeight} viewBox={`0 0 ${size} ${totalHeight}`}>
      <Rect x="0" y="0" width={size} height={totalHeight} fill={light} rx={14} />
      <Path d={qrData.path} fill={dark} />
      {label ? (
        <G>
          <Rect x="0" y={size} width={size} height={extraHeight} fill={light} />
          <SvgText
            x={size / 2}
            y={size + extraHeight / 2 + 4}
            textAnchor="middle"
            fontSize={Math.round(extraHeight * 0.36)}
            fontWeight="bold"
            fill={dark}
            fontFamily="monospace"
          >
            {label}
          </SvgText>
        </G>
      ) : null}
    </Svg>
  );
}

/**
 * Generates a 100% Pure SVG string representation of a scannable QR Code without canvas DOM
 */
export async function getQrSvgString(
  value: string,
  dark = '#0c1322',
  light = '#ffffff',
  label?: string,
  size = 400
): Promise<string> {
  const qrData = generateQrPath(value, size, 2);
  if (!qrData) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${light}"/></svg>`;
  }

  const extraHeight = label ? Math.round(size * 0.16) : 0;
  const totalHeight = size + extraHeight;

  return `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${totalHeight}" viewBox="0 0 ${size} ${totalHeight}">
  <rect width="${size}" height="${totalHeight}" fill="${light}" rx="16"/>
  <path d="${qrData.path}" fill="${dark}"/>
  ${
    label
      ? `<rect x="0" y="${size}" width="${size}" height="${extraHeight}" fill="${light}"/>
  <text x="${size / 2}" y="${size + extraHeight / 2 + 5}" text-anchor="middle" font-family="monospace" font-weight="700" font-size="${Math.round(
          extraHeight * 0.38
        )}" fill="${dark}">${label}</text>`
      : ''
  }
</svg>`;
}

/**
 * Generates an SVG Data URL representation of a scannable QR Code that works natively in <img> tags and PDF renderers
 */
export async function getQrDataUrl(
  value: string,
  size = 480,
  dark = '#0c1322',
  light = '#ffffff',
  label?: string
): Promise<string> {
  const svg = await getQrSvgString(value, dark, light, label, size);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
