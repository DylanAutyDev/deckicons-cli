import sharp from "sharp";
import { darken, gradientBuffer } from "./colors";
import { alphaBounds, applyOpacityRgba, invertRgba } from "./images";
import {
  CANVAS_SIZE,
  type RenderBackground,
  type RGB,
} from "./types";

export interface RenderOptions {
  background: RenderBackground;
  padding: number;
  invert: boolean;
  opacity?: number;
  size?: number;
}

const SVG_DENSITY = 600;
const MAX_SOURCE_SCALE = 4;

function backgroundTopColor(background: RenderBackground): RGB {
  if (background.kind === "image") {
    return [0, 0, 0];
  }
  return background.gradient ? darken(background.color) : background.color;
}

export async function createCanvas(
  background: RenderBackground,
  size = CANVAS_SIZE,
): Promise<Buffer> {
  if (background.kind === "image") {
    let pipeline = sharp(background.path, { density: 384 })
      .rotate()
      .resize(size, size, { fit: "cover", position: "centre", kernel: "lanczos3" });

    if (background.hue !== 0) {
      pipeline = pipeline.modulate({ hue: background.hue });
    }

    return pipeline
      .flatten({ background: { r: 0, g: 0, b: 0 } })
      .removeAlpha()
      .png()
      .toBuffer();
  }

  const top = backgroundTopColor(background);
  const bottom = background.color;
  const raw = gradientBuffer(size, top, bottom);

  return sharp(raw, {
    raw: { width: size, height: size, channels: 3 },
  })
    .png()
    .toBuffer();
}

export async function renderIcon(
  foregroundPath: string,
  options: RenderOptions,
): Promise<Buffer> {
  const size = options.size ?? CANVAS_SIZE;
  const paddingPx = Math.round((size * options.padding) / 100);
  const innerSize = Math.max(1, size - paddingPx * 2);

  let pipeline = sharp(foregroundPath, { density: SVG_DENSITY })
    .rotate()
    .resize({
      width: size * MAX_SOURCE_SCALE,
      height: size * MAX_SOURCE_SCALE,
      fit: "inside",
      withoutEnlargement: true,
      kernel: "lanczos3",
    })
    .ensureAlpha();

  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });

  const bounds = alphaBounds(data, info.width, info.height);
  if (!bounds) {
    throw new Error("icon is fully transparent");
  }

  if (options.invert) {
    invertRgba(data);
  }

  const opacity = Math.min(100, Math.max(0, options.opacity ?? 100)) / 100;
  if (opacity < 1) {
    applyOpacityRgba(data, opacity);
  }

  const cropped = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .extract(bounds)
    .png()
    .toBuffer();

  const foreground = await sharp(cropped)
    .resize(innerSize, innerSize, {
      fit: "contain",
      kernel: "lanczos3",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const canvas = await createCanvas(options.background, size);

  return sharp(canvas)
    .composite([{ input: foreground, gravity: "centre" }])
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();
}
