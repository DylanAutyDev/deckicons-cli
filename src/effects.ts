import gifenc from "gifenc";
import sharp from "sharp";
import { lerpRgb } from "./colors";
import type { AnimatedEffect, RGB } from "./types";

const { GIFEncoder, quantize, applyPalette } = gifenc;

export const EFFECT_FRAME_COUNT = 20;
export const EFFECT_FRAME_DELAY_MS = 90;
export const GLITCH_FRAME_INDICES = [4, 5, 13, 14] as const;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

function blend(
  frame: Buffer,
  offset: number,
  tint: RGB,
  alpha: number,
): void {
  if (alpha < 0.002) {
    return;
  }

  const inverse = 1 - alpha;
  frame[offset] = Math.round(frame[offset]! * inverse + tint[0] * alpha);
  frame[offset + 1] = Math.round(
    frame[offset + 1]! * inverse + tint[1] * alpha,
  );
  frame[offset + 2] = Math.round(
    frame[offset + 2]! * inverse + tint[2] * alpha,
  );
}

function glitchFrame(
  base: Buffer,
  width: number,
  height: number,
  rng: () => number,
): Buffer {
  const frame = Buffer.from(base);
  const maxBandHeight = Math.max(2, Math.round(height * 0.06));
  const bandCount = 2 + Math.floor(rng() * 3);

  for (let band = 0; band < bandCount; band += 1) {
    const top = Math.floor(rng() * height);
    const heightOfBand = Math.min(
      height - top,
      2 + Math.floor(rng() * maxBandHeight),
    );
    const shift = Math.round((rng() * 2 - 1) * width * 0.035);
    const split = rng() > 0.5 ? 2 : 1;

    for (let y = top; y < top + heightOfBand; y += 1) {
      const rowOffset = y * width * 4;

      for (let x = 0; x < width; x += 1) {
        const greenX = clamp(x - shift, 0, width - 1);
        const redX = clamp(greenX + split, 0, width - 1);
        const blueX = clamp(greenX - split, 0, width - 1);
        const target = rowOffset + x * 4;

        frame[target] = base[rowOffset + redX * 4]!;
        frame[target + 1] = base[rowOffset + greenX * 4 + 1]!;
        frame[target + 2] = base[rowOffset + blueX * 4 + 2]!;
        frame[target + 3] = base[rowOffset + x * 4 + 3]!;
      }
    }
  }

  return frame;
}

function buildGlitchFrames(
  base: Buffer,
  width: number,
  height: number,
  rng: () => number,
): Buffer[] {
  const glitchIndices = new Set<number>(GLITCH_FRAME_INDICES);
  const frames: Buffer[] = [];

  for (let index = 0; index < EFFECT_FRAME_COUNT; index += 1) {
    frames.push(
      glitchIndices.has(index)
        ? glitchFrame(base, width, height, rng)
        : Buffer.from(base),
    );
  }

  return frames;
}

function buildScanlineFrames(
  base: Buffer,
  width: number,
  height: number,
): Buffer[] {
  const sigma = Math.max(2, height * 0.055);
  const start = -sigma * 4;
  const end = height + sigma * 4;
  const frames: Buffer[] = [];

  for (let index = 0; index < EFFECT_FRAME_COUNT; index += 1) {
    const center =
      start + (index / (EFFECT_FRAME_COUNT - 1)) * (end - start);
    const frame = Buffer.from(base);

    for (let y = 0; y < height; y += 1) {
      const offset = y - center;
      const alpha = 0.18 * Math.exp(-(offset * offset) / (2 * sigma * sigma));

      if (alpha < 0.002) {
        continue;
      }

      const rowOffset = y * width * 4;
      for (let x = 0; x < width; x += 1) {
        blend(frame, rowOffset + x * 4, [255, 255, 255], alpha);
      }
    }

    frames.push(frame);
  }

  return frames;
}

