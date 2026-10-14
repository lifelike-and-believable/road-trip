/* Documents live in Redis (Upstash, through Vercel's Storage tab), reached
   over its REST interface with fetch, so there is no client dependency.
   Redis rather than Blob for the reason the Montreal Weekend Board gives:
   reads off a CDN can return the pre-write body, and a stale read of a
   trip would be written back over a fresh one by the next refresh.

   Everything is namespaced under a secret salt. */

function salt(): string {
  const s = process.env.DOC_SALT;
  if (!s) throw new Error("DOC_SALT is not set");
  return s;
}

function redisConfig(): { url: string; token: string } {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Redis is not configured (KV_REST_API_URL / KV_REST_API_TOKEN)");
  return { url: url.replace(/\/+$/, ""), token };
}

type Command = string[];
type Reply = { result?: unknown; error?: string } | null;

/** Run one command, or a pipeline of them. Returns one result per command. */
async function redis(commands: Command | Command[]): Promise<unknown[]> {
  const { url, token } = redisConfig();
  const pipeline = Array.isArray(commands[0]);
  const r = await fetch(pipeline ? `${url}/pipeline` : url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(commands),
    cache: "no-store",
  });
  const j = (await r.json()) as Reply | Reply[];
  if (!r.ok) throw new Error((!Array.isArray(j) && j?.error) || `Redis returned ${r.status}`);
  const replies = Array.isArray(j) ? j : [j];
  for (const item of replies) if (item?.error) throw new Error(item.error);
  return replies.map((item) => (item ? item.result : null));
}

/** Reject traversal and anything outside a conservative charset. */
export function cleanPath(p: unknown): string | null {
  const s = String(p ?? "").replace(/^\/+|\/+$/g, "");
  if (!s || s.length > 200) return null;
  if (!/^[A-Za-z0-9_\-./]+$/.test(s)) return null;
  if (s.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) return null;
  return s;
}

const docKey = (p: string) => `doc:${salt()}:${p}`;
const colKey = (c: string) => `col:${salt()}:${c}`;

function split(p: string): { col: string | null; id: string } {
  const i = p.lastIndexOf("/");
  return i < 0 ? { col: null, id: p } : { col: p.slice(0, i), id: p.slice(i + 1) };
}

function parse(v: unknown): unknown {
  if (v == null) return null;
  if (typeof v === "object") return v;
  try {
    return JSON.parse(String(v));
  } catch {
    return null;
  }
}

export async function getDoc<T = unknown>(p: string): Promise<T | null> {
  const [v] = await redis(["GET", docKey(p)]);
  return parse(v) as T | null;
}

/** Several documents in one request, in the order asked, with null for any that is missing. */
export async function getDocs(paths: string[]): Promise<unknown[]> {
  if (!paths.length) return [];
  const values = await redis(paths.map((p) => ["GET", docKey(p)]));
  return values.map(parse);
}

export async function setDoc(p: string, data: unknown): Promise<void> {
  const { col, id } = split(p);
  const cmds: Command[] = [["SET", docKey(p), JSON.stringify(data)]];
  if (col) cmds.push(["SADD", colKey(col), id]);
  await redis(cmds);
}

export async function deleteDoc(p: string): Promise<void> {
  const { col, id } = split(p);
  const cmds: Command[] = [["DEL", docKey(p)]];
  if (col) cmds.push(["SREM", colKey(col), id]);
  await redis(cmds);
}

const countKey = (name: string) => `count:${salt()}:${name}`;

/** A counter that disappears a set time after its first count. */
export async function bumpCount(name: string, windowSec: number): Promise<void> {
  await redis([["INCR", countKey(name)], ["EXPIRE", countKey(name), String(windowSec), "NX"]]);
}

export async function readCount(name: string): Promise<number> {
  const [v] = await redis(["GET", countKey(name)]);
  return Number(v ?? 0) || 0;
}

/** Every document directly under a collection. */
export async function listDocs<T = unknown>(c: string): Promise<{ id: string; data: T }[]> {
  const [ids] = await redis(["SMEMBERS", colKey(c)]);
  const list = Array.isArray(ids) ? (ids as string[]) : [];
  if (!list.length) return [];
  const values = await redis(list.map((id) => ["GET", docKey(`${c}/${id}`)]));
  const out: { id: string; data: T }[] = [];
  const orphans: string[] = [];
  list.forEach((id, i) => {
    const data = parse(values[i]) as T | null;
    if (data) out.push({ id, data });
    else orphans.push(id);
  });
  // a member whose document is gone would otherwise be read forever
  if (orphans.length) redis([["SREM", colKey(c), ...orphans]]).catch(() => {});
  return out;
}
