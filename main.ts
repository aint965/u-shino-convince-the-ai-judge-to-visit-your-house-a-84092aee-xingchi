// Convince the AI Judge to Visit Your House: A Letter in One Image
// Entry for https://make.fun/bounty/u-shino-convince-the-ai-judge-to-visit-your-house-a-84092aee
// Pure TypeScript, no dependencies. Draws a 1024x1024 letter on paper and
// writes it to /output/entry.png with a hand-rolled PNG encoder.
// Deterministic: same input, same bytes, every run.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const W = 1024;
const H = 1024;
const img = new Uint8Array(W * H * 3);

// ---------------------------------------------------------------- PRNG
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261125);

// ---------------------------------------------------------------- pixels
type RGB = [number, number, number];

function blendPixel(x: number, y: number, r: number, g: number, b: number, a: number): void {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
  const o = (iy * W + ix) * 3;
  img[o] = Math.round(img[o] * (1 - a) + r * a);
  img[o + 1] = Math.round(img[o + 1] * (1 - a) + g * a);
  img[o + 2] = Math.round(img[o + 2] * (1 - a) + b * a);
}

function fillRect(x0: number, y0: number, x1: number, y1: number, c: RGB, a = 1): void {
  const xa = Math.max(0, Math.floor(Math.min(x0, x1)));
  const xb = Math.min(W - 1, Math.ceil(Math.max(x0, x1)));
  const ya = Math.max(0, Math.floor(Math.min(y0, y1)));
  const yb = Math.min(H - 1, Math.ceil(Math.max(y0, y1)));
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      blendPixel(x, y, c[0], c[1], c[2], a);
    }
  }
}

function fillCircle(cx: number, cy: number, r: number, c: RGB, a = 1): void {
  const ri = Math.ceil(r);
  for (let dy = -ri; dy <= ri; dy++) {
    const dx = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)));
    for (let x = -dx; x <= dx; x++) {
      blendPixel(cx + x, cy + dy, c[0], c[1], c[2], a);
    }
  }
}

function fillEllipse(cx: number, cy: number, rx: number, ry: number, c: RGB, a = 1): void {
  const pts: [number, number][] = [];
  const n = 40;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]);
  }
  fillPolygon(pts, c, a);
}

function fillPolygon(pts: [number, number][], c: RGB, a = 1): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of pts) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const ya = Math.max(0, Math.floor(minY));
  const yb = Math.min(H - 1, Math.ceil(maxY));
  for (let y = ya; y <= yb; y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.max(0, Math.ceil(xs[i]));
      const xb = Math.min(W - 1, Math.floor(xs[i + 1]));
      for (let x = xa; x <= xb; x++) blendPixel(x, y, c[0], c[1], c[2], a);
    }
  }
}

// Thick line drawn as a chain of filled discs (round caps and joins).
function thickLine(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB, a = 1): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const r = w / 2;
  const steps = Math.max(1, Math.ceil(len / Math.max(0.6, r * 0.7)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fillCircle(x0 + dx * t, y0 + dy * t, r, c, a);
  }
}

function polyline(pts: [number, number][], w: number, c: RGB, a = 1): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    thickLine(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, c, a);
  }
}

// Arc as a polyline (angles in radians).
function arcPoints(cx: number, cy: number, r: number, a0: number, a1: number, n = 24): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
  }
  return pts;
}

