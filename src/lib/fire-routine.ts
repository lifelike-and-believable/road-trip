/* Starts the listings routine over HTTP, so a trip is read as soon as it is
   made and not at the next daily refresh. The address and the token come from
   the routine's API trigger in claude.ai; the token reaches that routine only. */

import "server-only";

export type FireConfig = { url: string; token: string };
export type FireResult = { fired: true } | { fired: false; reason: string };

export function routineFireConfig(env: Record<string, string | undefined> = process.env): FireConfig | null {
  const { ROUTINE_FIRE_URL: url, ROUTINE_FIRE_TOKEN: token } = env;
  if (!url || !token) return null;
  try {
    if (new URL(url).protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { url, token };
}

/** "new" for a trip just made; "continue" for one whose places did not all fit in the routine's last run. */
type Options = { env?: Record<string, string | undefined>; fetch?: typeof fetch; timeoutMs?: number; kind?: "new" | "continue" };

/** Never throws, and the result carries a code only: not the response, not the token. */
export async function fireRoutine(tripId: string, options: Options = {}): Promise<FireResult> {
  const config = routineFireConfig(options.env);
  if (!config) return { fired: false, reason: "not_configured" };
  const send = options.fetch ?? fetch;
  try {
    const res = await send(config.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        text:
          options.kind === "continue"
            ? `Continue trip ${tripId}: some of its places have not been read yet. Read only this trip's places that are due.`
            : `A trip was just made: ${tripId}. Its corridor and sources are ready. Read this trip's places first.`,
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });
    return res.ok ? { fired: true } : { fired: false, reason: `http_${res.status}` };
  } catch {
    return { fired: false, reason: "network" };
  }
}
