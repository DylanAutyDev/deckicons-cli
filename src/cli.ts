#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { log, outro, progress } from "@clack/prompts";
import { banner } from "./banner";
import { generateIcons } from "./generate";
import { findForegroundImages } from "./images";
import { runWizard } from "./wizard";

function readVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function printHelp(version: string): void {
  console.log(`Deckicons CLI v${version}

Compose 144×144 icons for Stream Deck and launchpad devices.
Pairs a background image or color with your foreground icons.

Usage:
  deckicons             run the interactive wizard
  deckicons --version   print the version
  deckicons --help      show this help

Output:
  generated/<name>.png    in a "generated" folder beside the background image
  generated/<name>.gif    when an animation effect is enabled
  (color backgrounds write to ./generated in the current folder)

Foreground icon ideas: https://simpleicons.org/
`);
}

async function main(): Promise<void> {
  const version = readVersion();
  const args = process.argv.slice(2);

  if (args.includes("-h") || args.includes("--help")) {
    printHelp(version);
    return;
  }
  if (args.includes("-v") || args.includes("--version")) {
    console.log(version);
    return;
  }

  banner(version);

  const fallbackOutputDir = path.resolve(process.cwd(), "generated");
  const settings = await runWizard(fallbackOutputDir);

  if (!settings) {
    return;
  }

  const total = findForegroundImages(
    settings.foregroundDir,
    settings.outputDir,
  ).length;

  if (total === 0) {
    log.error("No foreground images found. Nothing to render.");
    process.exitCode = 1;
    return;
  }

  const bar = progress({ max: total, style: "heavy" });
  bar.start("Compositing icons");

  let result;
  try {
    result = await generateIcons(settings, (completed, count, slug) => {
      bar.advance(1, `${completed}/${count} · ${slug}`);
    });
  } catch (error) {
    bar.error(
      `Render failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
    return;
  }

  const gifCount = result.written.filter((icon) => icon.gif).length;
  bar.stop(
    `Rendered ${result.written.length} of ${total} icon${total === 1 ? "" : "s"}`,
  );

  if (result.written.length > 0) {
    const parts = [
      `${result.written.length} PNG${result.written.length === 1 ? "" : "s"}`,
    ];
    if (gifCount > 0) {
      parts.push(`${gifCount} GIF${gifCount === 1 ? "" : "s"}`);
    }
    log.success(`${parts.join(" + ")} written to ${settings.outputDir}`);
  }

  for (const failure of result.errors) {
    log.error(
      `${path.basename(failure.source)} — ${failure.message}`,
    );
  }

  if (result.errors.length > 0) {
    process.exitCode = 1;
    outro("Finished with a few bumps. Check the errors above.");
    return;
  }

  outro("Your deck just got an upgrade.");
}

main().catch((error: unknown) => {
  log.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
