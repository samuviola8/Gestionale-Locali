import { redirect } from "next/navigation";
import { getSessionUser, repartoAttivo } from "@/lib/auth";
import { getTenantFromHost } from "@/lib/tenant-host";
import { getTenantModules } from "@/lib/modules";
import DashboardNav from "@/components/DashboardNav";
import ThemeToggle from "@/components/ThemeToggle";
import CallsBell from "@/components/CallsBell";
import { IconLogout } from "@/components/icons";
import Stampante from "@/components/Stampante";
import { logout } from "./actions";
import { resolveCall } from "./calls-actions";
import { segnaStampati } from "./stampa-actions";

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

  const modules = await getTenantModules(session.tenantId);

  return (
    <>
      <Stampante segnaStampati={segnaStampati} />
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="mx-auto flex min-h-screen max-w-6xl">
        <aside
          className="sticky top-0 flex h-screen w-60 shrink-0 flex-col p-4"
          style={{
            background: "var(--surface)",
            borderRight: "1px solid var(--border)",
          }}
        >
          <div className="flex items-center gap-2.5 px-2 pb-5">
            {tenant.logoUrl ? (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={tenant.logoUrl}
                  alt=""
                  className="h-7 w-7 object-contain"
                />
              </div>
            ) : (
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold text-[var(--brand-on)]"
                style={{ background: "var(--brand)" }}
              >
                {session.tenantName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                {session.tenantName}
              </div>
              <div className="text-xs text-neutral-400">Gestione locale</div>
            </div>
          </div>

          <DashboardNav
            modules={modules}
            soloCoda={!!repartoAttivo(session)}
            isOwner={session.role === "owner"}
          />

          <form action={logout} className="mt-auto">
            <button
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-[var(--surface-2)]"
              style={{ color: "var(--muted)" }}
            >
              <IconLogout />
              Esci
            </button>
          </form>
        </aside>

        {/* min-w-0: senza, questo figlio flex non si restringe sotto la
            larghezza del proprio contenuto e la pagina scorre in orizzontale. */}
        <main className="min-w-0 flex-1" style={{ background: "var(--bg)" }}>
          <div
            className="sticky top-0 z-30 flex items-center justify-between gap-3 px-6 py-3 backdrop-blur"
            style={{
              borderBottom: "1px solid var(--border)",
              background: "color-mix(in srgb, var(--bg) 82%, transparent)",
            }}
          >
            <span
              className="flex items-center gap-2 text-xs"
              style={{ color: "var(--muted)" }}
            >
              <span className="live-dot" aria-hidden="true" />
              Aggiornamento in tempo reale
            </span>
            <div className="flex items-center gap-3">
              {modules.waiter_call && <CallsBell resolveCall={resolveCall} />}
              <ThemeToggle />
            </div>
          </div>
          <div className="p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
    </>
  );
}
