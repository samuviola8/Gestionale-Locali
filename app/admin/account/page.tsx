import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/admin-auth";
import { statoConto } from "@/lib/account";
import CambiaPassword from "@/components/CambiaPassword";
import DueFattori from "@/components/DueFattori";
import CambiaEmailAdmin from "@/components/CambiaEmailAdmin";
import {
  cambiaEmail,
  cambiaPasswordAdmin,
  confermaAppAdmin,
  confermaPostaAdmin,
  preparaAppAdmin,
  preparaPostaAdmin,
  spegniAdmin,
} from "./actions";

export default async function AccountAdminPage() {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");

  const stato = await statoConto("admin", admin.id);
  if (!stato) redirect("/admin/login");

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <main className="mx-auto max-w-2xl space-y-5 px-6 py-8">
        <div>
          <a href="/admin" className="text-sm text-neutral-500 hover:text-neutral-800">
            ← Torna alla panoramica
          </a>
          <h1 className="mt-2 text-2xl font-semibold">Il tuo account</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Le chiavi del pannello che vede tutti i locali. Trattale come tali.
          </p>
        </div>

        {stato.daCambiare && (
          <div
            className="rounded-xl px-4 py-3 text-sm"
            style={{ background: "var(--warn-bg)", color: "var(--warn)" }}
          >
            Stai usando una password temporanea: scegline una tua qui sotto.
          </div>
        )}

        <section className="card p-4">
          <h2 className="text-sm font-semibold">Indirizzo di accesso</h2>
          <p className="mb-3 mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
            Adesso entri con <strong>{stato.email}</strong>.
          </p>
          <CambiaEmailAdmin azione={cambiaEmail} emailAttuale={stato.email} />
        </section>

        <section className="card p-4">
          <h2 className="text-sm font-semibold">Password</h2>
          <p className="mb-3 mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
            Cambiandola, le sessioni aperte altrove cadono. Questa resta.
          </p>
          <CambiaPassword azione={cambiaPasswordAdmin} temporanea={stato.daCambiare} />
        </section>

        <section className="card p-4">
          <h2 className="text-sm font-semibold">Verifica in due passaggi</h2>
          <p className="mb-3 mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
            Un secondo passaggio dopo la password: se la password gira, da sola
            non basta più a entrare.
          </p>
          <DueFattori
            metodo={stato.metodo}
            email={stato.email}
            obbligatoria={false}
            segretiDisponibili={stato.segretiDisponibili}
            preparaApp={preparaAppAdmin}
            confermaApp={confermaAppAdmin}
            preparaPosta={preparaPostaAdmin}
            confermaPosta={confermaPostaAdmin}
            spegni={spegniAdmin}
          />
          <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
            Se perdi il telefono e resti fuori, si rientra dal server:{" "}
            <code>npx tsx scripts/cambia-password-admin.ts</code> rimette la
            password, e da lì la verifica si rifà.
          </p>
        </section>
      </main>
    </div>
  );
}
