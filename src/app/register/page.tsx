import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage({ searchParams }: PageProps<"/register">) {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-background px-4 py-10">
      <Suspense fallback={<RegisterForm />}>
        <RegisterGate searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function RegisterGate({ searchParams }: Pick<PageProps<"/register">, "searchParams">) {
  // Mark this as request-time first: auth() run during prerender would create a
  // random CSRF token, which Cache Components rejects.
  await connection();
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  const { callbackUrl } = await searchParams;
  return <RegisterForm callbackUrl={typeof callbackUrl === "string" ? callbackUrl : undefined} />;
}
