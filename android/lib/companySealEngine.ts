/**
 * AK-LOGIC AI GST — Company Seal Generator Engine (Android / React Native)
 *
 * Generates official circular company seals supporting:
 * - 4 Official Styles: classic (triple-ring), modern (clean dual-ring), badge (36-point scalloped), corporate (dual-ring + stars)
 * - 6 Official Ink Colors: Navy (#0a2a6b), Crimson (#b81d24), Charcoal (#2d3748), Emerald (#065f46), Bronze (#b45309), Steel (#1e3a8a)
 * - Dynamic circular arc text math for Business Name, GSTIN & State, and optional Establishment Year
 * - SVG data URL export for invoice PDF inclusion and high-res vector preview
 */

export type SealStyle = 'classic' | 'modern' | 'badge' | 'corporate';

export interface SealColorOption {
  id: string;
  name: string;
  hex: string;
}

export const SEAL_INK_COLORS: SealColorOption[] = [
  { id: 'navy', name: 'Navy Blue', hex: '#0a2a6b' },
  { id: 'crimson', name: 'Crimson Red', hex: '#b81d24' },
  { id: 'charcoal', name: 'Charcoal Black', hex: '#2d3748' },
  { id: 'emerald', name: 'Emerald Green', hex: '#065f46' },
  { id: 'bronze', name: 'Bronze Gold', hex: '#b45309' },
  { id: 'steel', name: 'Steel Blue', hex: '#1e3a8a' },
];

export interface SealInput {
  businessName: string;
  gstin: string;
  state: string;
  establishedYear?: string;
  style?: SealStyle;
  color?: string;
}

export interface CharPos {
  char: string;
  x: number;
  y: number;
  rotation: number;
}

/**
 * Calculates character coordinates along a circular arc with angular spacing.
 */
export function calculateArcChars(
  text: string,
  radius: number,
  cx: number,
  cy: number,
  centerAngleDeg: number,
  spreadDeg: number,
  bottom: boolean = false
): CharPos[] {
  const chars = bottom ? text.split('').reverse() : text.split('');
  if (chars.length === 0) return [];
  const anglePerChar = spreadDeg / Math.max(1, chars.length);
  let angle = centerAngleDeg - spreadDeg / 2 + anglePerChar / 2;
  const result: CharPos[] = [];

  for (const ch of chars) {
    const rad = (angle * Math.PI) / 180;
    const x = cx + radius * Math.sin(rad);
    const y = cy - radius * Math.cos(rad);
    const rotation = angle + (bottom ? 180 : 0);
    result.push({ char: ch, x, y, rotation });
    angle += anglePerChar;
  }

  return bottom ? result.reverse() : result;
}

/**
 * Generates an SVG string representation of the company seal.
 */
