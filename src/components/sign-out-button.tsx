import { signOut } from "@/auth";

export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      <button className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium transition-colors hover:border-error hover:text-error">
        Log Out
      </button>
    </form>
  );
}
