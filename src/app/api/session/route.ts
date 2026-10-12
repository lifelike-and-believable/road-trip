import { isAuthed } from "../../../lib/auth";

export async function GET(req: Request) {
  return Response.json({ authed: isAuthed(req) });
}
