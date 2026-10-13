/* The board's filter bar: category chips, free only, and starred only. Applied together.
   With no category chip on, every category shows, as on the Montreal board. */

import type { Day } from "./board";
import type { Category } from "./listing";

/** The order the chips appear in. */
export const CATEGORY_ORDER: Category[] = ["music", "theatre", "museum", "festival", "sports", "food", "outdoors", "family", "other"];

export const CATEGORY_LABELS: Record<Category, string> = {
  music: "Music",
  theatre: "Theatre",
  museum: "Museums and exhibits",
  festival: "Festivals",
  sports: "Sports",
  food: "Food and markets",
  outdoors: "Outdoors",
  family: "Family",
  other: "Other",
};

export type Filters = { categories: Set<Category>; freeOnly: boolean; starredOnly: boolean };

export function filterDays(days: Day[], filters: Filters, starred: Set<string>): Day[] {
  return days
    .map((d) => ({
      day: d.day,
      options: d.options.filter(
        (o) =>
          (filters.categories.size === 0 || filters.categories.has(o.listing.category)) &&
          (!filters.freeOnly || o.listing.cost === "free") &&
          (!filters.starredOnly || starred.has(o.id)),
      ),
    }))
    .filter((d) => d.options.length > 0);
}

/** Everything but what the traveller has hidden. A flexible entry is hidden from every day it appears on, since it is one place. */
export function withoutHidden(days: Day[], hidden: Set<string>): Day[] {
  if (hidden.size === 0) return days;
  return days.map((d) => ({ day: d.day, options: d.options.filter((o) => !hidden.has(o.id)) })).filter((d) => d.options.length > 0);
}

/** The categories that have something on, so a chip is never offered that would show nothing. */
export function categoriesIn(days: Day[]): Category[] {
  const present = new Set(days.flatMap((d) => d.options.map((o) => o.listing.category)));
  return CATEGORY_ORDER.filter((c) => present.has(c));
}
