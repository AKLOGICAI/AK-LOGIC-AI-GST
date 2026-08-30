/**
 * Company Seal — UI-only helper.
 *
 * Generates a professional circular "company seal" as a PNG data URL,
 * drawn entirely client-side on a <canvas>. This is purely a display/PDF
 * enhancement — it does not touch invoice numbering, GST calculation, or
 * any backend logic. The resulting data URL is saved exactly like
 * logoDataUrl / signatureDataUrl (see Merchant.companySealDataUrl).
 */

export interface GenerateSealInput {
  businessName: string;
  gstin: string;
  state: string;
  establishedYear?: string;
  style?: 'classic' | 'modern' | 'badge' | 'corporate';
  color?: string;
}

/**
 * Draw a beautiful 5-point star inside the canvas.
 */
function drawCenterStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    // Outer point
    const outerAngle = ((90 + i * 72) * Math.PI) / 180;
    ctx.lineTo(cx + r * Math.cos(outerAngle), cy - r * Math.sin(outerAngle));
    
    // Inner point
    const innerAngle = ((90 + 36 + i * 72) * Math.PI) / 180;
    ctx.lineTo(cx + (r * 0.4) * Math.cos(innerAngle), cy - (r * 0.4) * Math.sin(innerAngle));
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * Get initials for a business name for monogram/crest styles.
 */
function getInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * Draw text along a circular arc, centered on `centerAngleDeg`
 * (0° = top of the circle, 180° = bottom, measured clockwise).
 */
function drawCircularText(
  ctx: CanvasRenderingContext2D,
  text: string,
  radius: number,
  cx: number,
  cy: number,
  centerAngleDeg: number,
  spread: number,
  bottom = false,
) {
  const chars = bottom ? text.split('').reverse() : text.split('');
  if (chars.length === 0) return;
  const anglePerChar = spread / chars.length;
  let angle = centerAngleDeg - spread / 2 + anglePerChar / 2;
  for (const ch of chars) {
    const rad = (angle * Math.PI) / 180;
    const x = cx + radius * Math.sin(rad);
    const y = cy - radius * Math.cos(rad);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rad + (bottom ? Math.PI : 0));
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    angle += anglePerChar;
  }
}

/**
 * Generates a circular company seal (transparent PNG, configurable design & ink color)
 * from the business name, GSTIN, state, and optional establishment year.
 * Returns a data URL ready to store as companySealDataUrl.
 */
