export const CANVAS_SIZE = 144;

export type RGB = readonly [number, number, number];

export type BackgroundChoice =
  | { kind: "image"; path: string; hue: number }
  | { kind: "color"; color: RGB; gradient: boolean }
  | { kind: "palette"; colors: RGB[]; gradient: boolean };

export type RenderBackground = Exclude<BackgroundChoice, { kind: "palette" }>;

export type EffectChoice = "none" | "glitch" | "scanline" | "shimmer" | "pulse";

export type AnimatedEffect = Exclude<EffectChoice, "none">;

export interface Settings {
  foregroundDir: string;
  background: BackgroundChoice;
  padding: number;
  opacity: number;
  invert: boolean;
  effects: EffectChoice;
  outputDir: string;
}

export interface WrittenIcon {
  slug: string;
  png: string;
  gif?: string;
}

export interface GenerationError {
  source: string;
  message: string;
}

export interface GenerationResult {
  written: WrittenIcon[];
  errors: GenerationError[];
}
