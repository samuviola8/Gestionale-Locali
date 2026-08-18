import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
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
} from "./actions";

export default async function AccountPage() {
  const s = await getSessionUser();
  if (!s) redirect("/login");

  const stato = await statoConto("user", s.userId);
  if (!stato) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Il tuo accesso</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Entri come <strong>{stato.email}</strong>
          {s.role === "owner" ? " (titolare)" : ""}.
        </p>
      </div>

      <section className="card p-4">
        <h2 className="text-sm font-semibold">Password</h2>
        <p className="mb-3 mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
          Cambiandola, chi era entrato con la vecchia si ritrova fuori. Tu resti
          dentro.
        </p>
        <CambiaPassword azione={cambiaPasswordUtente} temporanea={stato.daCambiare} />
      </section>

      <section className="card p-4">
        <h2 className="text-sm font-semibold">Verifica in due passaggi</h2>
        <p className="mb-3 mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
          Dopo la password, sei cifre: dall&apos;app di autenticazione, oppure
          per mail. Se la password gira, da sola non basta più.
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
        />
        {stato.metodo && (
          <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
            Telefono perso? Il gestore del servizio può azzerarla e farti
            ripartire da capo.
          </p>
        )}
      </section>
    </div>
  );
}