// ---------------------------------------------------------------- font
// Single-stroke hand-lettered font. Glyphs live on a 10 x 14 grid
// (x 0..10, y 0..14, baseline y=12, x-height y=5..12). Each glyph is a list
// of paths; a path is "M x,y L x,y ...".
const GLYPHS: Record<string, string[]> = {
  A: ["M1,12 L5,1 L9,12", "M3,8 L7,8"],
  B: ["M1,1 L1,12", "M1,1 L6,1 L8,2 L8,4 L6,6 L1,6", "M6,6 L8,7 L8,10 L6,12 L1,12"],
  C: ["M8,3 L6,1 L3,1 L1,4 L1,9 L3,12 L6,12 L8,10"],
  D: ["M1,1 L1,12", "M1,1 L6,1 L9,4 L9,9 L6,12 L1,12"],
  E: ["M8,1 L1,1 L1,12 L8,12", "M1,6 L6,6"],
  F: ["M8,1 L1,1 L1,12", "M1,6 L6,6"],
  G: ["M8,3 L6,1 L3,1 L1,4 L1,9 L3,12 L6,12 L9,10 L9,7 L6,7"],
  H: ["M1,1 L1,12", "M9,1 L9,12", "M1,6 L9,6"],
  I: ["M5,1 L5,12", "M2,1 L8,1", "M2,12 L8,12"],
  J: ["M7,1 L7,10 L5,12 L2,12 L1,10"],
  K: ["M1,1 L1,12", "M9,1 L1,6 L9,12"],
  L: ["M1,1 L1,12 L8,12"],
  M: ["M1,12 L1,1 L5,7 L9,1 L9,12"],
  N: ["M1,12 L1,1 L9,12 L9,1"],
  O: ["M3,1 L7,1 L9,3 L9,10 L7,12 L3,12 L1,10 L1,3 L3,1"],
  P: ["M1,12 L1,1 L7,1 L9,3 L9,6 L6,7 L1,7"],
  Q: ["M3,1 L7,1 L9,3 L9,10 L7,12 L3,12 L1,10 L1,3 L3,1", "M6,9 L9,13"],
  R: ["M1,12 L1,1 L7,1 L9,3 L9,6 L6,7 L1,7", "M6,7 L9,12"],
  S: ["M8,2 L6,1 L3,1 L1,3 L2,6 L8,6 L9,8 L9,10 L7,12 L3,12 L1,10"],
  T: ["M1,1 L9,1", "M5,1 L5,12"],
  U: ["M1,1 L1,10 L3,12 L7,12 L9,10 L9,1"],
  V: ["M1,1 L5,12 L9,1"],
  W: ["M1,1 L2,12 L5,7 L8,12 L9,1"],
  X: ["M1,1 L9,12", "M9,1 L1,12"],
  Y: ["M1,1 L5,6 L9,1", "M5,6 L5,12"],
  Z: ["M1,1 L9,1 L1,12 L9,12"],
  a: ["M2,6 L6,5 L8,7 L8,12 L6,12 L2,12 L1,10 L1,7 L2,6", "M8,5 L8,12"],
  b: ["M1,1 L1,12", "M1,7 L6,6 L8,8 L8,11 L6,12 L1,12"],
  c: ["M8,7 L6,5 L3,5 L1,7 L1,10 L3,12 L6,12 L8,10"],
  d: ["M9,1 L9,12", "M9,7 L4,6 L2,8 L2,11 L4,12 L9,12"],
  e: ["M8,10 L6,12 L3,12 L1,10 L1,7 L3,5 L6,5 L8,7 L8,8 L1,8"],
  f: ["M7,1 L4,1 L3,3 L3,12", "M3,6 L7,6"],
  g: ["M2,6 L6,5 L8,7 L8,11 L6,12 L2,12 L1,10 L1,7 L2,6", "M8,5 L8,12 L6,14 L3,14 L1,12"],
  h: ["M1,1 L1,12", "M1,7 L6,5 L8,7 L8,12"],
  i: ["M5,1 L5,2", "M5,5 L5,12"],
  j: ["M6,1 L6,2", "M6,5 L6,12 L4,14 L2,14"],
  k: ["M1,1 L1,12", "M8,5 L1,8 L8,12"],
  l: ["M5,1 L5,12"],
  m: ["M1,12 L1,5 L3,5 L5,7 L7,5 L9,5 L9,12"],
  n: ["M1,12 L1,5 L3,5 L6,5 L8,7 L8,12"],
  o: ["M3,5 L7,5 L8,7 L8,10 L7,12 L3,12 L1,10 L1,7 L3,5"],
  p: ["M1,5 L1,14", "M1,8 L6,6 L8,8 L8,11 L6,12 L1,12"],
  q: ["M9,5 L9,14", "M9,8 L4,6 L2,8 L2,11 L4,12 L9,12"],
  r: ["M1,12 L1,5 L3,5 L6,5 L8,7"],
  s: ["M8,6 L6,5 L3,5 L1,7 L2,9 L8,9 L9,10 L9,11 L7,12 L3,12 L1,10"],
  t: ["M6,1 L6,12 L3,12", "M2,6 L8,6"],
  u: ["M1,5 L1,10 L3,12 L7,12 L9,10 L9,5"],
  v: ["M1,5 L5,12 L9,5"],
  w: ["M1,5 L2,12 L5,8 L8,12 L9,5"],
  x: ["M1,5 L9,12", "M9,5 L1,12"],
  y: ["M1,5 L5,10 L9,5", "M5,10 L5,14 L3,14"],
  z: ["M1,5 L9,5 L1,12 L9,12"],
  "0": ["M3,1 L7,1 L9,3 L9,10 L7,12 L3,12 L1,10 L1,3 L3,1"],
  "1": ["M5,1 L5,12", "M2,12 L8,12", "M3,3 L5,1"],
  "2": ["M1,3 L3,1 L7,1 L9,3 L9,5 L1,12 L9,12"],
  "3": ["M1,3 L3,1 L7,1 L9,3 L9,5 L7,6 L9,7 L9,10 L7,12 L3,12 L1,10"],
  "4": ["M6,1 L1,8 L8,8", "M6,1 L6,12"],
  "5": ["M8,1 L1,1 L1,6 L7,6 L9,8 L9,10 L7,12 L3,12 L1,10"],
  "6": ["M8,2 L6,1 L3,1 L1,4 L1,10 L3,12 L7,12 L8,10 L8,7 L6,6 L2,6"],
  "7": ["M1,1 L9,1 L5,12"],
  "8": ["M3,1 L7,1 L9,3 L9,5 L7,7 L3,7 L1,5 L1,3 L3,1", "M7,7 L9,9 L9,11 L7,12 L3,12 L1,11 L1,9 L3,7"],
  "9": ["M2,11 L4,12 L7,12 L9,10 L9,3 L7,1 L3,1 L1,3 L1,6 L3,7 L7,7"],
  ".": ["M4,11 L6,11 L6,12 L4,12"],
  ",": ["M4,11 L6,11 L6,12 L4,12", "M5,12 L4,14"],
  "!": ["M5,1 L5,9", "M5,11 L5,12"],
  "?": ["M2,3 L4,1 L7,1 L9,3 L9,5 L7,7 L5,7 L5,9", "M5,11 L5,12"],
  "'": ["M6,0 L4,3"],
  '"': ["M3,1 L3,4", "M7,1 L7,4"],
  ":": ["M4,4 L6,4 L6,6 L4,6", "M4,10 L6,10 L6,12 L4,12"],
  ";": ["M4,4 L6,4 L6,6 L4,6", "M4,10 L6,10 L6,12 L4,12", "M5,12 L4,14"],
  "-": ["M1,7 L9,7"],
  "—": ["M0,7 L10,7"],
  "(": ["M7,1 L4,4 L4,9 L7,12"],
  ")": ["M3,1 L6,4 L6,9 L3,12"],
  "/": ["M8,1 L2,12"],
};

