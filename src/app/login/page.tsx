import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { LoginForm } from "./login-form";

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Suspense fallback={<LoginForm />}>
        <LoginGate searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

// Reads the session + query string at request time, so it streams behind Suspense.
async function LoginGate({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  // Mark this as request-time first: auth() run during prerender would create a
  // random CSRF token, which Cache Components rejects.
  await connection();
  const { callbackUrl, reset, expired, suspended } = await searchParams;
  const session = await auth();
  // ?expired=1: the session was rejected (password changed); always show the form,
  // never bounce a stale cookie back into the app.
  if (session?.user && expired !== "1" && suspended !== "1") redirect("/dashboard");

  const notice =
    reset === "1"
      ? "Your password was changed. Log in with your new password."
      : expired === "1"
        ? "Please log in again: your password was changed since you last signed in."
        : suspended === "1"
          ? "Your account has been suspended. Please contact MIVO support."
          : undefined;
  return <LoginForm callbackUrl={typeof callbackUrl === "string" ? callbackUrl : undefined} notice={notice} />;
}
