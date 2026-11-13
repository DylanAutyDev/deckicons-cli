import assert from "node:assert/strict";
import test from "node:test";
import {
  darken,
  gradientBuffer,
  hslToRgb,
  parseHex,
  randomColor,
  rgbToHex,
  rgbToHsl,
} from "../src/colors";

test("parseHex accepts shorthand, longhand, and bare hex", () => {
  assert.deepEqual(parseHex("#fff"), [255, 255, 255]);
  assert.deepEqual(parseHex("#5865f2"), [88, 101, 242]);
  assert.deepEqual(parseHex("5865F2"), [88, 101, 242]);
});

test("parseHex rejects malformed values", () => {
  assert.equal(parseHex("#12345"), null);
  assert.equal(parseHex("nope"), null);
  assert.equal(parseHex("#gggggg"), null);
  assert.equal(parseHex(""), null);
});

test("rgbToHex pads channels", () => {
  assert.equal(rgbToHex([0, 8, 255]), "#0008ff");
});

test("hsl round-trips primary colors", () => {
  assert.deepEqual(hslToRgb(rgbToHsl([255, 0, 0])[0], 1, 0.5), [255, 0, 0]);
  assert.deepEqual(hslToRgb(rgbToHsl([0, 0, 255])[0], 1, 0.5), [0, 0, 255]);
});

test("darken lowers lightness without changing the hue", () => {
  const [hue, saturation] = rgbToHsl([255, 0, 0]);
  const darker = darken([255, 0, 0], 0.5);
  const [darkerHue, darkerSaturation] = rgbToHsl(darker);

  assert.equal(Math.round(darkerHue), Math.round(hue));
  assert.equal(Math.round(darkerSaturation * 100), Math.round(saturation * 100));
  assert.ok(darker[0] > 0 && darker[0] < 255);
});

test("gradientBuffer produces a vertical ramp", () => {
  const size = 4;
  const buffer = gradientBuffer(size, [10, 10, 10], [250, 250, 250]);

  assert.equal(buffer.length, size * size * 3);
  assert.equal(buffer[0], 10);
  const bottomOffset = (size - 1) * size * 3;
  assert.equal(buffer[bottomOffset], 250);
  assert.equal(
    buffer[(1 * size + 0) * 3],
    buffer[(1 * size + 1) * 3],
  );
});

test("randomColor returns a usable rgb color", () => {
  const color = randomColor(() => 0.5);
  for (const channel of color) {
    assert.ok(Number.isInteger(channel));
    assert.ok(channel >= 0 && channel <= 255);
  }
});
