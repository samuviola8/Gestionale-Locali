import { getTenantFromHost } from "@/lib/tenant-host";

export default async function Home() {
  const tenant = await getTenantFromHost();

  // Sottodominio di un locale -> home del locale.
  if (tenant) {
    if (tenant.suspended) {
      return (
        <main className="mx-auto max-w-md px-6 py-16 text-center">
          <h1 className="text-xl font-medium">{tenant.name}</h1>
          <p className="mt-2 text-neutral-500">
            Temporaneamente non disponibile.
          </p>
        </main>
      );
    }
    return (
      <main className="mx-auto max-w-md px-6 py-16">
        <p className="text-sm text-neutral-500">Benvenuto da</p>
        <h1 className="mt-1 text-3xl font-medium">{tenant.name}</h1>
        <p className="mt-6 text-neutral-600">
          Inquadra il QR sul tuo tavolo per vedere il menu e ordinare.
        </p>
        <a
          href="/t/7"
          className="mt-6 inline-block rounded-lg bg-[var(--brand)] px-5 py-2.5 text-[var(--brand-on)]"
        >
          Simula il tavolo 7
        </a>
      </main>
    );
  }

  // Dominio radice -> landing pubblica.
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <span className="inline-flex items-center gap-2 rounded-full bg-[var(--brand-50)] px-3 py-1 text-sm text-[var(--brand-text)]">
        MVP · work in progress
      </span>

      <h1 className="mt-6 text-4xl font-medium tracking-tight">Comanda</h1>

      <p className="mt-4 text-lg text-neutral-600">
        Ordina al tavolo con un QR, manda gli ordini in coda allo staff e dividi
        il conto. Senza app, senza attese.
      </p>

      <div className="mt-8 flex gap-3">
        <a href="#" className="rounded-lg bg-[var(--brand)] px-5 py-2.5 text-[var(--brand-on)]">
          Prova gratis
        </a>
        <a href="#" className="rounded-lg border border-neutral-200 px-5 py-2.5">
          Guarda la demo
        </a>
      </div>

      <p className="mt-12 text-sm text-neutral-500">
        Demo: apri{" "}
        <code className="rounded bg-neutral-100 px-1.5 py-0.5">
          bar-centrale.localhost:3000
        </code>{" "}
        per vedere un locale, oppure{" "}
        <code className="rounded bg-neutral-100 px-1.5 py-0.5">
          bar-centrale.localhost:3000/t/7
        </code>{" "}
        per il tavolo 7.
      </p>
    </main>
  );
}