export function generateCompanySealSvg(input: SealInput, size: number = 300): string {
  const cx = size / 2;
  const cy = size / 2;
  const style = input.style || 'classic';
  const ink = input.color || '#0a2a6b';

  const name = (input.businessName || 'BUSINESS NAME').toUpperCase().trim();
  const statePart = (input.state || 'INDIA').toUpperCase().trim();
  const gstinPart = (input.gstin || 'UNREGISTERED').toUpperCase().trim();
  const bottomLine = `GSTIN ${gstinPart}  •  ${statePart}`;
  const year = (input.establishedYear || '').trim();

  // Dynamic font sizing and spread
  const nameBaseSize = style === 'modern' ? size * 0.042 : size * 0.045;
  const nameFontSize = name.length > 25
    ? Math.max(size * 0.022, nameBaseSize * (20 / name.length))
    : name.length > 15
      ? Math.max(size * 0.028, nameBaseSize * (15 / name.length))
      : nameBaseSize;
  const nameSpread = Math.min(180, Math.max(60, name.length * 9.5));

  const bottomBaseSize = style === 'modern' ? size * 0.028 : size * 0.032;
  const bottomFontSize = bottomLine.length > 32
    ? Math.max(size * 0.018, bottomBaseSize * (28 / bottomLine.length))
    : bottomBaseSize;
  const bottomSpread = Math.min(180, Math.max(80, bottomLine.length * 5.8));

  // Radii
  const topRadius = (style === 'classic' || style === 'badge') ? size * 0.41 : size * 0.38;
  const bottomRadius = (style === 'classic' || style === 'badge') ? size * 0.41 : size * 0.38;

  const topChars = calculateArcChars(name, topRadius, cx, cy, 0, nameSpread, false);
  const bottomChars = calculateArcChars(bottomLine, bottomRadius, cx, cy, 180, bottomSpread, true);

  let bordersSvg = '';
  if (style === 'classic') {
    bordersSvg = `
      <circle cx="${cx}" cy="${cy}" r="${size * 0.46}" stroke="${ink}" stroke-width="${size * 0.018}" fill="none"/>
      <circle cx="${cx}" cy="${cy}" r="${size * 0.36}" stroke="${ink}" stroke-width="${size * 0.008}" fill="none"/>
      <circle cx="${cx}" cy="${cy}" r="${size * 0.22}" stroke="${ink}" stroke-width="${size * 0.008}" fill="none"/>
    `;
  } else if (style === 'modern') {
    bordersSvg = `
      <circle cx="${cx}" cy="${cy}" r="${size * 0.46}" stroke="${ink}" stroke-width="${size * 0.014}" fill="none"/>
      <circle cx="${cx}" cy="${cy}" r="${size * 0.42}" stroke="${ink}" stroke-width="${size * 0.004}" fill="none"/>
      <circle cx="${cx}" cy="${cy}" r="${size * 0.20}" stroke="${ink}" stroke-width="${size * 0.006}" stroke-dasharray="4,3" fill="none"/>
    `;
  } else if (style === 'badge') {
    const numPoints = 36;
    const innerRad = size * 0.43;
    const outerRad = size * 0.46;
    let pathD = '';
    for (let i = 0; i < numPoints * 2; i++) {
      const angle = (i * Math.PI) / numPoints;
      const r = i % 2 === 0 ? outerRad : innerRad;
      const px = cx + r * Math.cos(angle);
      const py = cy + r * Math.sin(angle);
      pathD += i === 0 ? `M${px.toFixed(1)},${py.toFixed(1)}` : ` L${px.toFixed(1)},${py.toFixed(1)}`;
    }
    pathD += ' Z';
    bordersSvg = `
      <path d="${pathD}" stroke="${ink}" stroke-width="${size * 0.01}" fill="none"/>
      <circle cx="${cx}" cy="${cy}" r="${size * 0.36}" stroke="${ink}" stroke-width="${size * 0.008}" stroke-dasharray="6,4" fill="none"/>
      <circle cx="${cx}" cy="${cy}" r="${size * 0.24}" stroke="${ink}" stroke-width="${size * 0.006}" fill="none"/>
    `;
  } else if (style === 'corporate') {
    bordersSvg = `
      <circle cx="${cx}" cy="${cy}" r="${size * 0.46}" stroke="${ink}" stroke-width="${size * 0.01}" fill="none"/>
      <circle cx="${cx}" cy="${cy}" r="${size * 0.43}" stroke="${ink}" stroke-width="${size * 0.008}" fill="none"/>
      <circle cx="${cx}" cy="${cy}" r="${size * 0.26}" stroke="${ink}" stroke-width="${size * 0.008}" fill="none"/>
      <text x="${cx - size * 0.375}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="${ink}" font-size="${size * 0.035}">★</text>
      <text x="${cx + size * 0.375}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="${ink}" font-size="${size * 0.035}">★</text>
    `;
  }

  // Center Content
  let centerContent = '';
  if (style === 'corporate') {
    centerContent = `
      <text x="${cx}" y="${year ? cy - size * 0.04 : cy - size * 0.02}" text-anchor="middle" dominant-baseline="central" fill="${ink}" font-size="${size * 0.032}" font-weight="bold" letter-spacing="1">GOVT. REGD</text>
      <text x="${cx}" y="${year ? cy + size * 0.02 : cy + size * 0.04}" text-anchor="middle" dominant-baseline="central" fill="${ink}" font-size="${size * 0.026}" font-weight="600" letter-spacing="0.5">AUTHORISED SIGNATORY</text>
      ${year ? `<text x="${cx}" y="${cy + size * 0.07}" text-anchor="middle" dominant-baseline="central" fill="${ink}" font-size="${size * 0.022}" font-weight="bold">ESTD. ${year}</text>` : ''}
    `;
  } else if (style === 'modern') {
    centerContent = `
      <text x="${cx}" y="${year ? cy - size * 0.04 : cy - size * 0.02}" text-anchor="middle" dominant-baseline="central" fill="${ink}" font-size="${size * 0.035}" font-weight="bold">VERIFIED</text>
      <text x="${cx}" y="${year ? cy + size * 0.02 : cy + size * 0.04}" text-anchor="middle" dominant-baseline="central" fill="${ink}" font-size="${size * 0.026}">TAX INVOICE</text>
      ${year ? `<text x="${cx}" y="${cy + size * 0.07}" text-anchor="middle" dominant-baseline="central" fill="${ink}" font-size="${size * 0.022}" font-weight="bold">ESTD. ${year}</text>` : ''}
    `;
  } else {
    // Classic & Badge
    centerContent = `
      <text x="${cx}" y="${year ? cy - size * 0.06 : cy - size * 0.04}" text-anchor="middle" dominant-baseline="central" fill="${ink}" font-size="${size * 0.05}">★</text>
      <text x="${cx}" y="${year ? cy : cy + size * 0.01}" text-anchor="middle" dominant-baseline="central" fill="${ink}" font-size="${size * 0.026}" font-weight="bold" letter-spacing="0.5">AUTHORISED</text>
      <text x="${cx}" y="${year ? cy + size * 0.04 : cy + size * 0.05}" text-anchor="middle" dominant-baseline="central" fill="${ink}" font-size="${size * 0.022}" font-weight="bold" letter-spacing="0.5">SIGNATORY</text>
      ${year ? `<text x="${cx}" y="${cy + size * 0.08}" text-anchor="middle" dominant-baseline="central" fill="${ink}" font-size="${size * 0.02}" font-weight="bold">EST. ${year}</text>` : ''}
    `;
  }

  const topTextSvg = topChars
    .map((c) => `<text x="${c.x.toFixed(1)}" y="${c.y.toFixed(1)}" transform="rotate(${c.rotation.toFixed(1)} ${c.x.toFixed(1)} ${c.y.toFixed(1)})" text-anchor="middle" dominant-baseline="central" fill="${ink}" font-family="sans-serif" font-weight="bold" font-size="${nameFontSize.toFixed(1)}">${c.char === '&' ? '&amp;' : c.char === '<' ? '&lt;' : c.char === '>' ? '&gt;' : c.char}</text>`)
    .join('\n');

  const bottomTextSvg = bottomChars
    .map((c) => `<text x="${c.x.toFixed(1)}" y="${c.y.toFixed(1)}" transform="rotate(${c.rotation.toFixed(1)} ${c.x.toFixed(1)} ${c.y.toFixed(1)})" text-anchor="middle" dominant-baseline="central" fill="${ink}" font-family="sans-serif" font-weight="600" font-size="${bottomFontSize.toFixed(1)}">${c.char === '&' ? '&amp;' : c.char === '<' ? '&lt;' : c.char === '>' ? '&gt;' : c.char}</text>`)
    .join('\n');

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
      ${bordersSvg}
      ${topTextSvg}
      ${bottomTextSvg}
      ${centerContent}
    </svg>
  `.trim();
}

/**
 * Returns an SVG Data URL representation of the company seal.
 */
export function generateCompanySealDataUrl(input: SealInput): string {
  const svg = generateCompanySealSvg(input, 400);
  const encoded = encodeURIComponent(svg)
    .replace(/'/g, '%27')
    .replace(/"/g, '%22');
  return `data:image/svg+xml;utf8,${encoded}`;
}
