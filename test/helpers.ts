import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

export function tempDir(prefix = "deckicons-test-"): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

export function cleanup(directory: string): void {
  rmSync(directory, { recursive: true, force: true });
}

export async function pixelAt(
  png: Buffer,
  x: number,
  y: number,
): Promise<[number, number, number]> {
  const { data, info } = await sharp(png)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * info.channels;
  return [data[offset]!, data[offset + 1]!, data[offset + 2]!];
}
