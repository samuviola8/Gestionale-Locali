import { notFound } from "next/navigation";
import { getTenantFromHost } from "@/lib/tenant-host";
import RecuperoForm from "./RecuperoForm";

export default async function RecuperoPage() {
  const t = await getTenantFromHost();
  if (!t) notFound();

  return (
    <main className="mx-auto max-w-sm px-6 py-20">
      <h1 className="text-2xl font-medium">{t.name}</h1>
      <p className="mt-1 text-sm text-neutral-500">Password dimenticata</p>
      <RecuperoForm />
    </main>
  );
}
