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

const BAYER_8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

const DITHER_SPREAD = 24;
const DITHER_EDGE_LIMIT = 32;

function buildPaletteLookup(palette: number[][]): Uint8Array {
  const lookup = new Uint8Array(32 * 32 * 32);

  for (let r5 = 0; r5 < 32; r5 += 1) {
    for (let g5 = 0; g5 < 32; g5 += 1) {
      for (let b5 = 0; b5 < 32; b5 += 1) {
        const r = (r5 << 3) + 4;
        const g = (g5 << 3) + 4;
        const b = (b5 << 3) + 4;
        let bestIndex = 0;
        let bestDistance = Number.POSITIVE_INFINITY;

        for (let index = 0; index < palette.length; index += 1) {
          const entry = palette[index]!;
          const dr = entry[0]! - r;
          const dg = entry[1]! - g;
          const db = entry[2]! - b;
          const distance = dr * dr + dg * dg + db * db;

          if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = index;
          }
        }

        lookup[(r5 << 10) | (g5 << 5) | b5] = bestIndex;
      }
    }
  }

  return lookup;
}

function applyDithering(
  frame: Buffer,
  width: number,
  height: number,
  palette: number[][],
  lookup: Uint8Array,
): Uint8Array {
  const indexed = applyPalette(new Uint8Array(frame), palette, "rgb565");

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      let delta = 0;

      if (x > 0) {
        const left = offset - 4;
        delta += Math.abs(frame[offset]! - frame[left]!);
        delta += Math.abs(frame[offset + 1]! - frame[left + 1]!);
        delta += Math.abs(frame[offset + 2]! - frame[left + 2]!);
      }

      if (y > 0) {
        const above = offset - width * 4;
        delta += Math.abs(frame[offset]! - frame[above]!);
        delta += Math.abs(frame[offset + 1]! - frame[above + 1]!);
        delta += Math.abs(frame[offset + 2]! - frame[above + 2]!);
      }

      if (delta === 0 || delta > DITHER_EDGE_LIMIT) {
        continue;
      }

      const threshold =
        (((BAYER_8[y & 7]![x & 7]! + 0.5) / 64) - 0.5) * DITHER_SPREAD;

      const r =
        clamp(Math.round(frame[offset]! + threshold), 0, 255) >> 3;
      const g =
        clamp(Math.round(frame[offset + 1]! + threshold), 0, 255) >> 3;
      const b =
        clamp(Math.round(frame[offset + 2]! + threshold), 0, 255) >> 3;

      indexed[y * width + x] =
        lookup[(r << 10) | (g << 5) | b]!;
    }
  }

  return indexed;
}

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
  const lookup = buildPaletteLookup(palette);

  frames.forEach((frame, index) => {
    const indexed = applyDithering(frame, width, height, palette, lookup);
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
