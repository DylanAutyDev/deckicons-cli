import { readdirSync } from "node:fs";
import path from "node:path";

export const SUPPORTED_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif",
  ".svg",
  ".gif",
]);

export interface Bounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function isSupportedImage(file: string): boolean {
  return SUPPORTED_EXTENSIONS.has(path.extname(file).toLowerCase());
}

export function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function isPathInside(file: string, directory: string): boolean {
  const relative = path.relative(
    path.resolve(directory),
    path.resolve(file),
  );

  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

export function findForegroundImages(
  directory: string,
  outputDir?: string,
): string[] {
  const images = findImages(directory);

  return outputDir
    ? images.filter((image) => !isPathInside(image, outputDir))
    : images;
}

export function findImages(directory: string): string[] {
  const found: string[] = [];

  const walk = (current: string): void => {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && isSupportedImage(entry.name)) {
        found.push(fullPath);
      }
    }
  };

  walk(directory);

  return found.sort((left, right) =>
    path
      .basename(left)
      .toLowerCase()
      .localeCompare(path.basename(right).toLowerCase()),
  );
}

export function alphaBounds(
  data: Buffer,
  width: number,
  height: number,
  threshold = 8,
): Bounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3] ?? 0;
      if (alpha > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX === -1 || maxY === -1) {
    return null;
  }

  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

export function invertRgba(data: Buffer): void {
  for (let index = 0; index < data.length; index += 4) {
    data[index] = 255 - data[index]!;
    data[index + 1] = 255 - data[index + 1]!;
    data[index + 2] = 255 - data[index + 2]!;
  }
}

export function applyOpacityRgba(data: Buffer, opacity: number): void {
  const factor = Math.min(1, Math.max(0, opacity));

  for (let index = 3; index < data.length; index += 4) {
    data[index] = Math.round(data[index]! * factor);
  }
}
