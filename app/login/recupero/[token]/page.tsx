import { notFound } from "next/navigation";
import { getTenantFromHost } from "@/lib/tenant-host";
import { leggiRichiestaReset } from "@/lib/account";
import NuovaPasswordForm from "./NuovaPasswordForm";

// La pagina che apre chi ha cliccato il link della mail. Fino a qui la
// password è ancora quella di prima: cambia solo quando questo modulo viene
// spedito.

export default async function NuovaPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const t = await getTenantFromHost();
  if (!t) notFound();

  const { token } = await params;
  const richiesta = await leggiRichiestaReset(token);

  return (
    <main className="mx-auto max-w-sm px-6 py-20">
      <h1 className="text-2xl font-medium">{t.name}</h1>
      <p className="mt-1 text-sm text-neutral-500">Scegli la tua password</p>

      {richiesta.ok ? (
        <NuovaPasswordForm token={token} />
      ) : (
        <div className="mt-8 space-y-4">
          <p className="text-sm text-red-600">{richiesta.errore}</p>
          <a
            href="/login/recupero"
            className="block w-full rounded-lg bg-[var(--brand)] px-4 py-2.5 text-center text-[var(--brand-on)]"
          >
            Chiedi un altro link
          </a>
        </div>
      )}
    </main>
  );
}