function buildShimmerFrames(
  base: Buffer,
  width: number,
  height: number,
): Buffer[] {
  const sigma = 0.035;
  const start = -sigma * 4;
  const end = 1 + sigma * 4;
  const span = width + height * 0.65;
  const frames: Buffer[] = [];

  for (let index = 0; index < EFFECT_FRAME_COUNT; index += 1) {
    const center =
      start + (index / (EFFECT_FRAME_COUNT - 1)) * (end - start);
    const frame = Buffer.from(base);

    for (let y = 0; y < height; y += 1) {
      const rowOffset = y * width * 4;

      for (let x = 0; x < width; x += 1) {
        const position = (x + y * 0.65) / span;
        const distance = position - center;
        const alpha =
          0.14 *
          Math.exp(-(distance * distance) / (2 * sigma * sigma));

        if (alpha < 0.002) {
          continue;
        }

        const mix = clamp(distance / (sigma * 2) + 0.5, 0, 1);
        const tint = lerpRgb([70, 210, 255], [255, 70, 200], mix);
        blend(frame, rowOffset + x * 4, tint, alpha);
      }
    }

    frames.push(frame);
  }

  return frames;
}

function buildPulseFrames(
  base: Buffer,
  width: number,
  height: number,
): Buffer[] {
  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  const maxRadius = Math.hypot(
    Math.max(centerX, width - 1 - centerX),
    Math.max(centerY, height - 1 - centerY),
  );
  const frames: Buffer[] = [];

  for (let index = 0; index < EFFECT_FRAME_COUNT; index += 1) {
    const phase = (2 * Math.PI * index) / EFFECT_FRAME_COUNT;
    const intensity = (1 - Math.cos(phase)) / 2;
    const frame = Buffer.from(base);

    for (let y = 0; y < height; y += 1) {
      const rowOffset = y * width * 4;

      for (let x = 0; x < width; x += 1) {
        const radius = Math.hypot(x - centerX, y - centerY) / maxRadius;
        const glow = Math.exp(-(radius * radius) / (2 * 0.42 * 0.42));
        const alpha = 0.1 * intensity * glow;

        if (alpha < 0.002) {
          continue;
        }

        blend(frame, rowOffset + x * 4, [255, 246, 232], alpha);
      }
    }

    frames.push(frame);
  }

  return frames;
}

export function buildEffectFrames(
  effect: AnimatedEffect,
  base: Buffer,
  width: number,
  height: number,
  rng: () => number = Math.random,
): Buffer[] {
  switch (effect) {
    case "glitch":
      return buildGlitchFrames(base, width, height, rng);
    case "scanline":
      return buildScanlineFrames(base, width, height);
    case "shimmer":
      return buildShimmerFrames(base, width, height);
    case "pulse":
      return buildPulseFrames(base, width, height);
    default: {
      const unhandled: never = effect;
      throw new Error(`Unknown effect: ${String(unhandled)}`);
    }
  }
}

export function encodeGif(
  frames: Buffer[],
  width: number,
  height: number,
  delay = EFFECT_FRAME_DELAY_MS,
): Buffer {
  const encoder = GIFEncoder();
  const paletteFrame = frames[Math.floor(frames.length / 2)]!;
  const palette = quantize(new Uint8Array(paletteFrame), 256, {
    format: "rgb565",
  });

  frames.forEach((frame, index) => {
    const indexed = applyPalette(new Uint8Array(frame), palette, "rgb565");
    encoder.writeFrame(indexed, width, height, {
      palette,
      delay,
      repeat: index === 0 ? 0 : undefined,
    });
  });

  encoder.finish();
  return Buffer.from(encoder.bytes());
}

export async function createEffectGif(
  png: Buffer,
  effect: AnimatedEffect,
  rng: () => number = Math.random,
): Promise<Buffer> {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const frames = buildEffectFrames(
    effect,
    data,
    info.width,
    info.height,
    rng,
  );
  return encodeGif(frames, info.width, info.height);
}
