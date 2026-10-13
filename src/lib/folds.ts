/* Which days the traveller has folded or opened by hand, kept in the browser for each trip, as the Montreal
   board keeps its folds. It is a convenience of this device: storage can be missing or refuse, and then the
   board simply starts from its defaults, a day already past folded and the rest open. */

export type FoldStorage = Pick<Storage, "getItem" | "setItem">;
export type Folds = Record<string, boolean>;

const key = (tripId: string) => `rt-folds-${tripId}`;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The browser's storage, or nothing when there is none or it will not be handed over (merely reaching for it can throw). */
export function browserStorage(): FoldStorage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function readFolds(storage: FoldStorage | undefined, tripId: string): Folds {
  try {
    const raw = storage?.getItem(key(tripId));
    if (!raw) return {};
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null || Array.isArray(data)) return {};
    const out: Folds = {};
    for (const [day, folded] of Object.entries(data)) if (DAY.test(day) && typeof folded === "boolean") out[day] = folded;
    return out;
  } catch {
    return {};
  }
}

export function writeFolds(storage: FoldStorage | undefined, tripId: string, folds: Folds): void {
  try {
    storage?.setItem(key(tripId), JSON.stringify(folds));
  } catch {
    // Storage is a convenience; a refusal is not worth saying anything about.
  }
}
