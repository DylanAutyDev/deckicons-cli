import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createEffectGif } from "./effects";
import { findForegroundImages } from "./images";
import { uniqueSlugs } from "./naming";
import { renderIcon } from "./render";
import type {
  BackgroundChoice,
  GenerationResult,
  Settings,
  WrittenIcon,
} from "./types";

export type ProgressCallback = (
  completed: number,
  total: number,
  slug: string,
) => void;

export function resolveOutputDir(
  background: BackgroundChoice,
  fallback: string,
): string {
  if (background.kind === "image") {
    return path.join(path.dirname(background.path), "generated");
  }
  return fallback;
}

export async function generateIcons(
  settings: Settings,
  onProgress?: ProgressCallback,
): Promise<GenerationResult> {
  const images = findForegroundImages(
    settings.foregroundDir,
    settings.outputDir,
  );
  const jobs = uniqueSlugs(images);
  const written: WrittenIcon[] = [];
  const errors: GenerationResult["errors"] = [];

  mkdirSync(settings.outputDir, { recursive: true });

  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index]!;
    const pngPath = path.join(settings.outputDir, `${job.slug}.png`);

    try {
      const png = await renderIcon(job.file, {
        background: settings.background,
        padding: settings.padding,
        invert: settings.invert,
        opacity: settings.opacity,
      });
      writeFileSync(pngPath, png);

      const icon: WrittenIcon = { slug: job.slug, png: pngPath };
      const gifPath = path.join(settings.outputDir, `${job.slug}.gif`);

      if (settings.effects !== "none") {
        const gif = await createEffectGif(png, settings.effects);
        writeFileSync(gifPath, gif);
        icon.gif = gifPath;
      } else {
        rmSync(gifPath, { force: true });
      }

      written.push(icon);
    } catch (error) {
      errors.push({
        source: job.file,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    onProgress?.(index + 1, jobs.length, job.slug);
  }

  return { written, errors };
}