export function generateCompanySeal(input: GenerateSealInput): string {
  const size = 600;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const cx = size / 2;
  const cy = size / 2;
  
  const style = input.style || 'classic';
  const ink = input.color || '#0a2a6b'; // default navy-blue

  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 1. Draw borders based on chosen style
  if (style === 'classic') {
    // Outer thick ring
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.46, 0, Math.PI * 2);
    ctx.stroke();

    // Inner thin ring - adjusted to size * 0.36 to create 60px track width (prevents text overlap)
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.36, 0, Math.PI * 2);
    ctx.stroke();

    // Center ring
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.22, 0, Math.PI * 2);
    ctx.stroke();

  } else if (style === 'modern') {
    // Elegant single clean border
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.46, 0, Math.PI * 2);
    ctx.stroke();

    // Inner very thin line
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.42, 0, Math.PI * 2);
    ctx.stroke();

  } else if (style === 'badge') {
    // Scalloped / official wavy outer border
    const numPoints = 36;
    const innerRad = size * 0.43;
    const outerRad = size * 0.46;
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let i = 0; i < numPoints * 2; i++) {
      const angle = (i * Math.PI) / numPoints;
      const r = i % 2 === 0 ? outerRad : innerRad;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    // Dotted inner ring
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.36, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]); // reset dash

    // Small inner circle
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.24, 0, Math.PI * 2);
    ctx.stroke();

  } else if (style === 'corporate') {
    // Double thin outer rings
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.46, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.43, 0, Math.PI * 2);
    ctx.stroke();

    // Inner ring
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.26, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 2. Draw curved text (Business Name on top, GSTIN/State on bottom)
  // Text cut/overlap fix: Calculate font sizes and spreads dynamically
  const name = input.businessName.toUpperCase().trim();
  const baseFontSize = style === 'modern' ? 24 : 26;
  
  // Dynamic font sizing
  const nameFontSize = name.length > 25 
    ? Math.max(12, Math.round(baseFontSize * (20 / name.length))) 
    : name.length > 15 
      ? Math.max(16, Math.round(baseFontSize * (15 / name.length)))
      : baseFontSize;

  // Dynamic spread (width of the text arc)
  const nameSpread = Math.min(180, Math.max(50, name.length * 10));

  // Top Text Radius
  const topRadius = (style === 'classic' || style === 'badge') ? size * 0.41 : size * 0.375;

  if (style === 'corporate') {
    // Corporate style has left/right decorative stars separating top & bottom lines
    ctx.font = '700 18px "Segoe UI", Helvetica, Arial, sans-serif';
    
    // Left Star (at 270°)
    const leftRad = (270 * Math.PI) / 180;
    ctx.save();
    ctx.translate(cx + size * 0.375 * Math.sin(leftRad), cy - size * 0.375 * Math.cos(leftRad));
    ctx.rotate(leftRad);
    ctx.fillText('★', 0, 0);
    ctx.restore();

    // Right Star (at 90°)
    const rightRad = (90 * Math.PI) / 180;
    ctx.save();
    ctx.translate(cx + size * 0.375 * Math.sin(rightRad), cy - size * 0.375 * Math.cos(rightRad));
    ctx.rotate(rightRad);
    ctx.fillText('★', 0, 0);
    ctx.restore();

    // Draw top text inside the corporate ring
    ctx.font = `700 ${nameFontSize}px "Segoe UI", Helvetica, Arial, sans-serif`;
    drawCircularText(ctx, name, size * 0.375, cx, cy, 0, Math.min(150, nameSpread));
  } else {
    ctx.font = `700 ${nameFontSize}px "Segoe UI", Helvetica, Arial, sans-serif`;
    drawCircularText(ctx, name, topRadius, cx, cy, 0, nameSpread);
  }

  // Setup Bottom Text (GSTIN + State)
  const statePart = input.state.toUpperCase().trim();
  const gstinPart = input.gstin.toUpperCase().trim();
  const bottomLine = `GSTIN ${gstinPart}  •  ${statePart}`;
  const bBaseFontSize = style === 'modern' ? 16 : 18;
  
  const bFontSize = bottomLine.length > 32 
    ? Math.max(10, Math.round(bBaseFontSize * (28 / bottomLine.length))) 
    : bBaseFontSize;
  const bSpread = Math.min(180, Math.max(70, bottomLine.length * 6.5));
  const bottomRadius = (style === 'classic' || style === 'badge') ? size * 0.41 : size * 0.375;

  ctx.font = `600 ${bFontSize}px "Segoe UI", Helvetica, Arial, sans-serif`;
  if (style === 'corporate') {
    drawCircularText(ctx, bottomLine, size * 0.375, cx, cy, 180, Math.min(150, bSpread), true);
  } else {
    drawCircularText(ctx, bottomLine, bottomRadius, cx, cy, 180, bSpread, true);
  }

  // 3. Draw Center Content based on Chosen Style
  if (style === 'classic') {
    ctx.font = '800 42px "Segoe UI", Helvetica, Arial, sans-serif';
    ctx.fillText('★', cx, cy - (input.establishedYear ? 18 : 0));
    if (input.establishedYear) {
      ctx.font = '700 16px "Segoe UI", Helvetica, Arial, sans-serif';
      ctx.fillText(`EST. ${input.establishedYear}`, cx, cy + 22);
    }
  } else if (style === 'modern') {
    // Central clean monogram (first letter of business name)
    const initial = name ? name.charAt(0) : 'S';
    ctx.font = '800 80px "Segoe UI", Helvetica, Arial, sans-serif';
    ctx.fillText(initial, cx, cy - (input.establishedYear ? 14 : 0));
    
    if (input.establishedYear) {
      ctx.font = '600 14px "Segoe UI", Helvetica, Arial, sans-serif';
      ctx.fillText(`ESTD ${input.establishedYear}`, cx, cy + 36);
    }
  } else if (style === 'badge') {
    // Beautiful vector 5-point star inside the badge
    drawCenterStar(ctx, cx, cy - (input.establishedYear ? 20 : 5), 24);
    
    ctx.font = '800 14px "Segoe UI", Helvetica, Arial, sans-serif';
    ctx.fillText('OFFICIAL', cx, cy + (input.establishedYear ? 16 : 22));
    if (input.establishedYear) {
      ctx.font = '600 12px "Segoe UI", Helvetica, Arial, sans-serif';
      ctx.fillText(`ESTD ${input.establishedYear}`, cx, cy + 34);
    }
  } else if (style === 'corporate') {
    // Traditional corporate monogram (first letters of words)
    const monogram = getInitials(name);
    ctx.font = 'italic 700 38px "Georgia", "Times New Roman", serif';
    ctx.fillText(monogram, cx, cy - (input.establishedYear ? 14 : 0));
    
    if (input.establishedYear) {
      ctx.font = '600 13px "Segoe UI", Helvetica, Arial, sans-serif';
      ctx.fillText(`ESTD ${input.establishedYear}`, cx, cy + 24);
    }
  }

  // 4. Slight hand-stamped ink texture overlay
  ctx.globalAlpha = 0.07;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.46, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  return canvas.toDataURL('image/png');
}
