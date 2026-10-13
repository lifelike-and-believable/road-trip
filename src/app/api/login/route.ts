import { clearCookie, issueCookie, safeEqual } from "../../../lib/auth";
import { readJson } from "../../../lib/http";
import { bumpCount, readCount } from "../../../lib/store";

/* One shared passcode is the only way in, so guessing it is slowed: ten wrong tries from one address in a
   quarter of an hour, and that address is refused until the quarter is up. If the store cannot count, the
   attempt goes ahead, since nothing else on the board works without the store either. */
const MAX_FAILURES = 10;
const WINDOW_SEC = 15 * 60;

// Vercel sets x-forwarded-for to the client's address, replacing any value the client sent.
const addressOf = (req: Request) => (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";

async function failuresFrom(address: string): Promise<number> {
  try {
    return await readCount(`login-failures:${address}`);
  } catch {
    console.error("login: failures could not be read");
    return 0;
  }
}

async function countFailure(address: string): Promise<void> {
  try {
    await bumpCount(`login-failures:${address}`, WINDOW_SEC);
  } catch {
    console.error("login: failure could not be counted");
  }
}

export async function POST(req: Request) {
  const want = process.env.BOARD_PASSCODE;
  if (!want) return Response.json({ error: "BOARD_PASSCODE is not set" }, { status: 500 });

  const body = await readJson(req, 1024);
  if (!body.ok) return body.response;

  const address = addressOf(req);
  if ((await failuresFrom(address)) >= MAX_FAILURES) {
    return Response.json(
      { code: "too_many_attempts", error: "Too many wrong passcodes. Try again in 15 minutes." },
      { status: 429, headers: { "retry-after": String(WINDOW_SEC) } },
    );
  }

  const given = (body.value as { passcode?: unknown } | null)?.passcode;
  if (typeof given !== "string" || !given || !safeEqual(given, want)) {
    await countFailure(address);
    return Response.json({ code: "bad_passcode", error: "That passcode doesn't match." }, { status: 401 });
  }
  return Response.json({ ok: true }, { headers: { "set-cookie": issueCookie() } });
}

export async function DELETE() {
  return Response.json({ ok: true }, { headers: { "set-cookie": clearCookie() } });
}
