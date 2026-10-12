/** Who reads the places for events. The routine unless LISTINGS_BY is "cron", which has this server do it with the Anthropic API. */
export function listingsBy(env: Record<string, string | undefined> = process.env): "routine" | "cron" {
  return env.LISTINGS_BY === "cron" ? "cron" : "routine";
}
