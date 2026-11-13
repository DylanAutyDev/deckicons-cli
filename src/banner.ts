import pc from "picocolors";
import { lerpRgb } from "./colors";
import type { RGB } from "./types";

const START: RGB = [34, 211, 238];
const END: RGB = [236, 72, 153];
const BORDER: RGB = [100, 116, 139];
const KEY_TOP_LEFT: RGB = [34, 211, 238];
const KEY_TOP_RIGHT: RGB = [99, 102, 241];
const KEY_BOTTOM_LEFT: RGB = [168, 85, 247];
const KEY_BOTTOM_RIGHT: RGB = [236, 72, 153];

const WORDMARK = [
  "█▀▄ █▀▀ █▀▀ █ █ █ █▀█ █▄ █ █▀▀",
  "█ █ █▀▀ █   █▀▄ █ █ █ █ ▀█ ▀▀█",
  "▀▀  ▀▀▀ ▀▀▀ ▀ ▀ ▀ ▀▀  ▀  ▀ ▀▀▀",
];

const useColor = pc.isColorSupported;

function fg(rgb: RGB, text: string): string {
  if (!useColor) {
    return text;
  }
  return `\u001b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${text}\u001b[0m`;
}

function gradientText(text: string, row: number): string {
  if (!useColor) {
    return text;
  }

  const chars = Array.from(text);
  return chars
    .map((char, index) => {
      if (char === " ") {
        return " ";
      }

      const t = Math.min(
        1,
        (index / Math.max(1, chars.length - 1)) * 0.75 + row * 0.05,
      );
      return fg(lerpRgb(START, END, t), char);
    })
    .join("");
}

function keycapRow(index: number): string {
  const edge = fg(BORDER, "│");

  switch (index) {
    case 0:
      return fg(BORDER, "╭──────────────────╮");
    case 1:
      return `${edge}${" ".repeat(18)}${edge}`;
    case 2:
    case 3:
      return `${edge}  ${fg(KEY_TOP_LEFT, "████")}      ${fg(KEY_TOP_RIGHT, "████")}  ${edge}`;
    case 4:
      return `${edge}${" ".repeat(18)}${edge}`;
    case 5:
    case 6:
      return `${edge}  ${fg(KEY_BOTTOM_LEFT, "████")}      ${fg(KEY_BOTTOM_RIGHT, "████")}  ${edge}`;
    default:
      return fg(BORDER, "╰──────────────────╯");
  }
}

export function banner(version: string): void {
  const right = [
    "",
    "",
    gradientText(WORDMARK[0]!, 0),
    gradientText(WORDMARK[1]!, 1),
    gradientText(WORDMARK[2]!, 2),
    pc.dim("icons that click"),
    pc.dim(`v${version} · deck icon composer`),
    "",
  ];

  console.log("");

  for (let row = 0; row < 8; row += 1) {
    console.log(`  ${keycapRow(row)}    ${right[row] ?? ""}`.trimEnd());
  }

  console.log("");
}
