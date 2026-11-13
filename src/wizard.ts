import { spawn } from "node:child_process";
import { existsSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  note,
  select,
  text,
} from "@clack/prompts";
import {
  darken,
  generatedPalette,
  gradientSwatch,
  parseHex,
  randomColor,
  rgbToHex,
  swatch,
} from "./colors";
import { backgroundForIndex, resolveOutputDir } from "./generate";
import {
  findForegroundImages,
  isSupportedImage,
  stripQuotes,
} from "./images";
import { renderIcon } from "./render";
import {
  CANVAS_SIZE,
  type BackgroundChoice,
  type EffectChoice,
  type RGB,
  type Settings,
} from "./types";

type BackgroundMode = "image" | "color" | "random" | "palette";
type ConfirmAction = "run" | "preview" | "edit" | "cancel";
type EditStep =
  | "background"
  | "foreground"
  | "padding"
  | "opacity"
  | "invert"
  | "effects"
  | "back";

const EFFECT_LABELS: Record<EffectChoice, string> = {
  none: "none",
  glitch: "subtle glitch",
  scanline: "scanline sweep",
  shimmer: "holo shimmer",
  pulse: "pulse glow",
};

function expect<T>(value: T): NonNullable<Exclude<T, symbol>> {
  if (isCancel(value)) {
    cancel("Cancelled. No icons were generated.");
    process.exit(0);
  }
  return value as NonNullable<Exclude<T, symbol>>;
}

function validateDirectory(
  input: string,
  background: BackgroundChoice,
): string | undefined {
  const value = stripQuotes(input);
  if (!value) {
    return "Enter the path to a folder.";
  }

  const resolved = path.resolve(value);
  if (!existsSync(resolved)) {
    return "That folder does not exist.";
  }
  if (!statSync(resolved).isDirectory()) {
    return "That path is not a folder.";
  }

  const outputDir = resolveOutputDir(background, resolved);
  if (findForegroundImages(resolved, outputDir).length === 0) {
    return "No supported images found in that folder.";
  }

  return undefined;
}

function validateBackgroundImage(input: string): string | undefined {
  const value = stripQuotes(input);
  if (!value) {
    return "Enter the path to an image.";
  }

  const resolved = path.resolve(value);
  if (!existsSync(resolved)) {
    return "That image does not exist.";
  }
  if (!statSync(resolved).isFile()) {
    return "That path is not a file.";
  }
  if (!isSupportedImage(resolved)) {
    return "Use a PNG, JPG, WebP, AVIF, SVG, or GIF image.";
  }

  return undefined;
}

function openFile(file: string): void {
  const command =
    process.platform === "win32"
      ? { name: "cmd", args: ["/c", "start", "", file] }
      : process.platform === "darwin"
        ? { name: "open", args: [file] }
        : { name: "xdg-open", args: [file] };

  const child = spawn(command.name, command.args, {
    detached: true,
    stdio: "ignore",
  });
  child.on("error", () => undefined);
  child.unref();
}

