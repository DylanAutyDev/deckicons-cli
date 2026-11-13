import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  buildEffectFrames,
  createEffectGif,
  EFFECT_FRAME_COUNT,
  encodeGif,
} from "../src/effects";
import type { AnimatedEffect } from "../src/types";

function patternedFrame(width: number, height: number): Buffer {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = (x * 16) % 256;
      data[offset + 1] = (y * 16) % 256;
      data[offset + 2] = ((x + y) * 8) % 256;
      data[offset + 3] = 255;
    }
  }
  return data;
}

test("builds a looping frame set with glitch bursts", () => {
  const width = 24;
  const height = 24;
  const base = patternedFrame(width, height);
  const frames = buildEffectFrames("glitch", base, width, height, () => 0.5);

  assert.equal(frames.length, EFFECT_FRAME_COUNT);
  frames.forEach((frame) => assert.equal(frame.length, base.length));
  assert.deepEqual(frames[0], base);
  assert.notDeepEqual(frames[4], base);
  assert.deepEqual(frames[2], base);
});

test("scanline, shimmer, and pulse effects animate", () => {
  const width = 24;
  const height = 24;
  const base = patternedFrame(width, height);
  const effects: AnimatedEffect[] = ["scanline", "shimmer", "pulse"];

  for (const effect of effects) {
    const frames = buildEffectFrames(effect, base, width, height);

    assert.equal(frames.length, EFFECT_FRAME_COUNT, effect);
    assert.deepEqual(frames[0], base, effect);
    assert.notDeepEqual(frames[10], base, effect);
  }
});

test("encodes all frames into an animated gif", async () => {
  const width = 24;
  const height = 24;
  const frames = buildEffectFrames(
    "glitch",
    patternedFrame(width, height),
    width,
    height,
    () => 0.25,
  );
  const gif = encodeGif(frames, width, height);

  assert.equal(gif.subarray(0, 3).toString("ascii"), "GIF");

  const meta = await sharp(gif, { animated: true }).metadata();
  assert.equal(meta.width, width);
  assert.equal(meta.pageHeight, height);
  assert.equal(meta.pages, frames.length);
});

test("createEffectGif supports every effect", async () => {
  const png = await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 3,
      background: { r: 80, g: 120, b: 200 },
    },
  })
    .png()
    .toBuffer();

  const effects: AnimatedEffect[] = [
    "glitch",
    "scanline",
    "shimmer",
    "pulse",
  ];

  for (const effect of effects) {
    const gif = await createEffectGif(png, effect);

    assert.equal(gif.subarray(0, 3).toString("ascii"), "GIF", effect);
    const meta = await sharp(gif, { animated: true }).metadata();
    assert.equal(meta.pages, EFFECT_FRAME_COUNT, effect);
  }
});
