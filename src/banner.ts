import pc from "picocolors";
import { lerpRgb } from "./colors";
import type { RGB } from "./types";

const START: RGB = [34, 211, 238];
const END: RGB = [236, 72, 153];

const SQUARES: RGB[] = [
  [34, 211, 238],
  [99, 102, 241],
  [168, 85, 247],
  [236, 72, 153],
];

const WORDMARK = [
  "█▀▄  █▀▀  █▀▀  █ █  █  █▀▀  █▀█  █▄ █  █▀▀",
  "█ █  █▀▀  █    █▀▄  █  █    █ █  █ ▀█  ▀▀█",
  "▀▀   ▀▀▀  ▀▀▀  ▀ ▀  ▀  ▀▀▀  ▀▀▀  ▀  ▀  ▀▀▀",
];

const MARK_WIDTH = 27;
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

const MARK = SQUARES.map((color) => fg(color, "██████")).join(" ");

export function banner(version: string): void {
  const left = [MARK, MARK, MARK, " ".repeat(MARK_WIDTH), " ".repeat(MARK_WIDTH)];
  const right = [
    gradientText(WORDMARK[0]!, 0),
    gradientText(WORDMARK[1]!, 1),
    gradientText(WORDMARK[2]!, 2),
    pc.dim("icons that click"),
    pc.dim(`v${version} · deck icon composer`),
  ];

  console.log("");

  for (let row = 0; row < right.length; row += 1) {
    console.log(`  ${left[row]}    ${right[row]}`.trimEnd());
  }

  console.log("");
}
