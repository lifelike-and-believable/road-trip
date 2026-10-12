import crypto from "node:crypto";

/* One passcode, a signed cookie, and a bearer token for the refresh job:
   the same arrangement as the Montreal Weekend Board's lib/auth.js. */

const COOKIE = "trip_auth";
const YEAR = 60 * 60 * 24 * 365;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** Constant-time compare of two arbitrary-length strings. */
export function safeEqual(a: unknown, b: unknown): boolean {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function issueCookie(): string {
  const payload = `1.${Date.now()}`;
  return [
    `${COOKIE}=${payload}.${sign(payload)}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${YEAR}`,
  ].join("; ");
}

export function clearCookie(): string {
  return `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/** True when the request carries a valid, unexpired session cookie. */
export function isAuthed(req: Request): boolean {
  try {
    const token = readCookie(req, COOKIE);
    if (!token) return false;
    const i = token.lastIndexOf(".");
    if (i < 0) return false;
    const payload = token.slice(0, i);
    if (!safeEqual(token.slice(i + 1), sign(payload))) return false;
    const issued = Number(payload.split(".")[1] || 0);
    return Number.isFinite(issued) && Date.now() - issued < YEAR * 1000;
  } catch {
    return false;
  }
}

/** Bearer-token auth for the refresh job. */
export function isRefreshJob(req: Request): boolean {
  const want = process.env.REFRESH_SECRET;
  if (!want) return false;
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return !!got && safeEqual(got, want);
}

/** A 401 response when the request may not proceed, otherwise null. */
export function gate(req: Request): Response | null {
  if (isAuthed(req) || isRefreshJob(req)) return null;
  return Response.json({ code: "permission_denied", error: "not signed in" }, { status: 401 });
}
