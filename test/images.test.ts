import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  alphaBounds,
  applyOpacityRgba,
  findForegroundImages,
  findImages,
  invertRgba,
  isPathInside,
  isSupportedImage,
  stripQuotes,
} from "../src/images";
import { cleanup, tempDir } from "./helpers";

test("isSupportedImage is case-insensitive", () => {
  assert.equal(isSupportedImage("Icon.PNG"), true);
  assert.equal(isSupportedImage("icon.svg"), true);
  assert.equal(isSupportedImage("notes.txt"), false);
});

test("stripQuotes removes wrapping quotes", () => {
  assert.equal(stripQuotes(' "C:\\icons" '), "C:\\icons");
  assert.equal(stripQuotes("'C:\\icons'"), "C:\\icons");
});

test("findImages walks subfolders and sorts by name", () => {
  const directory = tempDir();
  try {
    mkdirSync(path.join(directory, "nested"));
    writeFileSync(path.join(directory, "zebra.png"), "x");
    writeFileSync(path.join(directory, "Alpha.SVG"), "x");
    writeFileSync(path.join(directory, "notes.txt"), "x");
    writeFileSync(path.join(directory, "nested", "middle.webp"), "x");

    const found = findImages(directory);

    assert.deepEqual(
      found.map((file) => path.basename(file)),
      ["Alpha.SVG", "middle.webp", "zebra.png"],
    );
  } finally {
    cleanup(directory);
  }
});

test("findForegroundImages skips the generated output folder", () => {
  const directory = tempDir();
  try {
    const output = path.join(directory, "generated");
    mkdirSync(output);
    writeFileSync(path.join(directory, "keep.png"), "x");
    writeFileSync(path.join(output, "skip.png"), "x");

    const found = findForegroundImages(directory, output);

    assert.deepEqual(
      found.map((file) => path.basename(file)),
      ["keep.png"],
    );
  } finally {
    cleanup(directory);
  }
});

test("isPathInside stays within the given directory", () => {
  const directory = path.join("C:", "icons");
  assert.equal(isPathInside(path.join(directory, "a.png"), directory), true);
  assert.equal(isPathInside(path.join(directory, "sub", "a.png"), directory), true);
  assert.equal(isPathInside(path.join("C:", "icons-other", "a.png"), directory), false);
  assert.equal(isPathInside(directory, directory), false);
});

test("alphaBounds finds the opaque region", () => {
  const width = 6;
  const height = 5;
  const data = Buffer.alloc(width * height * 4);

  for (let y = 1; y <= 2; y += 1) {
    for (let x = 2; x <= 3; x += 1) {
      data[(y * width + x) * 4 + 3] = 255;
    }
  }

  assert.deepEqual(alphaBounds(data, width, height), {
    left: 2,
    top: 1,
    width: 2,
    height: 2,
  });
  assert.equal(alphaBounds(Buffer.alloc(width * height * 4), width, height), null);
});

test("invertRgba inverts color but preserves alpha", () => {
  const data = Buffer.from([10, 20, 30, 40]);
  invertRgba(data);
  assert.deepEqual([...data], [245, 235, 225, 40]);
});

test("applyOpacityRgba scales alpha only", () => {
  const data = Buffer.from([10, 20, 30, 200, 40, 50, 60, 255]);
  applyOpacityRgba(data, 0.5);
  assert.deepEqual([...data], [10, 20, 30, 100, 40, 50, 60, 128]);
});
