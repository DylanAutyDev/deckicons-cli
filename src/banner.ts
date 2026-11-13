import pc from "picocolors";

const GLYPHS: Record<string, string[]> = {
  d: ["11110", "10001", "10001", "10001", "11110"],
  e: ["11111", "10000", "11110", "10000", "11111"],
  c: ["01111", "10000", "10000", "10000", "01111"],
  k: ["10001", "10010", "11100", "10010", "10001"],
  i: ["11111", "00100", "00100", "00100", "11111"],
  o: ["01110", "10001", "10001", "10001", "01110"],
  n: ["10001", "11001", "10101", "10011", "10001"],
  s: ["01111", "10000", "01110", "00001", "11110"],
};

const WORD = "deckicons";

const START: [number, number, number] = [34, 211, 238];
const END: [number, number, number] = [232, 121, 249];

function colorAt(index: number, total: number): [number, number, number] {
  const t = total <= 1 ? 0 : index / (total - 1);
  return [
    Math.round(START[0] + (END[0] - START[0]) * t),
    Math.round(START[1] + (END[1] - START[1]) * t),
    Math.round(START[2] + (END[2] - START[2]) * t),
  ];
}

function wordmark(): string[] {
  const rows: string[] = [];

  for (let row = 0; row < 5; row += 1) {
    rows.push(
      WORD.split("")
        .map((letter) => GLYPHS[letter]![row]!)
        .join(" "),
    );
  }

  return rows;
}

export function banner(version: string): void {
  const rows = wordmark();
  const width = rows[0]?.length ?? 0;
  const useColor = pc.isColorSupported;

  console.log("");

  for (const row of rows) {
    if (!useColor) {
      console.log(`  ${row.replaceAll("1", "█").replaceAll("0", " ")}`);
      continue;
    }

    let line = "";
    for (let index = 0; index < row.length; index += 1) {
      const char = row[index];
      if (char === "1") {
        const [r, g, b] = colorAt(index, width);
        line += `\u001b[38;2;${r};${g};${b}m█\u001b[0m`;
      } else {
        line += " ";
      }
    }
    console.log(`  ${line}`);
  }

  console.log("");
  console.log(
    `  ${pc.dim("icons that click")}  ${pc.dim("·")}  ${pc.dim(`v${version}`)}`,
  );
  console.log(`  ${pc.dim("stream deck + launchpad icon composer")}`);
  console.log("");
}
