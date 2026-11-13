import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, ilike, isNotNull, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { sellerProfiles, users } from "@/db/schema";
import { requireAdmin } from "@/lib/dal";
import { formatDate, formatDateTime } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { PAGE_SIZE, Pagination, parsePage } from "@/components/pagination";
import { suspendUser, unsuspendUser } from "@/app/actions/users";

export const metadata: Metadata = { title: "Admin · Users" };

const FILTERS = { all: "All", BUYER: "Buyers", SELLER: "Boutiques", ADMIN: "Admins", suspended: "Suspended" } as const;
type Filter = keyof typeof FILTERS;

export default function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-8">
      <h1 className="text-3xl font-bold">Users</h1>
      <p className="mb-6 mt-1 text-text-secondary">
        Every account. A suspended account can&apos;t log in, is signed out at its next click, and a suspended
        boutique&apos;s products disappear from the shop. Its open packages need handling on the Orders page.
      </p>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl border border-border bg-surface" />}>
        <Users searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Users({ searchParams }: Pick<PageProps<"/admin/users">, "searchParams">) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const filter: Filter = typeof sp.f === "string" && sp.f in FILTERS ? (sp.f as Filter) : "all";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const page = parsePage(sp.page);

  const conds: SQL[] = [];
  if (filter === "suspended") conds.push(isNotNull(users.suspendedAt));
  else if (filter !== "all") conds.push(eq(users.role, filter));
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c: string) => `\\${c}`)}%`;
    conds.push(or(ilike(users.email, like), ilike(users.name, like), ilike(sellerProfiles.shopName, like))!);
  }
  const where = conds.length ? and(...conds) : undefined;

  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(users).leftJoin(sellerProfiles, eq(sellerProfiles.userId, users.id)).where(where),
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
        emailVerified: users.emailVerified,
        suspendedAt: users.suspendedAt,
        suspendReason: users.suspendReason,
        shopName: sellerProfiles.shopName,
      })
      .from(users)
      .leftJoin(sellerProfiles, eq(sellerProfiles.userId, users.id))
      .where(where)
      .orderBy(desc(users.createdAt), users.id)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);

  const href = (f: Filter, p = 1) => {
    const qs = new URLSearchParams();
    if (f !== "all") qs.set("f", f);
    if (q) qs.set("q", q);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `/admin/users?${s}` : "/admin/users";
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter users" className="flex gap-2 overflow-x-auto pb-1">
          {(Object.keys(FILTERS) as Filter[]).map((f) => (
            <Link
              key={f}
              href={href(f)}
              aria-current={filter === f ? "page" : undefined}
              className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium ${
                filter === f ? "border-primary bg-primary text-white" : "border-border bg-surface hover:bg-muted"
              }`}
            >
              {FILTERS[f]}
            </Link>
          ))}
        </nav>
        <form action="/admin/users" className="flex gap-2">
          {filter !== "all" && <input type="hidden" name="f" value={filter} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search name, email or shop"
            aria-label="Search users"
            className="w-60 rounded-md border border-border bg-background p-2 text-sm"
          />
          <button className="rounded-md border border-border bg-surface px-3 text-sm font-medium hover:bg-muted">Search</button>
        </form>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="store" title="No accounts found">
          Try a different search or filter.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-text-secondary">
              <tr>
                <th className="px-4 py-3 font-medium">Account</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((u) => (
                <tr key={u.id} className={`align-top ${u.suspendedAt ? "bg-error/5" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-text-secondary">{u.email}</div>
                    {u.shopName && <div className="text-xs">{u.shopName}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs">{u.role === "SELLER" ? "Boutique" : u.role === "BUYER" ? "Buyer" : "Admin"}</td>
                  <td className="px-4 py-3 text-xs">{formatDate(u.createdAt)}</td>
                  <td className="px-4 py-3 text-xs">
                    {u.suspendedAt ? (
                      <>
                        <span className="font-medium text-error">Suspended {formatDateTime(u.suspendedAt)}</span>
                        {u.suspendReason && <div className="text-text-secondary">{u.suspendReason}</div>}
                      </>
                    ) : (
                      <span className="text-success">Active</span>
                    )}
                    {!u.emailVerified && <div className="text-accent-hover">Email not confirmed</div>}
                  </td>
                  <td className="px-4 py-3">
                    {u.role === "ADMIN" ? (
                      <span className="text-xs text-text-secondary">{u.id === me.id ? "You" : "Admin"}</span>
                    ) : u.suspendedAt ? (
                      <ActionForm action={unsuspendUser} fields={{ userId: u.id }} confirmMessage={`Restore ${u.email}? They can log in again.`}>
                        <SubmitButton tone="neutral">Restore</SubmitButton>
                      </ActionForm>
                    ) : (
                      <details>
                        <summary className="cursor-pointer text-xs font-medium text-error">Suspend…</summary>
                        <ActionForm
                          action={suspendUser}
                          fields={{ userId: u.id }}
                          confirmMessage={`Suspend ${u.email}? They are logged out immediately${u.role === "SELLER" ? " and their products are hidden" : ""}.`}
                          className="mt-1.5 flex w-56 flex-col gap-1.5"
                        >
                          <input
                            name="reason"
                            required
                            minLength={3}
                            maxLength={200}
                            placeholder="Reason (for the activity log)"
                            aria-label="Reason"
                            className="rounded-md border border-border bg-background p-1.5 text-xs"
                          />
                          <div>
                            <SubmitButton tone="danger">Suspend</SubmitButton>
                          </div>
                        </ActionForm>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={total} href={(p) => href(filter, p)} />
    </>
  );
}
