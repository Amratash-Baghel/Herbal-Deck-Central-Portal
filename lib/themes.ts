/**
 * The six themes. Paper is the default and lives in `:root`, so it carries no
 * class — the rest are class names on <html>, matching the blocks in
 * globals.css. `ground` and `brand` are the swatch colours for the picker; they
 * have to be literals because a chip shows a theme that isn't currently active,
 * so `var(--background)` would resolve to the wrong one.
 */
export type Theme = "paper" | "aurora" | "bloom" | "dusk" | "zest" | "graphite";

export const THEMES: {
  value: Theme;
  label: string;
  className: string | null;
  ground: string;
  brand: string;
}[] = [
  { value: "paper", label: "Paper", className: null, ground: "#f7f5f1", brand: "#10663c" },
  { value: "aurora", label: "Aurora", className: "aurora", ground: "#dceefc", brand: "#0b37e8" },
  { value: "bloom", label: "Bloom", className: "bloom", ground: "#fbdfe9", brand: "#f41bae" },
  { value: "dusk", label: "Dusk", className: "dusk", ground: "#e3d9fb", brand: "#7b2bf0" },
  { value: "zest", label: "Zest", className: "zest", ground: "#eef2c4", brand: "#3cc61e" },
  { value: "graphite", label: "Graphite", className: "graphite", ground: "#16171c", brand: "#b9bfd4" },
];

/** Stored values from the old three-theme picker, mapped onto the new set. */
export const LEGACY_THEMES: Record<string, Theme> = {
  light: "paper",
  dark: "graphite",
  midnight: "graphite",
};
