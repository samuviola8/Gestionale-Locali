import { redirect } from "next/navigation";
import { accessoDaCompletare, getSessionUser } from "@/lib/auth";
import { getTenantFromHost } from "@/lib/tenant-host";
import { statoConto } from "@/lib/account";
import CambiaPassword from "@/components/CambiaPassword";
import DueFattori from "@/components/DueFattori";
import {
  cambiaPasswordUtente,
  confermaApp,
  confermaPosta,
  preparaApp,
  preparaPosta,
  spegni,
} from "@/app/dashboard/account/actions";

// La stanza in cui si passa prima di entrare in dashboard, quando c'è qualcosa
// da sistemare: una password arrivata per mail, o il secondo fattore che il
// locale pretende. Sta fuori da /dashboard perché è il layout della dashboard
// a mandare qui — se stesse dentro, si rimanderebbe a se stessa all'infinito.

export default async function PrimoAccessoPage() {
  const tenant = await getTenantFromHost();
  const s = await getSessionUser();
  if (!s || !tenant || s.tenantSlug !== tenant.slug) redirect("/login");

  const manca = accessoDaCompletare(s!);
  // Non manca più niente: la pagina ha finito il suo lavoro.
  if (!manca) redirect("/dashboard");

  const stato = await statoConto("user", s!.userId);
  if (!stato) redirect("/login");

  return (
    <main className="mx-auto max-w-lg space-y-5 px-6 py-16">
      <div>
        <h1 className="text-2xl font-medium">{s!.tenantName}</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          {manca === "password"
            ? "Prima di entrare, scegli la tua password."
            : "Prima di entrare, attiva la verifica in due passaggi."}
        </p>
      </div>

      {manca === "password" ? (
        <section className="card p-4">
          <h2 className="text-sm font-semibold">Nuova password</h2>
          <p className="mb-3 mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
            Quella che hai ricevuto per mail è passata da una casella di posta:
            serve per entrare una volta, non per restare.
          </p>
          <CambiaPassword azione={cambiaPasswordUtente} temporanea dopo="/dashboard" />
        </section>
      ) : (
        <section className="card p-4">
          <h2 className="text-sm font-semibold">Verifica in due passaggi</h2>
          <p className="mb-3 mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
            Il locale la richiede per tutti. Scegli come ricevere le sei cifre:
            con un&apos;app sul telefono, oppure per mail.
          </p>
          <DueFattori
            metodo={stato.metodo}
            email={stato.email}
            obbligatoria={stato.obbligatoria}
            segretiDisponibili={stato.segretiDisponibili}
            preparaApp={preparaApp}
            confermaApp={confermaApp}
            preparaPosta={preparaPosta}
            confermaPosta={confermaPosta}
            spegni={spegni}
            dopo="/dashboard"
          />
        </section>
      )}

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Finito questo passaggio la dashboard si apre da sola.
      </p>
    </main>
  );
}
