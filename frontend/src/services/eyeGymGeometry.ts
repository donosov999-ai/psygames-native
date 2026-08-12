export interface EyeGymSize {
  width: number;
  height: number;
}

export interface EyeGymGeometry {
  boardW: number;
  boardH: number;
  cx: number;
  cy: number;
  RX: number;
  RY: number;
}

const FIELD_CHROME = 90; // инструкция + gaps + progress + вертикальные padding
const DOT_RADIUS = 15;   // самый большой tracking-dot = 30px
const EDGE_GAP = 16;

/**
 * Геометрия поля из ФАКТИЧЕСКОЙ области GameShell. Она уже исключает шапку,
 * stats, нижний toolbar и safe-area, поэтому точка не уходит под навигацию.
 */
export function eyeGymGeometry(viewport: EyeGymSize, field?: EyeGymSize | null): EyeGymGeometry {
  const fieldW = field?.width || Math.max(160, viewport.width - 32);
  const fieldH = field?.height || Math.max(178, viewport.height - 210);
  const boardW = Math.max(160, Math.min(viewport.width - 12, fieldW + 20));
  const boardH = Math.max(88, fieldH - FIELD_CHROME);
  const cx = boardW / 2;
  const cy = boardH / 2;
  const RX = Math.max(20, boardW / 2 - 24);
  const RY = Math.max(8, boardH / 2 - DOT_RADIUS - EDGE_GAP);
  return { boardW, boardH, cx, cy, RX, RY };
}
