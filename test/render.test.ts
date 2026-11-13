import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { createCanvas, renderIcon } from "../src/render";
import { CANVAS_SIZE } from "../src/types";
import { cleanup, pixelAt, tempDir } from "./helpers";

function transparentForeground(): Promise<Buffer> {
  return sharp({
    create: {
      width: 40,
      height: 40,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

test("renders a padded icon over a solid color", async () => {
  const directory = tempDir();
  try {
    const foreground = path.join(directory, "foreground.png");
    writeFileSync(foreground, await transparentForeground());

    const png = await renderIcon(foreground, {
      background: { kind: "color", color: [255, 0, 0], gradient: false },
      padding: 25,
      invert: false,
    });

    const meta = await sharp(png).metadata();
    assert.equal(meta.width, CANVAS_SIZE);
    assert.equal(meta.height, CANVAS_SIZE);

    assert.deepEqual(await pixelAt(png, 72, 72), [255, 255, 255]);
    assert.deepEqual(await pixelAt(png, 10, 10), [255, 0, 0]);
  } finally {
    cleanup(directory);
  }
});

test("invert flips the foreground but not the background", async () => {
  const directory = tempDir();
  try {
    const foreground = path.join(directory, "foreground.png");
    writeFileSync(foreground, await transparentForeground());

    const png = await renderIcon(foreground, {
      background: { kind: "color", color: [255, 0, 0], gradient: false },
      padding: 25,
      invert: true,
    });

    assert.deepEqual(await pixelAt(png, 72, 72), [0, 0, 0]);
    assert.deepEqual(await pixelAt(png, 10, 10), [255, 0, 0]);
  } finally {
    cleanup(directory);
  }
});

test("gradient runs darker at the top and brighter at the bottom", async () => {
  const png = await createCanvas({
    kind: "color",
    color: [255, 80, 0],
    gradient: true,
  });

  const top = await pixelAt(png, 5, 0);
  const bottom = await pixelAt(png, 5, CANVAS_SIZE - 1);

  assert.ok(top[0] + top[1] + top[2] < bottom[0] + bottom[1] + bottom[2]);
});

test("image backgrounds are cropped and centered", async () => {
  const directory = tempDir();
  try {
    const background = path.join(directory, "background.png");
    const foreground = path.join(directory, "foreground.png");

    writeFileSync(
      background,
      await sharp({
        create: {
          width: 300,
          height: 200,
          channels: 3,
          background: { r: 0, g: 0, b: 255 },
        },
      })
        .png()
        .toBuffer(),
    );
    writeFileSync(foreground, await transparentForeground());

    const png = await renderIcon(foreground, {
      background: { kind: "image", path: background, hue: 0 },
      padding: 25,
      invert: false,
    });

    const meta = await sharp(png).metadata();
    assert.equal(meta.width, CANVAS_SIZE);
    assert.equal(meta.height, CANVAS_SIZE);
    assert.deepEqual(await pixelAt(png, 5, 5), [0, 0, 255]);
    assert.deepEqual(await pixelAt(png, 72, 72), [255, 255, 255]);
  } finally {
    cleanup(directory);
  }
});

test("hue rotation shifts an image background", async () => {
  const directory = tempDir();
  try {
    const background = path.join(directory, "red.png");

    writeFileSync(
      background,
      await sharp({
        create: {
          width: 50,
          height: 50,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .png()
        .toBuffer(),
    );

    const png = await createCanvas({
      kind: "image",
      path: background,
      hue: 120,
    });
    const [red, green, blue] = await pixelAt(png, 5, 5);

    assert.ok(green > 120);
    assert.ok(green > red);
    assert.ok(green > blue);
    assert.ok(red < 40);
  } finally {
    cleanup(directory);
  }
});

test("icon opacity blends the foreground into the background", async () => {
  const directory = tempDir();
  try {
    const foreground = path.join(directory, "foreground.png");
    writeFileSync(foreground, await transparentForeground());

    const png = await renderIcon(foreground, {
      background: { kind: "color", color: [255, 0, 0], gradient: false },
      padding: 25,
      invert: false,
      opacity: 50,
    });
    const [red, green, blue] = await pixelAt(png, 72, 72);

    assert.equal(red, 255);
    assert.ok(Math.abs(green - 128) <= 2);
    assert.ok(Math.abs(blue - 128) <= 2);
  } finally {
    cleanup(directory);
  }
});

test("transparent margins are trimmed before padding is applied", async () => {
  const directory = tempDir();
  try {
    const foreground = path.join(directory, "trimmed.png");
    const content = await sharp({
      create: {
        width: 20,
        height: 20,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    writeFileSync(
      foreground,
      await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .composite([{ input: content, gravity: "centre" }])
        .png()
        .toBuffer(),
    );

    const png = await renderIcon(foreground, {
      background: { kind: "color", color: [255, 0, 0], gradient: false },
      padding: 0,
      invert: false,
    });

    assert.deepEqual(await pixelAt(png, 2, 2), [255, 255, 255]);
    assert.deepEqual(await pixelAt(png, 72, 72), [255, 255, 255]);
  } finally {
    cleanup(directory);
  }
});

test("rasterizes SVG foregrounds", async () => {
  const directory = tempDir();
  try {
    const foreground = path.join(directory, "foreground.svg");
    writeFileSync(
      foreground,
      `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
        <rect width="24" height="24" fill="#ffffff" />
      </svg>`,
    );

    const png = await renderIcon(foreground, {
      background: { kind: "color", color: [255, 0, 0], gradient: false },
      padding: 25,
      invert: false,
    });

    assert.deepEqual(await pixelAt(png, 72, 72), [255, 255, 255]);
    assert.deepEqual(await pixelAt(png, 5, 5), [255, 0, 0]);
  } finally {
    cleanup(directory);
  }
});

test("fully transparent foregrounds throw a helpful error", async () => {
  const directory = tempDir();
  try {
    const foreground = path.join(directory, "empty.png");
    writeFileSync(
      foreground,
      await sharp({
        create: {
          width: 20,
          height: 20,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .png()
        .toBuffer(),
    );

    await assert.rejects(
      renderIcon(foreground, {
        background: { kind: "color", color: [255, 0, 0], gradient: false },
        padding: 12,
        invert: false,
      }),
      /fully transparent/,
    );
  } finally {
    cleanup(directory);
  }
});