async function previewFirstIcon(settings: Settings): Promise<void> {
  const [first] = findForegroundImages(
    settings.foregroundDir,
    settings.outputDir,
  );

  if (!first) {
    log.warn("No images found to preview.");
    return;
  }

  try {
    const png = await renderIcon(first, {
      background: backgroundForIndex(settings.background, 0),
      padding: settings.padding,
      invert: settings.invert,
      opacity: settings.opacity,
    });
    const file = path.join(
      tmpdir(),
      `deckicons-preview-${path.basename(first, path.extname(first))}.png`,
    );
    writeFileSync(file, png);
    openFile(file);
    log.success(`Preview opened as a PNG: ${file}`);
  } catch (error) {
    log.error(
      `Could not build a preview: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function palettePreview(colors: RGB[], max = 24): string {
  const shown = colors
    .slice(0, max)
    .map((color) => swatch(color, 2))
    .join("");
  const extra = colors.length > max ? ` +${colors.length - max}` : "";
  const fallback = colors.map((color) => rgbToHex(color)).join(" ");

  return `${shown || fallback}${extra}`;
}

function describeBackground(background: BackgroundChoice): string {
  if (background.kind === "image") {
    const hue = background.hue !== 0 ? ` · hue ${background.hue}°` : "";
    return `image · ${background.path}${hue}`;
  }

  if (background.kind === "palette") {
    const gradient = background.gradient ? " · gradient" : "";
    return `palette ${palettePreview(background.colors)} · ${background.colors.length} color${background.colors.length === 1 ? "" : "s"}${gradient}`;
  }

  const hex = rgbToHex(background.color);
  const gradient = background.gradient
    ? ` · gradient ${gradientSwatch(darken(background.color), background.color)}`
    : "";
  return `${swatch(background.color)} ${hex}${gradient}`;
}

function summaryText(settings: Settings, iconCount: number): string {
  const paddingPx = Math.round((CANVAS_SIZE * settings.padding) / 100);

  return [
    `Foreground   ${settings.foregroundDir}`,
    `Icons        ${iconCount}`,
    `Background   ${describeBackground(settings.background)}`,
    `Canvas       ${CANVAS_SIZE} × ${CANVAS_SIZE}`,
    `Padding      ${settings.padding}% (${paddingPx}px per side)`,
    `Opacity      ${settings.opacity}%`,
    `Invert       ${settings.invert ? "yes" : "no"}`,
    `Effects      ${settings.effects === "none" ? "none" : `${EFFECT_LABELS[settings.effects]} (.gif)`}`,
    `Output       ${settings.outputDir}`,
  ].join("\n");
}

async function askGradient(initialValue: boolean): Promise<boolean> {
  return expect(
    await confirm({
      message: "Add a vertical gradient? (dark top, brighter bottom)",
      initialValue,
    }),
  );
}

async function askBackground(
  current?: BackgroundChoice,
): Promise<BackgroundChoice> {
  const mode = expect(
    await select<BackgroundMode>({
      message: "Background style",
      initialValue: current?.kind ?? "image",
      options: [
        { value: "image", label: "Image", hint: "use a background picture" },
        { value: "color", label: "Solid color", hint: "enter a hex value" },
        { value: "random", label: "Random color", hint: "roll a color for me" },
        {
          value: "palette",
          label: "Palette",
          hint: "a different color for every icon",
        },
      ],
    }),
  );

  if (mode === "image") {
    const imageInput = expect(
      await text({
        message: "Path to background image",
        initialValue: current?.kind === "image" ? current.path : undefined,
        validate: (value) => validateBackgroundImage(value ?? ""),
      }),
    );
    const hueDefault = current?.kind === "image" ? current.hue : 0;
    const hueInput = expect(
      await text({
        message: "Background hue rotation (degrees)",
        placeholder: "0",
        defaultValue: String(hueDefault),
        initialValue: String(hueDefault),
        validate: (value) => {
          const parsed = Number(value ?? "");
          if (!Number.isInteger(parsed) || parsed < 0 || parsed > 360) {
            return "Pick a whole number from 0 to 360.";
          }
          return undefined;
        },
      }),
    );
    const hue = Number(hueInput);

    if (hue !== 0) {
      log.info(`Background hue rotated ${hue}°.`);
    }

    return {
      kind: "image",
      path: path.resolve(stripQuotes(imageInput)),
      hue,
    };
  }

  const gradientDefault =
    current && current.kind !== "image" ? current.gradient : false;

  if (mode === "palette") {
    return {
      kind: "palette",
      colors: [],
      gradient: await askGradient(gradientDefault),
    };
  }

  let color: RGB | null = null;

  if (mode === "color") {
    const hexInput = expect(
      await text({
        message: "Background color (hex)",
        placeholder: "e.g. #5865F2",
        initialValue:
          current?.kind === "color" ? rgbToHex(current.color) : undefined,
        validate: (value) =>
          value && parseHex(value)
            ? undefined
            : "Use a hex color like #5865F2.",
      }),
    );
    color = parseHex(hexInput)!;
  } else {
    let rolled = randomColor();
    log.info(`Rolled ${swatch(rolled)} ${rgbToHex(rolled)}`);

    let locked = false;
    while (!locked) {
      const action = expect(
        await select<"lock" | "reroll">({
          message: "Keep this color?",
          initialValue: "lock",
          options: [
            { value: "lock", label: "Lock it in", hint: rgbToHex(rolled) },
            { value: "reroll", label: "Reroll", hint: "try another color" },
          ],
        }),
      );

      if (action === "lock") {
        locked = true;
      } else {
        rolled = randomColor();
        log.info(`Rolled ${swatch(rolled)} ${rgbToHex(rolled)}`);
      }
    }

    color = rolled;
  }

  const gradient = await askGradient(gradientDefault);

  if (!color) {
    throw new Error("Background color is missing.");
  }

  if (gradient) {
    log.info(
      `Gradient ${gradientSwatch(darken(color), color)} ${rgbToHex(darken(color))} → ${rgbToHex(color)}`,
    );
  }

  return { kind: "color", color, gradient };
}

async function askForeground(
  background: BackgroundChoice,
  currentDir?: string,
): Promise<{ dir: string; images: string[] }> {
  const foregroundInput = expect(
    await text({
      message: "Foreground icons folder",
      initialValue: currentDir,
      validate: (value) => validateDirectory(value ?? "", background),
    }),
  );
  const dir = path.resolve(stripQuotes(foregroundInput));
  const outputDir = resolveOutputDir(background, dir);
  const images = findForegroundImages(dir, outputDir);
  log.info(
    `Found ${images.length} icon${images.length === 1 ? "" : "s"} to work with.`,
  );

  return { dir, images };
}

async function askPalette(
  count: number,
  gradient: boolean,
  seed?: RGB[],
): Promise<RGB[]> {
  const size = Math.max(1, count);
  let colors =
    seed && seed.length === size ? seed : generatedPalette(size);

  log.info(`Palette ${palettePreview(colors)}`);

  let locked = false;
  while (!locked) {
    const action = expect(
      await select<"lock" | "reroll">({
        message: `Colors for ${size} icon${size === 1 ? "" : "s"}`,
        initialValue: "lock",
        options: [
          {
            value: "lock",
            label: "Lock it in",
            hint: "assign colors in filename order",
          },
          {
            value: "reroll",
            label: "Reroll",
            hint: "roll a new palette",
          },
        ],
      }),
    );

    if (action === "lock") {
      locked = true;
    } else {
      colors = generatedPalette(size);
      log.info(`Palette ${palettePreview(colors)}`);
    }
  }

  if (gradient) {
    const first = colors[0]!;
    log.info(
      `Gradient ${gradientSwatch(darken(first), first)} applied to every palette color.`,
    );
  }

  return colors;
}

async function askPadding(current = 25): Promise<number> {
  const input = expect(
    await text({
      message: "Padding around icons (%)",
      placeholder: "25",
      defaultValue: String(current),
      initialValue: String(current),
      validate: (value) => {
        const parsed = Number(value ?? "");
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > 45) {
          return "Pick a whole number from 0 to 45.";
        }
        return undefined;
      },
    }),
  );
  const padding = Number(input);
  const paddingPx = Math.round((CANVAS_SIZE * padding) / 100);
  log.info(
    `Icons get ${paddingPx}px of breathing room per side on a ${CANVAS_SIZE}px canvas.`,
  );

  return padding;
}

async function askOpacity(current = 100): Promise<number> {
  const input = expect(
    await text({
      message: "Icon opacity (%)",
      placeholder: "100",
      defaultValue: String(current),
      initialValue: String(current),
      validate: (value) => {
        const parsed = Number(value ?? "");
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
          return "Pick a whole number from 0 to 100.";
        }
        return undefined;
      },
    }),
  );
  const opacity = Number(input);

  if (opacity < 100) {
    log.info(`Icons render at ${opacity}% opacity.`);
  }

  return opacity;
}

async function askInvert(current = false): Promise<boolean> {
  return expect(
    await confirm({
      message:
        "Invert the icon overlays? (great for dark logos on light backgrounds)",
      initialValue: current,
    }),
  );
}

async function askEffects(current: EffectChoice = "none"): Promise<EffectChoice> {
  return expect(
    await select<EffectChoice>({
      message: "Effects",
      initialValue: current,
      options: [
        { value: "none", label: "None", hint: "static PNG only" },
        {
          value: "glitch",
          label: "Subtle glitch",
          hint: "cyberpunk stutter, now slower",
        },
        {
          value: "scanline",
          label: "Scanline sweep",
          hint: "soft light bar drifts down",
        },
        {
          value: "shimmer",
          label: "Holo shimmer",
          hint: "diagonal iridescent sheen",
        },
        {
          value: "pulse",
          label: "Pulse glow",
          hint: "slow breathing light",
        },
      ],
    }),
  );
}

export async function runWizard(): Promise<Settings | null> {
  intro("New icon set");

  let background = await askBackground();
  let foreground = await askForeground(background);

  if (background.kind === "palette") {
    const colors = await askPalette(
      foreground.images.length,
      background.gradient,
    );
    background = { ...background, colors };
  }

  let padding = await askPadding();
  let opacity = await askOpacity();
  let invert = await askInvert();
  let effects = await askEffects();

  for (;;) {
    const outputDir = resolveOutputDir(background, foreground.dir);
    const settings: Settings = {
      foregroundDir: foreground.dir,
      background,
      padding,
      opacity,
      invert,
      effects,
      outputDir,
    };

    note(summaryText(settings, foreground.images.length), "Render settings");

    const action = expect(
      await select<ConfirmAction>({
        message: "Ready to render?",
        initialValue: "run",
        options: [
          { value: "run", label: "Run it", hint: "generate the icon set" },
          {
            value: "preview",
            label: "Preview first icon",
            hint: "opens a static PNG preview",
          },
          {
            value: "edit",
            label: "Change settings",
            hint: "go back to a previous step",
          },
          { value: "cancel", label: "Cancel", hint: "change nothing" },
        ],
      }),
    );

    if (action === "run") {
      return settings;
    }
    if (action === "cancel") {
      cancel("No icons were generated.");
      return null;
    }
    if (action === "preview") {
      await previewFirstIcon(settings);
      continue;
    }

    const step = expect(
      await select<EditStep>({
        message: "Which step?",
        initialValue: "back",
        options: [
          {
            value: "back",
            label: "Back to summary",
            hint: "keep everything as is",
          },
          {
            value: "background",
            label: "Background",
            hint: "style, color, hue, or gradient",
          },
          {
            value: "foreground",
            label: "Foreground folder",
            hint: "change the icon set",
          },
          {
            value: "padding",
            label: "Padding",
            hint: `${padding}%`,
          },
          {
            value: "opacity",
            label: "Opacity",
            hint: `${opacity}%`,
          },
          {
            value: "invert",
            label: "Invert",
            hint: invert ? "yes" : "no",
          },
          {
            value: "effects",
            label: "Effects",
            hint: EFFECT_LABELS[effects],
          },
        ],
      }),
    );

    if (step === "back") {
      continue;
    }

    if (step === "background") {
      const updated = await askBackground(background);

      if (updated.kind === "palette") {
        const colors = await askPalette(
          foreground.images.length,
          updated.gradient,
          background.kind === "palette" ? background.colors : undefined,
        );
        background = { ...updated, colors };
      } else {
        background = updated;
      }
    } else if (step === "foreground") {
      const updated = await askForeground(background, foreground.dir);
      foreground = updated;

      if (
        background.kind === "palette" &&
        background.colors.length !== foreground.images.length
      ) {
        log.warn("Icon count changed. Rolling a fresh palette.");
        const colors = await askPalette(
          foreground.images.length,
          background.gradient,
        );
        background = { ...background, colors };
      }
    } else if (step === "padding") {
      padding = await askPadding(padding);
    } else if (step === "opacity") {
      opacity = await askOpacity(opacity);
    } else if (step === "invert") {
      invert = await askInvert(invert);
    } else if (step === "effects") {
      effects = await askEffects(effects);
    }
  }
}
