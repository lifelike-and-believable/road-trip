import { clearCookie, issueCookie, safeEqual } from "../../../lib/auth";
import { readJson } from "../../../lib/http";

export async function POST(req: Request) {
  const want = process.env.APP_PASSCODE;
  if (!want) return Response.json({ error: "APP_PASSCODE is not set" }, { status: 500 });

  const body = await readJson(req, 1024);
  if (!body.ok) return body.response;

  const given = (body.value as { passcode?: unknown } | null)?.passcode;
  if (typeof given !== "string" || !given || !safeEqual(given, want)) {
    return Response.json({ code: "bad_passcode", error: "That passcode doesn't match." }, { status: 401 });
  }
  return Response.json({ ok: true }, { headers: { "set-cookie": issueCookie() } });
}

export async function DELETE() {
  return Response.json({ ok: true }, { headers: { "set-cookie": clearCookie() } });
}
