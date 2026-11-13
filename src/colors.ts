import pc from "picocolors";
import type { RGB } from "./types";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function parseHex(input: string): RGB | null {
  let value = input.trim().replace(/^#/, "");

  if (value.length === 3) {
    value = value
      .split("")
      .map((char) => char + char)
      .join("");
  }

  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    return null;
  }

  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

export function rgbToHex(rgb: RGB): string {
  return `#${rgb
    .map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function lerpRgb(from: RGB, to: RGB, t: number): RGB {
  const amount = clamp(t, 0, 1);
  return [
    Math.round(from[0] + (to[0] - from[0]) * amount),
    Math.round(from[1] + (to[1] - from[1]) * amount),
    Math.round(from[2] + (to[2] - from[2]) * amount),
  ];
}

export function rgbToHsl(rgb: RGB): [number, number, number] {
  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;

  if (max === min) {
    return [0, 0, lightness];
  }

  const delta = max - min;
  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue: number;

  if (max === r) {
    hue = (g - b) / delta + (g < b ? 6 : 0);
  } else if (max === g) {
    hue = (b - r) / delta + 2;
  } else {
    hue = (r - g) / delta + 4;
  }

  return [hue * 60, saturation, lightness];
}

export function hslToRgb(hue: number, saturation: number, lightness: number): RGB {
  const h = ((hue % 360) + 360) % 360 / 360;
  const s = clamp(saturation, 0, 1);
  const l = clamp(lightness, 0, 1);

  if (s === 0) {
    const channel = Math.round(l * 255);
    return [channel, channel, channel];
  }

  const hueToChannel = (p: number, q: number, t: number): number => {
    let adjusted = t;
    if (adjusted < 0) adjusted += 1;
    if (adjusted > 1) adjusted -= 1;
    if (adjusted < 1 / 6) return p + (q - p) * 6 * adjusted;
    if (adjusted < 1 / 2) return q;
    if (adjusted < 2 / 3) return p + (q - p) * (2 / 3 - adjusted) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return [
    Math.round(hueToChannel(p, q, h + 1 / 3) * 255),
    Math.round(hueToChannel(p, q, h) * 255),
    Math.round(hueToChannel(p, q, h - 1 / 3) * 255),
  ];
}

export function darken(rgb: RGB, amount = 0.45): RGB {
  const [hue, saturation, lightness] = rgbToHsl(rgb);
  return hslToRgb(hue, saturation, lightness * amount);
}

export function randomColor(rng: () => number = Math.random): RGB {
  const hue = rng() * 360;
  const saturation = 0.55 + rng() * 0.3;
  const lightness = 0.45 + rng() * 0.15;
  return hslToRgb(hue, saturation, lightness);
}

export function generatedPalette(
  count: number,
  rng: () => number = Math.random,
): RGB[] {
  const size = Math.max(1, Math.floor(count));
  const offset = rng() * 360;
  const saturation = 0.55 + rng() * 0.15;
  const lightness = 0.45 + rng() * 0.12;

  return Array.from({ length: size }, (_, index) =>
    hslToRgb(offset + (index * 360) / size, saturation, lightness),
  );
}

export function gradientBuffer(
  size: number,
  top: RGB,
  bottom: RGB,
): Buffer {
  const buffer = Buffer.alloc(size * size * 3);

  for (let y = 0; y < size; y += 1) {
    const color = lerpRgb(top, bottom, size === 1 ? 0 : y / (size - 1));
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 3;
      buffer[offset] = color[0];
      buffer[offset + 1] = color[1];
      buffer[offset + 2] = color[2];
    }
  }

  return buffer;
}

export function swatch(rgb: RGB, width = 8): string {
  if (!pc.isColorSupported) {
    return "";
  }
  return `\u001b[48;2;${rgb[0]};${rgb[1]};${rgb[2]}m${" ".repeat(width)}\u001b[0m`;
}

export function gradientSwatch(top: RGB, bottom: RGB, width = 16): string {
  if (!pc.isColorSupported) {
    return "";
  }

  let output = "";
  for (let index = 0; index < width; index += 1) {
    const [r, g, b] = lerpRgb(top, bottom, width === 1 ? 0 : index / (width - 1));
    output += `\u001b[48;2;${r};${g};${b}m \u001b[0m`;
  }
  return output;
}
