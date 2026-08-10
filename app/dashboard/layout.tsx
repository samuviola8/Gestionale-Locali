import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getTenantFromHost } from "@/lib/tenant-host";
import DashboardNav from "@/components/DashboardNav";
import ThemeToggle from "@/components/ThemeToggle";
import CallsBell from "@/components/CallsBell";
import { IconLogout } from "@/components/icons";
import { logout } from "./actions";
import { resolveCall } from "./calls-actions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tenant = await getTenantFromHost();
  const session = await getSessionUser();
  if (
    !session ||
    !tenant ||
    session.tenantSlug !== tenant.slug ||
    tenant.suspended
  ) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="mx-auto flex min-h-screen max-w-6xl">
        <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-neutral-200 bg-white p-4">
          <div className="flex items-center gap-2.5 px-2 pb-5">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-semibold text-[var(--brand-on)]"
              style={{ background: "var(--brand)" }}
            >
              {session.tenantName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                {session.tenantName}
              </div>
              <div className="text-xs text-neutral-400">Gestione locale</div>
            </div>
          </div>

          <DashboardNav />

          <form action={logout} className="mt-auto">
            <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-50">
              <IconLogout />
              Esci
            </button>
          </form>
        </aside>

        <main className="flex-1 bg-white">
          <div className="flex items-center justify-end gap-3 border-b border-neutral-200 px-6 py-3">
            <CallsBell resolveCall={resolveCall} />
            <ThemeToggle />
          </div>
          <div className="p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
