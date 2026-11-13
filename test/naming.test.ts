import assert from "node:assert/strict";
import test from "node:test";
import { slugify, uniqueSlugs } from "../src/naming";

test("slugify lowercases and hyphenates names", () => {
  assert.equal(slugify("GitHub Logo"), "github-logo");
  assert.equal(slugify("  Café  "), "cafe");
  assert.equal(slugify("C++ / Rust"), "c-rust");
  assert.equal(slugify("___"), "icon");
});

test("uniqueSlugs deduplicates collisions deterministically", () => {
  const jobs = uniqueSlugs([
    "C:\\icons\\Github.png",
    "C:\\icons\\github.svg",
    "C:\\icons\\GitHub!.webp",
  ]);

  assert.deepEqual(
    jobs.map((job) => job.slug),
    ["github", "github-2", "github-3"],
  );
});
