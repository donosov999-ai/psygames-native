// Стереокартинки «Гимнастики для глаз» (задача a72e77a1): автор — Codex
// (ветка codex/eye-stereograms, c90ea3e4), перенесено вместе с картинками.
// Три портретных PNG 420×720 (`circle`, `heart`, `star`), детерминированно, без
// внешних изображений и лицензий. Запуск из корня: node frontend/scripts/generate-eye-stereograms.mjs
// Проба: node --test frontend/scripts/generate-eye-stereograms.test.mjs
// Не заявлять лечение, диагностику или улучшение зрения.
// Deterministic single-image random-dot stereograms. No network or asset service.
// Run: node scripts/generate-eye-stereograms.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const WIDTH = 420;
// Portrait canvas: enough rows to cover a phone screen without enlarging a
// landscape strip into a blurry or distorted field.
export const HEIGHT = 720;
export const PERIOD = 70;
export const SHIFT = 9;

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(name, data) {
  const type = Buffer.from(name, 'ascii');
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const check = Buffer.alloc(4);
  check.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([size, type, data, check]);
}

function inside(shape, x, y) {
  const u = (x - WIDTH / 2) / 116;
  const v = -(y - HEIGHT / 2 - 5) / 108;
  if (shape === 'circle') return u * u + v * v < 0.78;
  if (shape === 'heart') {
    const a = u * u + v * v - 0.72;
    return a * a * a - u * u * v * v * v < 0;
  }
  // Five-point star in polar coordinates, broad enough to survive dot noise.
  const angle = Math.atan2(v, u) + Math.PI / 2;
  const radius = Math.hypot(u, v);
  return radius < 0.64 + 0.21 * Math.cos(5 * angle);
}

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

export function makeStereogram(shape, seed) {
  if (!['circle', 'heart', 'star'].includes(shape)) throw new Error(`Unknown shape: ${shape}`);
  const next = random(seed);
  const raw = Buffer.alloc(HEIGHT * (1 + WIDTH * 3));
  for (let y = 0; y < HEIGHT; y++) {
    const row = y * (1 + WIDTH * 3);
    raw[row] = 0; // PNG filter None
    for (let x = 0; x < WIDTH; x++) {
      const p = row + 1 + x * 3;
      if (x >= PERIOD) {
        const separation = PERIOD - (inside(shape, x, y) ? SHIFT : 0);
        const source = p - separation * 3;
        raw[p] = raw[source]; raw[p + 1] = raw[source + 1]; raw[p + 2] = raw[source + 2];
      } else {
        const value = (next() & 1) ? 45 : 215;
        raw[p] = value; raw[p + 1] = value; raw[p + 2] = value;
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  // Картинки нужны нативному экрану «Гимнастики для глаз» (адрес /games/eye-gym
  // перехвачен Flutter): кладём прямо в его ассеты. Генератор — источник правды.
  const out = join(dirname(fileURLToPath(import.meta.url)), '../../flutter/assets/eye_stereograms');
  mkdirSync(out, { recursive: true });
  for (const [shape, seed] of [['circle', 0x9bd33a], ['heart', 0x8f32c1], ['star', 0xab2134]]) {
    writeFileSync(join(out, `${shape}.png`), makeStereogram(shape, seed));
  }
}
