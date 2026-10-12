import { isAuthed } from "../../../lib/auth";

/* Which settings are present. Booleans only, never a value, and safe to hit
   before the passcode works so setup can be checked. */
export async function GET(req: Request) {
  const has = (k: string) => !!process.env[k];
  return Response.json({
    ok: true,
    authed: isAuthed(req),
    config: {
      AUTH_SECRET: has("AUTH_SECRET"),
      APP_PASSCODE: has("APP_PASSCODE"),
      DOC_SALT: has("DOC_SALT"),
      REFRESH_SECRET: has("REFRESH_SECRET"),
      ANTHROPIC_API_KEY: has("ANTHROPIC_API_KEY"),
      redis: has("KV_REST_API_URL") || has("UPSTASH_REDIS_REST_URL"),
    },
  });
}
