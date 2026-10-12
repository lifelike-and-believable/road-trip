/** Read a JSON request body, refusing anything over `limit` bytes. */
export async function readJson(
  req: Request,
  limit = 16 * 1024,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const text = await req.text();
  if (Buffer.byteLength(text) > limit) {
    return { ok: false, response: Response.json({ code: "too_large", error: "body too large" }, { status: 413 }) };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, response: Response.json({ code: "bad_json", error: "body must be JSON" }, { status: 400 }) };
  }
}

export function storeError(where: string, e: unknown): Response {
  console.error(`[${where}]`, e);
  return Response.json({ code: "store_error", error: "could not reach the store" }, { status: 500 });
}
