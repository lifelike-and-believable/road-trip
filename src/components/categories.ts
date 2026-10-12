import type { Category } from "../lib/listing";

/** The Montreal board's category colours, reused. A colour is never the only signal: every chip and card names its category. */
export const CATEGORY_COLOR: Record<Category, string> = {
  music: "var(--c-music)",
  theatre: "var(--c-theatre)",
  museum: "var(--c-museum)",
  festival: "var(--c-fest)",
  sports: "var(--c-film)",
  food: "var(--c-market)",
  outdoors: "var(--c-dance)",
  family: "var(--c-fest)",
  other: "var(--ink-3)",
};
