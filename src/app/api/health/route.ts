import { isAuthed } from "../../../lib/auth";
import { listingsBy } from "../../../lib/listings-by";

/* Which settings are present. Booleans only, never a value, and safe to hit
   before the passcode works so setup can be checked. */
export async function GET(req: Request) {
  const has = (k: string) => !!process.env[k];
  return Response.json({
    ok: true,
    authed: isAuthed(req),
    config: {
      AUTH_SECRET: has("AUTH_SECRET"),
      BOARD_PASSCODE: has("BOARD_PASSCODE"),
      DOC_SALT: has("DOC_SALT"),
      REFRESH_SECRET: has("REFRESH_SECRET"),
      ANTHROPIC_API_KEY: has("ANTHROPIC_API_KEY"),
      CRON_SECRET: has("CRON_SECRET"),
      ROUTINE_SECRET: has("ROUTINE_SECRET"),
      ROUTINE_FIRE_URL: has("ROUTINE_FIRE_URL"),
      ROUTINE_FIRE_TOKEN: has("ROUTINE_FIRE_TOKEN"),
      redis: (has("KV_REST_API_URL") || has("UPSTASH_REDIS_REST_URL")) && (has("KV_REST_API_TOKEN") || has("UPSTASH_REDIS_REST_TOKEN")),
    },
    listingsBy: listingsBy(),
  });
}
