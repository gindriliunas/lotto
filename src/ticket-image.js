import { PNG } from "pngjs";

const WIDTH = 720;
const HEIGHT = 400;
const GLYPHS = {
  " ": [0, 0, 0, 0, 0, 0, 0],
  0: [14, 17, 19, 21, 25, 17, 14],
  1: [4, 12, 4, 4, 4, 4, 14],
  2: [14, 17, 1, 6, 8, 16, 31],
  3: [30, 1, 1, 14, 1, 1, 30],
  4: [2, 6, 10, 18, 31, 2, 2],
  5: [31, 16, 30, 1, 1, 17, 14],
  6: [14, 16, 16, 30, 17, 17, 14],
  7: [31, 1, 2, 4, 8, 8, 8],
  8: [14, 17, 17, 14, 17, 17, 14],
  9: [14, 17, 17, 15, 1, 1, 14],
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 14],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [14, 17, 16, 14, 1, 17, 14],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 10, 10, 4],
  W: [17, 17, 17, 21, 21, 27, 17],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  "-": [0, 0, 0, 31, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 12, 12],
  ",": [0, 0, 0, 0, 6, 4, 8],
  ":": [0, 12, 12, 0, 12, 12, 0],
  "£": [7, 8, 16, 31, 16, 16, 15],
};

export function renderTicket(play) {
  const png = new PNG({ width: WIDTH, height: HEIGHT });
  fillRect(png, 0, 0, WIDTH, HEIGHT, [247, 241, 228]);
  fillRect(png, 0, 0, WIDTH, 72, [18, 53, 44]);
  fillRect(png, 0, 72, WIDTH, 8, [228, 183, 90]);

  drawText(png, "SCRATCH CARD", 36, 22, 3, [244, 239, 228]);
  drawText(png, `PLAY ${play.id}`, 36, 120, 2, [29, 25, 20]);
  drawText(png, prizeLine(play.prize_pence), 36, 180, 4, [18, 53, 44]);
  drawText(png, outcomeLine(play.outcome), 36, 280, 2, [29, 25, 20]);
  drawText(png, playedOn(play.created_at), 36, 330, 2, [29, 25, 20]);

  return PNG.sync.write(png);
}

function prizeLine(pence) {
  const amount = Number(pence);
  if (amount <= 0) return "NO WIN";
  return `£${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(amount / 100)}`;
}

function outcomeLine(outcome) {
  if (outcome === "jackpot") return "JACKPOT";
  if (outcome === "small") return "SMALL WIN";
  return "NO WIN";
}

function playedOn(value) {
  const date = value instanceof Date ? value : new Date(value);
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
  return formatted.toUpperCase();
}

function fillRect(png, x, y, width, height, [red, green, blue]) {
  const x0 = clamp(x, 0, png.width);
  const y0 = clamp(y, 0, png.height);
  const x1 = clamp(x + width, 0, png.width);
  const y1 = clamp(y + height, 0, png.height);
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      setPixel(png, px, py, red, green, blue);
    }
  }
}

function drawText(png, text, x, y, scale, color) {
  let cursor = x;
  for (const character of text.toUpperCase()) {
    const glyph = GLYPHS[character] ?? GLYPHS[" "];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        if ((glyph[row] & (1 << (4 - col))) === 0) continue;
        fillRect(png, cursor + col * scale, y + row * scale, scale, scale, color);
      }
    }
    cursor += 6 * scale;
  }
}

function setPixel(png, x, y, red, green, blue) {
  const index = (png.width * y + x) << 2;
  png.data[index] = red;
  png.data[index + 1] = green;
  png.data[index + 2] = blue;
  png.data[index + 3] = 255;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