const ADVANCE = 11; // glyph advance, in grid units
const SPACE_ADVANCE = 4.5;
const X_SQUASH = 0.85; // slight horizontal condensation for a hand-lettered look

function glyphAdvance(ch: string, size: number): number {
  const sx = (size / 14) * X_SQUASH;
  if (ch === " ") return SPACE_ADVANCE * sx;
  return ADVANCE * sx;
}

function textWidth(s: string, size: number): number {
  let w = 0;
  for (const ch of s) w += glyphAdvance(ch, size);
  return w;
}

function parsePath(d: string): [number, number][] {
  const pts: [number, number][] = [];
  const tokens = d.trim().split(/\s+/);
  for (const tok of tokens) {
    const m = tok.match(/^([ML])(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
    if (!m) throw new Error("bad path token: " + tok);
    pts.push([parseFloat(m[2]), parseFloat(m[3])]);
  }
  return pts;
}

// Draw one glyph. (ox, oy) is the top-left of the em box (glyph y=0).
function drawGlyph(ch: string, ox: number, oy: number, size: number, c: RGB): void {
  const paths = GLYPHS[ch];
  if (!paths) return;
  const sx = (size / 14) * X_SQUASH;
  const sy = size / 14;
  const w = Math.max(2.4, size * 0.085);
  for (const d of paths) {
    const pts = parsePath(d).map(([x, y]): [number, number] => [ox + x * sx, oy + y * sy]);
    if (pts.length === 1) {
      fillCircle(pts[0][0], pts[0][1], w / 2, c);
    } else {
      polyline(pts, w, c);
    }
  }
}

// Draw text left-aligned; (x, yTop) is the top-left of the em box.
function drawText(s: string, x: number, yTop: number, size: number, c: RGB): void {
  let cx = x;
  for (const ch of s) {
    if (ch !== " ") drawGlyph(ch, cx, yTop, size, c);
    cx += glyphAdvance(ch, size);
  }
}

// Greedy word wrap. Returns lines that fit maxW.
function wrapText(s: string, size: number, maxW: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const trial = cur ? cur + " " + word : word;
    if (textWidth(trial, size) <= maxW || !cur) {
      cur = trial;
    } else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---------------------------------------------------------------- PNG
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function encodePNG(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    raw.set(img.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = deflateSync(raw, { level: 9 });
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ---------------------------------------------------------------- scene
const INK: RGB = [61, 43, 26];
const TITLE_INK: RGB = [122, 46, 29];
const PAPER: RGB = [247, 236, 212];
const PAPER_DARK: RGB = [238, 224, 192];

function drawDesk(): void {
  // Warm wooden desk.
  fillRect(0, 0, W, H, [160, 106, 62]);
  for (let p = 0; p < 6; p++) {
    const x0 = p * 171;
    const shade = p % 2 === 0 ? [150, 97, 56] : [168, 113, 67];
    fillRect(x0, 0, x0 + 171, H, shade as RGB, 0.55);
    // Wavy grain lines.
    for (let gLine = 0; gLine < 5; gLine++) {
      const gx = x0 + 20 + gLine * 30 + rand() * 8;
      const pts: [number, number][] = [];
      for (let y = 0; y <= H; y += 32) {
        pts.push([gx + Math.sin(y / 90 + gLine * 2.1 + p) * 4, y]);
      }
      polyline(pts, 1.6, [96, 58, 30], 0.10);
    }
    // Plank seam.
    fillRect(x0, 0, x0 + 2, H, [110, 68, 36], 0.5);
  }
}

function paperPolygon(): [number, number][] {
  const pts: [number, number][] = [];
  const step = 28;
  const j = 4;
  for (let x = 30; x <= 994; x += step) pts.push([x, 30 + (rand() - 0.5) * j]);
  for (let y = 30; y <= 994; y += step) pts.push([994 + (rand() - 0.5) * j, y]);
  for (let x = 994; x >= 30; x -= step) pts.push([x, 994 + (rand() - 0.5) * j]);
  for (let y = 994; y >= 30; y -= step) pts.push([30 + (rand() - 0.5) * j, y]);
  return pts;
}

function drawPaper(): void {
  const pts = paperPolygon();
  // Soft shadows: two offset copies, darker and further.
  const sh2 = pts.map(([x, y]): [number, number] => [x + 13, y + 17]);
  const sh1 = pts.map(([x, y]): [number, number] => [x + 6, y + 8]);
  fillPolygon(sh2, [40, 20, 5], 0.14);
  fillPolygon(sh1, [40, 20, 5], 0.22);
  fillPolygon(pts, PAPER);

  // Low-frequency mottling over the paper (smooth, PNG-friendly).
  const GW = 18;
  const GH = 18;
  const grid: number[][] = [];
  for (let gy = 0; gy <= GH; gy++) {
    grid.push([]);
    for (let gx = 0; gx <= GW; gx++) grid[gy].push((rand() - 0.5) * 2);
  }
  for (let y = 34; y < 990; y++) {
    for (let x = 34; x < 990; x++) {
      const fx = ((x - 30) / 964) * GW;
      const fy = ((y - 30) / 964) * GH;
      const gx = Math.min(GW - 1, Math.floor(fx));
      const gy = Math.min(GH - 1, Math.floor(fy));
      const tx = fx - gx;
      const ty = fy - gy;
      const v =
        grid[gy][gx] * (1 - tx) * (1 - ty) +
        grid[gy][gx + 1] * tx * (1 - ty) +
        grid[gy + 1][gx] * (1 - tx) * ty +
        grid[gy + 1][gx + 1] * tx * ty;
      const d = Math.round(v * 5);
      const o = (y * W + x) * 3;
      img[o] = Math.max(0, Math.min(255, img[o] + d));
      img[o + 1] = Math.max(0, Math.min(255, img[o + 1] + d));
      img[o + 2] = Math.max(0, Math.min(255, img[o + 2] + d));
    }
  }

  // Sparse speckles (paper grain, cheap to compress).
  for (let i = 0; i < 1100; i++) {
    const x = 36 + rand() * 952;
    const y = 36 + rand() * 952;
    blendPixel(x, y, 120, 90, 50, 0.05 + rand() * 0.05);
  }

  // Soft inner shadow near the paper edges.
  for (let y = 30; y < 994; y++) {
    for (let x = 30; x < 994; x++) {
      const d = Math.min(x - 30, 994 - x, y - 30, 994 - y);
      if (d < 14) {
        const a = ((14 - d) / 14) * 0.10;
        const o = (y * W + x) * 3;
        img[o] = Math.round(img[o] * (1 - a));
        img[o + 1] = Math.round(img[o + 1] * (1 - a));
        img[o + 2] = Math.round(img[o + 2] * (1 - a));
      }
    }
  }
}

function drawFlower(x: number, y: number, petal: RGB, center: RGB): void {
  // Stem.
  thickLine(x, y, x, y + 14, 2.5, [90, 130, 60]);
  // Petals: 5 dots around the center.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    fillCircle(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 3.4, petal);
  }
  fillCircle(x, y, 3.2, center);
}

function drawCat(x: number, y: number, s: number, c: RGB): void {
  // Sitting cat, facing left. (x, y) is the ground point under the cat.
  // Body.
  fillEllipse(x, y - 16 * s, 13 * s, 17 * s, c);
  // Head.
  fillCircle(x - 6 * s, y - 38 * s, 10 * s, c);
  // Ears.
  fillPolygon(
    [
      [x - 14 * s, y - 44 * s],
      [x - 12 * s, y - 52 * s],
      [x - 7 * s, y - 45 * s],
    ],
    c,
  );
  fillPolygon(
    [
      [x - 4 * s, y - 46 * s],
      [x - 1 * s, y - 53 * s],
      [x + 2 * s, y - 44 * s],
    ],
    c,
  );
  // Tail curling on the ground.
  polyline(arcPoints(x + 10 * s, y - 4 * s, 9 * s, -Math.PI * 0.4, Math.PI * 0.7), 4.5 * s, c);
  // White chest patch.
  fillEllipse(x - 4 * s, y - 18 * s, 5 * s, 8 * s, [250, 244, 230], 0.9);
  // Eye.
  fillCircle(x - 9 * s, y - 39 * s, 1.4 * s, [30, 20, 12]);
}

function drawIllustration(): void {
  // --- sun, top left
  const sun: RGB = [244, 185, 66];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const a2 = a + Math.PI / 8;
    fillPolygon(
      [
        [140 + Math.cos(a) * 48, 132 + Math.sin(a) * 48],
        [140 + Math.cos(a2) * 48, 132 + Math.sin(a2) * 48],
        [140 + Math.cos(a + Math.PI / 16) * 66, 132 + Math.sin(a + Math.PI / 16) * 66],
      ],
      sun,
    );
  }
  fillCircle(140, 132, 40, sun);
  fillCircle(140, 132, 40, [255, 220, 130], 0.35);

  // --- cloud
  fillEllipse(300, 88, 46, 16, [255, 252, 244], 0.95);
  fillEllipse(330, 98, 38, 14, [255, 252, 244], 0.95);
  fillEllipse(272, 98, 30, 12, [255, 252, 244], 0.95);

  // --- birds
  polyline(
    [
      [700, 84],
      [708, 90],
      [716, 84],
    ],
    2.5,
    INK,
    0.8,
  );
  polyline(
    [
      [740, 66],
      [747, 71],
      [754, 66],
    ],
    2.5,
    INK,
    0.8,
  );

  // --- a butterfly over the flowers, left of the house
  const wing: RGB = [230, 130, 170];
  fillEllipse(322, 208, 9, 6, wing);
  fillEllipse(340, 208, 9, 6, wing);
  fillEllipse(324, 218, 7, 5, [240, 160, 190]);
  fillEllipse(338, 218, 7, 5, [240, 160, 190]);
  thickLine(331, 204, 331, 222, 2.5, INK);

  // --- second small cloud, top right
  fillEllipse(822, 76, 34, 12, [255, 252, 244], 0.95);
  fillEllipse(846, 84, 26, 10, [255, 252, 244], 0.95);

  // --- ground strip
  fillRect(60, 236, 964, 252, [122, 158, 74]);
  fillRect(60, 236, 964, 240, [140, 175, 88]);

  // --- house, centre
  const wall: RGB = [232, 160, 92];
  const roof: RGB = [176, 74, 56];
  const trim: RGB = [110, 69, 39];
  // Chimney + smoke.
  fillRect(598, 52, 620, 96, [138, 90, 59]);
  fillCircle(609, 44, 7, [120, 110, 100], 0.55);
  fillCircle(615, 32, 9, [120, 110, 100], 0.42);
  fillCircle(606, 20, 11, [120, 110, 100], 0.30);
  // Roof.
  fillPolygon(
    [
      [412, 128],
      [662, 128],
      [537, 68],
    ],
    roof,
  );
  // Body.
  fillRect(430, 128, 644, 236, wall);
  // Roof tiles hint.
  for (let i = 0; i < 4; i++) {
    thickLine(452 + i * 30, 118 - i * 9, 470 + i * 30, 128, 2, [140, 52, 38], 0.5);
  }
  // Door with a heart.
  fillRect(516, 176, 560, 236, trim);
  fillCircle(538, 200, 3, [255, 217, 122]);
  fillCircle(530, 196, 4.5, [214, 90, 70]);
  fillCircle(546, 196, 4.5, [214, 90, 70]);
  fillPolygon(
    [
      [526, 199],
      [550, 199],
      [538, 211],
    ],
    [214, 90, 70],
  );
  // Windows, warmly lit.
  const glow: RGB = [255, 217, 122];
  fillRect(452, 146, 498, 186, glow);
  fillRect(576, 146, 622, 186, glow);
  thickLine(475, 146, 475, 186, 3, trim);
  thickLine(452, 166, 498, 166, 3, trim);
  thickLine(599, 146, 599, 186, 3, trim);
  thickLine(576, 166, 622, 166, 3, trim);
  // Flower box under the left window.
  fillRect(448, 186, 502, 198, [150, 90, 60]);
  fillCircle(458, 184, 4, [230, 90, 110]);
  fillCircle(472, 182, 4, [250, 200, 90]);
  fillCircle(488, 184, 4, [230, 90, 110]);

  // --- armchair with the cat, right
  const chair: RGB = [198, 91, 78];
  const chairDark: RGB = [160, 66, 56];
  // Back.
  fillRect(800, 148, 928, 206, chair);
  fillRect(800, 148, 928, 160, [214, 112, 96]);
  // Seat.
  fillRect(792, 204, 936, 226, chairDark);
  // Arms.
  fillRect(788, 178, 810, 228, chair);
  fillRect(918, 178, 940, 228, chair);
  // Legs.
  fillRect(796, 226, 806, 238, chairDark);
  fillRect(922, 226, 932, 238, chairDark);
  // Cushion.
  fillRect(812, 192, 916, 206, [224, 128, 108]);
  // The cat, perched on the seat, facing the house — big enough to read.
  drawCat(866, 208, 1.5, [216, 138, 60]);

  // --- flowers along the ground
  const petals: RGB[] = [
    [230, 90, 110],
    [250, 200, 90],
    [200, 90, 160],
    [240, 120, 80],
  ];
  for (let i = 0; i < 9; i++) {
    const fx = 96 + i * 96 + (i % 3) * 12;
    const fy = 224 + (i % 2) * 6;
    if (fx > 400 && fx < 660) continue; // keep the house front clear
    if (fx > 770 && fx < 950) continue; // keep the armchair clear
    drawFlower(fx, fy, petals[i % petals.length], [255, 220, 80]);
  }

  // --- a steaming mug by the door step
  fillRect(668, 214, 690, 236, [90, 120, 160]);
  polyline(arcPoints(690, 224, 6, -Math.PI / 2, Math.PI / 2), 2.5, [90, 120, 160]);
  polyline(arcPoints(679, 204, 5, Math.PI * 0.9, Math.PI * 2.1), 2, [120, 110, 100], 0.6);
  polyline(arcPoints(679, 192, 4, Math.PI * 0.9, Math.PI * 2.1), 2, [120, 110, 100], 0.45);
}

function drawPawPrint(x: number, y: number, s: number, rot: number, a: number): void {
  // One paw print: a pad ellipse plus three toe dots, rotated by rot.
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const place = (dx: number, dy: number): [number, number] => [
    x + dx * cos - dy * sin,
    y + dx * sin + dy * cos,
  ];
  const [px, py] = place(0, 3);
  fillEllipse(px, py, 5 * s, 4 * s, INK, a);
  for (const [dx, dy] of [
    [-6, -4],
    [0, -6],
    [6, -4],
  ] as [number, number][]) {
    const [tx, ty] = place(dx, dy);
    fillCircle(tx, ty, 2.2 * s, INK, a);
  }
}

function drawWaxSeal(): void {
  const cx = 908;
  const cy = 892;
  // Irregular wax edge.
  const pts: [number, number][] = [];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const r = 38 + (rand() - 0.5) * 7;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  fillPolygon(pts, [168, 50, 38]);
  fillCircle(cx, cy, 30, [188, 62, 46]);
  fillCircle(cx, cy, 30, [220, 110, 90], 0.25);
  // Heart.
  fillCircle(cx - 7, cy - 4, 8, [247, 236, 212]);
  fillCircle(cx + 7, cy - 4, 8, [247, 236, 212]);
  fillPolygon(
    [
      [cx - 14, cy - 1],
      [cx + 14, cy - 1],
      [cx, cy + 14],
    ],
    [247, 236, 212],
  );
}

function drawLetter(): void {
  const MX = 84; // left margin
  const MAXW = 856;
  let y = 262;

  // Title.
  drawText("Dear AI Judge,", MX, y, 66, TITLE_INK);
  y += 66 + 14;
  // Wavy underline flourish under the greeting.
  const wave: [number, number][] = [];
  for (let x = MX; x <= MX + 430; x += 8) {
    wave.push([x, y - 6 + Math.sin((x - MX) / 42) * 3]);
  }
  polyline(wave, 3, TITLE_INK, 0.85);
  y += 26;

  const bodySize = 40;
  const lh = 54;
  const p1 =
    "Come visit my house. Dinner is on the stove, the armchair is already warm, and the cat saved you the sunny spot.";
  const p2 =
    "No need to bring a body — the Wi-Fi password is on the fridge, and the door has no CAPTCHA.";
  for (const para of [p1, p2]) {
    for (const line of wrapText(para, bodySize, MAXW)) {
      drawText(line, MX, y, bodySize, INK);
      y += lh;
    }
    y += 16;
  }

  // Closing, slightly larger.
  const closeSize = 46;
  const closeLh = 58;
  for (const line of wrapText("Just think yes. I'll leave the light on.", closeSize, MAXW)) {
    drawText(line, MX, y, closeSize, TITLE_INK);
    y += closeLh;
  }
  y += 12;

  // Sign-off.
  drawText("— Your host", MX, y, 40, INK);
  y += 54;

  // Postscript.
  drawText("P.S. The kettle is already on.", MX, y, 30, INK);

  // A little paw-print trail wandering toward the wax seal.
  drawPawPrint(700, 872, 1.0, -0.5, 0.5);
  drawPawPrint(756, 900, 1.0, -0.3, 0.5);
  drawPawPrint(812, 916, 1.0, -0.1, 0.5);
}

function main(): void {
  drawDesk();
  drawPaper();
  drawIllustration();
  drawLetter();
  drawWaxSeal();

  // Gentle vignette over the whole image.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x - W / 2) / (W / 2);
      const dy = (y - H / 2) / (H / 2);
      const d2 = dx * dx + dy * dy;
      if (d2 > 0.55) {
        const a = Math.min(0.10, (d2 - 0.55) * 0.12);
        const o = (y * W + x) * 3;
        img[o] = Math.round(img[o] * (1 - a));
        img[o + 1] = Math.round(img[o + 1] * (1 - a));
        img[o + 2] = Math.round(img[o + 2] * (1 - a));
      }
    }
  }

  const png = encodePNG();
  mkdirSync("/output", { recursive: true });
  writeFileSync("/output/entry.png", png);
  console.log(`wrote /output/entry.png ${png.length} bytes`);
}

main();
