import { Suspense } from "react";
import { count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { products, sellerProfiles, users } from "@/db/schema";
import { requireAdmin } from "@/lib/dal";
import { SignOutButton } from "@/components/sign-out-button";
import { setSellerVerified } from "./actions";
import { formatDate } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";
import { PAGE_SIZE, Pagination, parsePage } from "@/components/pagination";

export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <div className="min-h-screen bg-background p-4 text-text sm:p-8">
      <div className="mx-auto max-w-6xl">
        <Suspense fallback={<HeaderSkeleton />}>
          <AdminHeader />
        </Suspense>

        <section className="mt-8">
          <h2 className="mb-1 text-xl font-bold">Boutiques</h2>
          <p className="mb-4 text-sm text-text-secondary">
            Approve boutiques before their products appear on the storefront.
          </p>
          <Suspense fallback={<TableSkeleton />}>
            <SellerTable searchParams={searchParams} />
          </Suspense>
        </section>
      </div>
    </div>
  );
}

async function AdminHeader() {
  const user = await requireAdmin();
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
      <div>
        <h1 className="text-3xl font-bold">MIVO Admin</h1>
        <p className="mt-1 text-text-secondary">Signed in as {user.email}</p>
      </div>
      <SignOutButton />
    </header>
  );
}

async function SellerTable({ searchParams }: Pick<PageProps<"/admin">, "searchParams">) {
  await requireAdmin();
  const page = parsePage((await searchParams).page);

  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(sellerProfiles),
    db
      .select({
        id: sellerProfiles.id,
        shopName: sellerProfiles.shopName,
        instagramUrl: sellerProfiles.instagramUrl,
        isVerified: sellerProfiles.isVerified,
        createdAt: sellerProfiles.createdAt,
        ownerName: users.name,
        ownerEmail: users.email,
        emailConfirmed: users.emailVerified,
        suspendedAt: users.suspendedAt,
        productCount: count(products.id),
      })
      .from(sellerProfiles)
      .innerJoin(users, eq(sellerProfiles.userId, users.id))
      .leftJoin(products, eq(products.sellerId, sellerProfiles.id))
      .groupBy(sellerProfiles.id, users.id)
      .orderBy(sellerProfiles.isVerified, desc(sellerProfiles.createdAt), sellerProfiles.id) // unverified first
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);

  if (rows.length === 0) {
    return (
      <EmptyState icon="store" title="No boutiques found">
        {page > 1 ? "There are no boutiques on this page." : "Boutiques will appear here once sellers sign up."}
      </EmptyState>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-text-secondary">
          <tr>
            <th className="px-4 py-3 font-medium">Shop</th>
            <th className="px-4 py-3 font-medium">Owner</th>
            <th className="px-4 py-3 font-medium">Instagram</th>
            <th className="px-4 py-3 font-medium">Products</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 text-right font-medium">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((s) => (
            <tr key={s.id}>
              <td className="px-4 py-3">
                <div className="font-medium">{s.shopName}</div>
                <div className="text-xs text-text-secondary">
                  Joined {formatDate(s.createdAt)}
                </div>
              </td>
              <td className="px-4 py-3">
                <div>{s.ownerName}</div>
                <div className="text-xs text-text-secondary">{s.ownerEmail}</div>
                {!s.emailConfirmed && <div className="text-xs font-medium text-error">Email not confirmed yet</div>}
              </td>
              <td className="px-4 py-3">
                {s.instagramUrl ? (
                  <a
                    href={s.instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline-offset-2 hover:underline"
                  >
                    {s.instagramUrl.replace(/^https?:\/\/(www\.)?instagram\.com\//, "@").replace(/\/$/, "")}
                  </a>
                ) : (
                  <span className="text-text-secondary">—</span>
                )}
              </td>
              <td className="px-4 py-3">{s.productCount}</td>
              <td className="px-4 py-3">
                {s.suspendedAt ? (
                  <span className="rounded-full bg-error/10 px-2.5 py-1 text-xs font-medium text-error">Suspended</span>
                ) : s.isVerified ? (
                  <span className="rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success">
                    Verified
                  </span>
                ) : (
                  <span className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent-hover">
                    Pending
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <form action={setSellerVerified}>
                  <input type="hidden" name="sellerId" value={s.id} />
                  <input type="hidden" name="verified" value={String(!s.isVerified)} />
                  {s.isVerified ? (
                    <button className="rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:border-error hover:text-error">
                      Revoke
                    </button>
                  ) : s.emailConfirmed ? (
                    <button className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover">
                      Approve
                    </button>
                  ) : (
                    <span className="text-xs text-text-secondary">Waiting for email confirmation</span>
                  )}
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <Pagination page={page} total={total} href={(p) => (p > 1 ? `/admin?page=${p}` : "/admin")} />
    </>
  );
}

function HeaderSkeleton() {
  return <div className="h-[73px] animate-pulse rounded-lg border-b border-border bg-muted/40" />;
}

function TableSkeleton() {
  return <div className="h-48 animate-pulse rounded-xl border border-border bg-surface" />;
}
