// Clears a session cookie that requireUser rejected (password reset since, or account
// deleted) and sends the user to log in again. Pages can't delete cookies while
// rendering, so they redirect here.
import { cookies } from "next/headers";

export async function GET(request: Request) {
  const jar = await cookies();
  for (const c of jar.getAll()) {
    // Auth.js session cookie, its secure variant and any chunks (".0", ".1", ...).
    if (/^(__Secure-)?authjs\.session-token(\.\d+)?$/.test(c.name)) jar.delete(c.name);
  }
  const why = new URL(request.url).searchParams.get("why") === "suspended" ? "suspended" : "expired";
  return Response.redirect(new URL(`/login?${why}=1`, request.url), 303);
}
