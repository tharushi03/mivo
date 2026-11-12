import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { adminActions, users } from "@/db/schema";
import { requireAdmin } from "@/lib/dal";
import { formatDateTime } from "@/lib/format";
import { ACTION_LABEL } from "@/lib/audit";
import { EmptyState } from "@/components/empty-state";
import { PAGE_SIZE, Pagination, parsePage } from "@/components/pagination";

export const metadata: Metadata = { title: "Admin · Activity" };

export default function AdminActivityPage({ searchParams }: PageProps<"/admin/activity">) {
  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-8">
      <h1 className="text-3xl font-bold">Activity</h1>
      <p className="mb-6 mt-1 text-text-secondary">
        Every admin action, newest first: payments verified, packages delivered, refunds, payouts, approvals and
        suspensions. Entries can&apos;t be edited or deleted here.
      </p>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl border border-border bg-surface" />}>
        <Activity searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Activity({ searchParams }: Pick<PageProps<"/admin/activity">, "searchParams">) {
  await requireAdmin();
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const action = typeof sp.action === "string" && sp.action in ACTION_LABEL ? sp.action : null;
  const where = action ? eq(adminActions.action, action) : undefined;

  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(adminActions).where(where),
    db
      .select({
        id: adminActions.id,
        action: adminActions.action,
        summary: adminActions.summary,
        createdAt: adminActions.createdAt,
        adminName: users.name,
        adminEmail: users.email,
      })
      .from(adminActions)
      .innerJoin(users, eq(adminActions.adminId, users.id))
      .where(where)
      .orderBy(desc(adminActions.createdAt), desc(adminActions.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);

  const href = (p: number) => {
    const qs = new URLSearchParams();
    if (action) qs.set("action", action);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `/admin/activity?${s}` : "/admin/activity";
  };

  return (
    <>
      {action && (
        <p className="mb-3 text-sm">
          Showing <strong>{ACTION_LABEL[action]}</strong> only ·{" "}
          <Link href="/admin/activity" className="text-accent hover:underline">
            Show everything
          </Link>
        </p>
      )}
      {rows.length === 0 ? (
        <EmptyState icon="box" title="No activity yet">
          Admin actions will appear here.
        </EmptyState>
      ) : (
        <ol className="divide-y divide-border rounded-xl border border-border bg-surface">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <Link href={`/admin/activity?action=${r.action}`} className="mr-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium hover:bg-border">
                  {ACTION_LABEL[r.action] ?? r.action}
                </Link>
                {r.summary}
              </div>
              <div className="text-xs text-text-secondary">
                {r.adminName} · {formatDateTime(r.createdAt)}
              </div>
            </li>
          ))}
        </ol>
      )}
      <Pagination page={page} total={total} href={href} />
    </>
  );
}
