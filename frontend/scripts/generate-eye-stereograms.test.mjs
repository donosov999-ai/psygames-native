import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { makeStereogram, WIDTH, HEIGHT, PERIOD, SHIFT } from './generate-eye-stereograms.mjs';

function pixels(png) {
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), WIDTH);
  assert.equal(png.readUInt32BE(20), HEIGHT);
  const idatLength = png.readUInt32BE(33);
  return inflateSync(png.subarray(41, 41 + idatLength));
}

function matchRate(raw, y, from, to, separation) {
  let matches = 0;
  for (let x = from; x < to; x++) {
    const p = y * (1 + WIDTH * 3) + 1 + x * 3;
    if (raw[p] === raw[p - separation * 3]) matches++;
  }
  return matches / (to - from);
}

test('deterministic valid PNG with depth disparity, not a visible silhouette', () => {
  const circle = makeStereogram('circle', 1234);
  assert.deepEqual(circle, makeStereogram('circle', 1234));
  assert.notDeepEqual(circle, makeStereogram('heart', 1234));
  const raw = pixels(circle);
  assert.equal(raw.length, HEIGHT * (1 + WIDTH * 3));
  assert.ok(matchRate(raw, Math.floor(HEIGHT / 2), 170, 250, PERIOD - SHIFT) > 0.95);
  assert.ok(matchRate(raw, 10, 170, 250, PERIOD) > 0.95);
});
