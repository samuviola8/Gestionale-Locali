import { notFound } from "next/navigation";
import { getTenantFromHost } from "@/lib/tenant-host";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const t = await getTenantFromHost();
  if (!t) notFound();

  if (t.suspended) {
    return (
      <main className="mx-auto max-w-sm px-6 py-20 text-center">
        <h1 className="text-2xl font-medium">{t.name}</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Locale temporaneamente sospeso. Contatta l&apos;assistenza.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-20">
      <LoginForm tenantName={t.name} />
    </main>
  );
}
