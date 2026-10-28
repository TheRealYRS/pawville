/** A tiny 3×5 pixel font for in-world signs (crisp at any integer zoom). */
const GLYPHS: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111', '-': '000000111000000', '!': '010010010000010',
  ' ': '000000000000000',
};

export function pixelTextWidth(text: string, scale = 1): number {
  return text.length === 0 ? 0 : (text.length * 4 - 1) * scale;
}

export function drawPixelText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, scale = 1): void {
  ctx.fillStyle = color;
  let cx = Math.round(x);
  for (const ch of text.toUpperCase()) {
    const g = GLYPHS[ch] ?? GLYPHS[' '];
    for (let i = 0; i < 15; i++) if (g[i] === '1') ctx.fillRect(cx + (i % 3) * scale, Math.round(y) + Math.floor(i / 3) * scale, scale, scale);
    cx += 4 * scale;
  }
}

export function drawSignText(ctx: CanvasRenderingContext2D, text: string, centerX: number, y: number, color: string, shadow: string, scale = 1): void {
  const x = Math.round(centerX - pixelTextWidth(text, scale) / 2);
  drawPixelText(ctx, text, x, y + scale, shadow, scale);
  drawPixelText(ctx, text, x, y, color, scale);
}
