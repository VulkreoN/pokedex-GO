/**
 * ♂ and ♀ drawn as strokes, centred on (cx, cy) in a box of `size`: PDF standard fonts cannot write them, and the
 * app font draws its own variant. Same geometry on a canvas and in a PDF.
 */
export interface Pen {
  circle(x: number, y: number, r: number): void;
  line(x1: number, y1: number, x2: number, y2: number): void;
}

export function drawGender(pen: Pen, g: 'm' | 'f', cx: number, cy: number, size: number) {
  const s = size;
  if (g === 'm') {
    const r = s * 0.27;
    const ox = cx - s * 0.12;
    const oy = cy + s * 0.12;
    const d = r / Math.SQRT2;
    const tx = cx + s * 0.4;
    const ty = cy - s * 0.4;
    pen.circle(ox, oy, r);
    pen.line(ox + d, oy - d, tx, ty);
    pen.line(tx, ty, tx - s * 0.24, ty);
    pen.line(tx, ty, tx, ty + s * 0.24);
  } else {
    const r = s * 0.26;
    const oy = cy - s * 0.17;
    pen.circle(cx, oy, r);
    pen.line(cx, oy + r, cx, cy + s * 0.47);
    pen.line(cx - s * 0.17, cy + s * 0.29, cx + s * 0.17, cy + s * 0.29);
  }
}

export function canvasPen(ctx: CanvasRenderingContext2D, color: string, width: number): Pen {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  return {
    circle(x, y, r) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    },
    line(x1, y1, x2, y2) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    },
  };
}
