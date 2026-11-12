// The link in the confirmation email. A route handler (not a page) because using
// the link changes data; it then shows the result on /email-confirmed.
import { confirmEmail } from "@/lib/email-verification";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = await confirmEmail(url.searchParams.get("token") ?? "");
  return Response.redirect(new URL(`/email-confirmed?status=${status}`, request.url), 303);
}
