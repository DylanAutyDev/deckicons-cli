import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { generateIcons, resolveOutputDir } from "../src/generate";
import type { Settings } from "../src/types";
import { cleanup, pixelAt, tempDir } from "./helpers";

async function writeIcon(file: string, color: { r: number; g: number; b: number }) {
  writeFileSync(
    file,
    await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 4,
        background: { ...color, alpha: 1 },
      },
    })
      .png()
      .toBuffer(),
  );
}

test("resolves output beside the background or in the foreground folder", () => {
  const foreground = path.join("C:", "icons", "foreground");
  const background = path.join("C:", "art", "background.png");

  assert.equal(
    resolveOutputDir(
      { kind: "image", path: background, hue: 0 },
      foreground,
    ),
    path.join("C:", "art", "generated"),
  );
  assert.equal(
    resolveOutputDir(
      { kind: "color", color: [0, 0, 0], gradient: false },
      foreground,
    ),
    path.join(foreground, "generated"),
  );
  assert.equal(
    resolveOutputDir(
      { kind: "palette", colors: [[0, 0, 0]], gradient: false },
      foreground,
    ),
    path.join(foreground, "generated"),
  );
});

test("palette mode gives each icon its own background color", async () => {
  const directory = tempDir();
  try {
    const foreground = path.join(directory, "foreground");
    const output = path.join(foreground, "generated");
    mkdirSync(foreground);

    await writeIcon(path.join(foreground, "a.png"), {
      r: 255,
      g: 255,
      b: 255,
    });
    await writeIcon(path.join(foreground, "b.png"), {
      r: 255,
      g: 255,
      b: 255,
    });
    await writeIcon(path.join(foreground, "c.png"), {
      r: 255,
      g: 255,
      b: 255,
    });

    const colors: Array<[number, number, number]> = [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
    ];
    const result = await generateIcons({
      foregroundDir: foreground,
      background: { kind: "palette", colors, gradient: false },
      padding: 25,
      opacity: 100,
      invert: false,
      effects: "none",
      outputDir: output,
    });

    assert.equal(result.errors.length, 0);
    assert.equal(result.written.length, 3);

    for (let index = 0; index < colors.length; index += 1) {
      const png = readFileSync(result.written[index]!.png);
      assert.deepEqual(await pixelAt(png, 2, 2), colors[index]);
    }
  } finally {
    cleanup(directory);
  }
});

test("generates lowercased PNGs and reports progress", async () => {
  const directory = tempDir();
  try {
    const foreground = path.join(directory, "foreground");
    const output = path.join(directory, "generated");
    mkdirSync(foreground);

    await writeIcon(path.join(foreground, "Alpha Icon.png"), {
      r: 255,
      g: 255,
      b: 255,
    });
    await writeIcon(path.join(foreground, "beta.png"), { r: 0, g: 0, b: 0 });

    const settings: Settings = {
      foregroundDir: foreground,
      background: { kind: "color", color: [88, 101, 242], gradient: true },
      padding: 12,
      opacity: 100,
      invert: false,
      effects: "none",
      outputDir: output,
    };

    const reports: string[] = [];
    const result = await generateIcons(settings, (_completed, _total, slug) => {
      reports.push(slug);
    });

    assert.equal(result.errors.length, 0);
    assert.deepEqual(
      result.written.map((icon) => icon.slug),
      ["alpha-icon", "beta"],
    );
    assert.deepEqual(reports, ["alpha-icon", "beta"]);
    assert.ok(existsSync(path.join(output, "alpha-icon.png")));
    assert.ok(existsSync(path.join(output, "beta.png")));
    assert.ok(!existsSync(path.join(output, "beta.gif")));
  } finally {
    cleanup(directory);
  }
});

test("writes a gif alongside each png when glitch is enabled", async () => {
  const directory = tempDir();
  try {
    const foreground = path.join(directory, "foreground");
    const output = path.join(directory, "generated");
    mkdirSync(foreground);

    await writeIcon(path.join(foreground, "Glitch Me.png"), {
      r: 240,
      g: 240,
      b: 240,
    });

    const settings: Settings = {
      foregroundDir: foreground,
      background: { kind: "color", color: [20, 20, 20], gradient: false },
      padding: 10,
      opacity: 100,
      invert: false,
      effects: "glitch",
      outputDir: output,
    };
    const result = await generateIcons(settings);

    assert.equal(result.errors.length, 0);
    assert.equal(result.written.length, 1);
    assert.equal(result.written[0]!.slug, "glitch-me");
    assert.ok(result.written[0]!.gif);
    assert.ok(existsSync(path.join(output, "glitch-me.png")));
    assert.ok(existsSync(path.join(output, "glitch-me.gif")));

    const stale = await generateIcons({ ...settings, effects: "none" });
    assert.equal(stale.errors.length, 0);
    assert.ok(!existsSync(path.join(output, "glitch-me.gif")));
  } finally {
    cleanup(directory);
  }
});

test("collects per-icon failures without aborting the batch", async () => {
  const directory = tempDir();
  try {
    const foreground = path.join(directory, "foreground");
    const output = path.join(directory, "generated");
    mkdirSync(foreground);

    await writeIcon(path.join(foreground, "good.png"), {
      r: 255,
      g: 255,
      b: 255,
    });
    writeFileSync(path.join(foreground, "broken.png"), "not an image");

    const result = await generateIcons({
      foregroundDir: foreground,
      background: { kind: "color", color: [0, 0, 0], gradient: false },
      padding: 12,
      opacity: 100,
      invert: false,
      effects: "none",
      outputDir: output,
    });

    assert.equal(result.written.length, 1);
    assert.equal(result.written[0]!.slug, "good");
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0]!.source, /broken\.png$/);
  } finally {
    cleanup(directory);
  }
});
