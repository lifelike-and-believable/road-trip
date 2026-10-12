/* The browser's side of the app's own API. */

import type { Corridor } from "../lib/corridor";
import type { PlanDoc } from "../lib/plan";
import type { ListingsDoc } from "../lib/refresh";
import type { presentTrip } from "../lib/trip";

export type PresentedTrip = ReturnType<typeof presentTrip>;

export type BoardData = {
  trip: PresentedTrip;
  corridor: Corridor | null;
  sources: { count: number } | null;
  listings: ListingsDoc | null;
  plan: Pick<PlanDoc, "tripId" | "picks" | "starred"> & { updatedAt: string | null };
};

export type Reply<T> = { ok: true; value: T } | { ok: false; status: number; message: string };

/** Fetch JSON from the app. A failure of any kind comes back as a message to show, never a throw. */
export async function call<T>(url: string, init?: RequestInit): Promise<Reply<T>> {
  try {
    const res = await fetch(url, { credentials: "same-origin", ...init });
    const body: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, value: body as T };
    const b = body as { error?: unknown; errors?: unknown } | null;
    const message = Array.isArray(b?.errors) ? b.errors.join(". ") : typeof b?.error === "string" ? b.error : `The request failed (${res.status}).`;
    return { ok: false, status: res.status, message };
  } catch {
    return { ok: false, status: 0, message: "Could not reach the app. Check your connection." };
  }
}

export const post = <T>(url: string, body?: unknown) =>
  call<T>(url, { method: "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

export const put = <T>(url: string, body: unknown) =>
  call<T>(url, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
