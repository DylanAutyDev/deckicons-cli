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
  gradientSwatch,
  parseHex,
  randomColor,
  rgbToHex,
  swatch,
} from "./colors";
import { resolveOutputDir } from "./generate";
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

type BackgroundMode = "image" | "color" | "random";
type ConfirmAction = "run" | "preview" | "cancel";

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
  outputDir: string,
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
      background: settings.background,
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

function describeBackground(background: BackgroundChoice): string {
  if (background.kind === "image") {
    const hue = background.hue !== 0 ? ` · hue ${background.hue}°` : "";
    return `image · ${background.path}${hue}`;
  }

  const hex = rgbToHex(background.color);
  const gradient = background.gradient
    ? ` · gradient ${gradientSwatch(darken(background.color), background.color)}`
    : "";
  return `${swatch(background.color)} ${hex}${gradient}`;
}

export async function runWizard(
  fallbackOutputDir: string,
): Promise<Settings | null> {
  intro("New icon set");

  const mode = expect(
    await select<BackgroundMode>({
      message: "Background style",
      initialValue: "image",
      options: [
        { value: "image", label: "Image", hint: "use a background picture" },
        { value: "color", label: "Solid color", hint: "enter a hex value" },
        { value: "random", label: "Random color", hint: "roll a color for me" },
      ],
    }),
  );

  let background: BackgroundChoice;

  if (mode === "image") {
    const imageInput = expect(
      await text({
        message: "Path to background image",
        validate: (value) => validateBackgroundImage(value ?? ""),
      }),
    );
    const hueInput = expect(
      await text({
        message: "Background hue rotation (degrees)",
        placeholder: "0",
        defaultValue: "0",
        initialValue: "0",
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

    background = {
      kind: "image",
      path: path.resolve(stripQuotes(imageInput)),
      hue,
    };
  } else {
    let color: RGB;

    if (mode === "color") {
      const hexInput = expect(
        await text({
          message: "Background color (hex)",
          placeholder: "e.g. #5865F2",
          validate: (value) =>
            value && parseHex(value)
              ? undefined
              : "Use a hex color like #5865F2.",
        }),
      );
      color = parseHex(hexInput)!;
    } else {
      color = randomColor();
      log.info(`Rolled ${swatch(color)} ${rgbToHex(color)}`);

      let locked = false;
      while (!locked) {
        const action = expect(
          await select<"lock" | "reroll">({
            message: "Keep this color?",
            initialValue: "lock",
            options: [
              { value: "lock", label: "Lock it in", hint: rgbToHex(color) },
              { value: "reroll", label: "Reroll", hint: "try another color" },
            ],
          }),
        );

        if (action === "lock") {
          locked = true;
        } else {
          color = randomColor();
          log.info(`Rolled ${swatch(color)} ${rgbToHex(color)}`);
        }
      }
    }

    const gradient = expect(
      await confirm({
        message: "Add a vertical gradient? (dark top, brighter bottom)",
        initialValue: false,
      }),
    );

    if (gradient) {
      log.info(
        `Gradient ${gradientSwatch(darken(color), color)} ${rgbToHex(darken(color))} → ${rgbToHex(color)}`,
      );
    }

    background = { kind: "color", color, gradient };
  }

  const outputDir = resolveOutputDir(background, fallbackOutputDir);

  const foregroundInput = expect(
    await text({
      message: "Foreground icons folder",
      validate: (value) => validateDirectory(value ?? "", outputDir),
    }),
  );
  const foregroundDir = path.resolve(stripQuotes(foregroundInput));
  const foregroundImages = findForegroundImages(foregroundDir, outputDir);
  log.info(
    `Found ${foregroundImages.length} icon${foregroundImages.length === 1 ? "" : "s"} to work with.`,
  );

  const paddingInput = expect(
    await text({
      message: "Padding around icons (%)",
      placeholder: "25",
      defaultValue: "25",
      initialValue: "25",
      validate: (value) => {
        const parsed = Number(value ?? "");
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > 45) {
          return "Pick a whole number from 0 to 45.";
        }
        return undefined;
      },
    }),
  );
  const padding = Number(paddingInput);
  const paddingPx = Math.round((CANVAS_SIZE * padding) / 100);
  log.info(
    `Icons get ${paddingPx}px of breathing room per side on a ${CANVAS_SIZE}px canvas.`,
  );

  const opacityInput = expect(
    await text({
      message: "Icon opacity (%)",
      placeholder: "100",
      defaultValue: "100",
      initialValue: "100",
      validate: (value) => {
        const parsed = Number(value ?? "");
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
          return "Pick a whole number from 0 to 100.";
        }
        return undefined;
      },
    }),
  );
  const opacity = Number(opacityInput);

  if (opacity < 100) {
    log.info(`Icons render at ${opacity}% opacity.`);
  }

  const invert = expect(
    await confirm({
      message: "Invert the icon overlays? (great for dark logos on light backgrounds)",
      initialValue: false,
    }),
  );

  const effects = expect(
    await select<EffectChoice>({
      message: "Effects",
      initialValue: "none",
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

  const settings: Settings = {
    foregroundDir,
    background,
    padding,
    opacity,
    invert,
    effects,
    outputDir,
  };

  const summary = [
    `Foreground   ${foregroundDir}`,
    `Icons        ${foregroundImages.length}`,
    `Background   ${describeBackground(background)}`,
    `Canvas       ${CANVAS_SIZE} × ${CANVAS_SIZE}`,
    `Padding      ${padding}% (${paddingPx}px per side)`,
    `Opacity      ${opacity}%`,
    `Invert       ${invert ? "yes" : "no"}`,
    `Effects      ${effects === "none" ? "none" : `${EFFECT_LABELS[effects]} (.gif)`}`,
    `Output       ${outputDir}`,
  ].join("\n");

  note(summary, "Render settings");

  for (;;) {
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

    await previewFirstIcon(settings);
  }
}
