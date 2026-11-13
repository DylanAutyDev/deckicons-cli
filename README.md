# Deckicons CLI

> icons that click.

Compose crisp 144×144 icons for Stream Deck and launchpad-style devices. Give Deckicons a folder of foreground icons plus a background image or color, and it produces a matching icon set — with optional gradient backgrounds and a subtle animated glitch effect.

```
████  █████ ████ █   █ █████ ████ ████ █   █ █████
█     █     █    █  █    █   █    █  █ ██  █ █
█     ████  █    ███     █   █    █  █ █ █ █ ████
█     █     █    █  █    █   █    █  █ █  ██    █
████  █████ ████ █   █ █████ ████ ████ █   █ █████
```

## Why

Sometimes you find a background you love and a set of icons you love, but they do not belong together yet. Deckicons is the missing step: it composites your foreground icons over one background and writes a ready-to-use set.

Need foreground icons? [Simple Icons](https://simpleicons.org/) has thousands of free SVG brand icons — black logos that look great with the invert option on a colorful background.

## Requirements

- Node.js 20.12 or newer

## Install

From a clone of this repo:

```bash
npm install
npm run build
npm link
```

Then run:

```bash
deckicons
```

During development you can skip the link and run `npm run dev`.

### Windows one-click

Double-click `DeckiconsCLI.bat`. It installs dependencies on first use, builds the CLI, launches the wizard, and pauses at the end so the window stays open.

## Wizard

```text
1. Background style             image / solid color / random color
   - image                        full path + optional hue rotation (0°)
   - color                        hex value, e.g. #5865F2
   - random                       rolls a color; lock in or reroll
2. Gradient                     optional dark-top → bright-bottom ramp (color/random)
3. Foreground icons folder      any folder of supported images (recursive)
4. Padding                      percent of canvas per side (default 25%)
5. Opacity                      foreground icon opacity (default 100%)
6. Invert                       flips foreground colors, keeps transparency
7. Effects                      none, glitch, scanline, shimmer, or pulse
8. Confirm                      run, or open a static preview first
```

Image mode writes to a `generated/` folder next to the background image. Color and random backgrounds write to `./generated` in the current folder.

## Output

For each foreground image:

```text
generated/
  github.png
  github.gif     # when an animation effect is enabled
  spotify.png
  spotify.gif
```

- Filenames are lowercased; spaces and unsafe characters become hyphens.
- Name collisions get a numeric suffix (`logo.png`, `logo-2.png`).
- Existing files in `generated/` are overwritten.
- A matching `.gif` is removed if you rerun that icon without an effect.
- The static PNG is always 144×144. The GIF is a 20-frame, ~1.8 s loop.
- Supported inputs: PNG, JPG, WebP, AVIF, SVG, and GIF (first frame).

## Backgrounds

**Image** — the image is center-cropped to a square and scaled to 144×144. Hue rotation (0–360°, default 0) is applied first, so one background can cover several color moods.

**Solid color** — a flat hex fill.

**Random color** — a pleasing random HSL color, shown as a swatch. Reroll until you like it, then lock it in. Random colors use the same hex/gradient path as solid colors.

**Gradient** — a simple vertical ramp: a darker version of the chosen color at the top, the target color at the bottom.

## Effects

Effects are written as a GIF next to the PNG and use a 20-frame, ~1.8 s loop.

- **Subtle glitch** — two short cyberpunk stutters with horizontal band shifts and a light channel split. Slowed down so it reads without feeling frantic.
- **Scanline sweep** — a soft horizontal light band drifts down the icon.
- **Holo shimmer** — a faint diagonal cyan-to-pink sheen sweeps across.
- **Pulse glow** — a slow radial breath of light from the center.

## Icons, opacity, and inversion

Foregrounds are trimmed to their visible pixels before padding is applied, so every icon gets even breathing room regardless of transparent margins in the source file.

Use the opacity step to soften the icon overlay without touching the background. At 100% the icon is fully solid; lower values let more of the background show through.

SVG icons are usually solid black. If your background is dark, turn on **Invert** to render them white/light without editing the source files.

## Development

```bash
npm run dev        # run the wizard from source
npm run typecheck  # TypeScript, no emit
npm test           # unit tests (node:test)
npm run build      # bundle to dist/
npm run verify     # typecheck + tests + build
```

Project layout:

```text
src/
  cli.ts        entry point, help/version, progress output
  wizard.ts     interactive flow and confirmation
  render.ts     canvas creation, hue, padding, opacity, cropping, inversion
  effects.ts    glitch/scanline/shimmer/pulse frames and GIF encoding
  generate.ts   batch runner and output writing
  colors.ts     hex parsing, HSL math, gradients, swatches
  images.ts     image discovery, alpha bounds, supported formats
  naming.ts     slug generation and collision handling
  banner.ts     intro wordmark
test/           unit and batch tests
```

## License

MIT
