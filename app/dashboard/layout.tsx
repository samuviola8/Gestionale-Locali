import { redirect } from "next/navigation";
import { accessoDaCompletare, getSessionUser, repartoAttivo } from "@/lib/auth";
import { getTenantFromHost } from "@/lib/tenant-host";
import { getTenantModules } from "@/lib/modules";
import { ultimeDelLocale } from "@/lib/segnalazioni-query";
import DashboardNav from "@/components/DashboardNav";
import DashboardShell from "@/components/DashboardShell";
import ThemeToggle from "@/components/ThemeToggle";
import CallsBell from "@/components/CallsBell";
import { IconLogout, IconUsers } from "@/components/icons";
import Stampante from "@/components/Stampante";
import Segnalazioni from "@/components/Segnalazioni";
import Firma from "@/components/Firma";
import { logout } from "./actions";
import { resolveCall } from "./calls-actions";
import { segnaStampati } from "./stampa-actions";
import { inviaSegnalazione, segnaRisposteViste } from "./segnalazioni-actions";

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

  // Password temporanea da cambiare, o secondo fattore che il locale pretende:
  // finche' c'e' qualcosa in sospeso la dashboard non si apre. La pagina che
  // lo risolve sta fuori di qui, altrimenti questo controllo la rimanderebbe a
  // se' stessa all'infinito.
  if (accessoDaCompletare(session)) redirect("/primo-accesso");

  const modules = await getTenantModules(session.tenantId);

  // Le segnalazioni del locale viaggiano col layout: sono poche righe su un
  // indice, e cosi' il pannello si apre gia' pieno invece di far aspettare
  // chi lo apre solo per rileggere la risposta di ieri.
  const segnalazioni = await ultimeDelLocale(session.tenantId);
  const risposteDaLeggere = segnalazioni.filter(
    (s) => s.reply && !s.replySeenAt
  ).length;

  return (
    <>
      <Stampante segnaStampati={segnaStampati} />
      <DashboardShell
        barraLaterale={
          <>
            {/* pr-10 solo da telefono: lascia il posto alla X che chiude. */}
            <div className="flex items-center gap-2.5 px-2 pb-5 pr-10 lg:pr-2">
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

            <div className="mt-auto space-y-1 pt-4">
              <Segnalazioni
                invia={inviaSegnalazione}
                segnaViste={segnaRisposteViste}
                elenco={segnalazioni}
                daLeggere={risposteDaLeggere}
              />

              {/* Fuori dal menu principale: ci deve arrivare anche chi sta a
                  una postazione e vede solo la coda. La password e' di chi
                  lavora, non del ruolo che ha. */}
              <a
                href="/dashboard/account"
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-[var(--surface-2)]"
                style={{ color: "var(--muted)" }}
              >
                <IconUsers />
                Il tuo accesso
              </a>

              <form action={logout}>
                <button
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-[var(--surface-2)]"
                  style={{ color: "var(--muted)" }}
                >
                  <IconLogout />
                  Esci
                </button>
              </form>

              <Firma compatta />
            </div>
          </>
        }
        intestazione={
          <>
            <span
              className="flex min-w-0 flex-1 items-center gap-2 text-xs"
              style={{ color: "var(--muted)" }}
            >
              <span className="live-dot" aria-hidden="true" />
              {/* Da telefono resta il solo pallino: la frase intera non ci sta
                  accanto a campanello e tema, e mozzata a meta' non dice
                  niente. Il testo resta per chi legge con la voce. */}
              <span className="truncate max-sm:sr-only">
                Aggiornamento in tempo reale
              </span>
            </span>
            <div className="flex shrink-0 items-center gap-3">
              {modules.waiter_call && (
                <CallsBell
                  resolveCall={resolveCall}
                  suono={tenant.callSound}
                  lampeggia={tenant.callBlink}
                />
              )}
              <ThemeToggle />
            </div>
          </>
        }
      >
        {children}
      </DashboardShell>
    </>
  );
}
