import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/admin-auth";
import { THEME_PRESETS } from "@/lib/themes";
import { PROFILES } from "@/lib/profiles";
import { MODULES } from "@/lib/modules";
import { SKINS } from "@/components/skins";
import NewLocaleForm from "@/components/NewLocaleForm";
import { submitNewLocale } from "./actions";

export default async function NuovoLocalePage() {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <main className="mx-auto max-w-3xl space-y-5 px-6 py-8">
        <div>
          <a href="/admin" className="text-sm text-neutral-500 hover:text-neutral-800">
            ← Torna alla panoramica
          </a>
          <h1 className="mt-2 text-2xl font-semibold">Nuovo locale</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Tutto quello che serve per avere un locale pronto alla demo. Nessun
            passaggio richiede di toccare il codice.
          </p>
        </div>

        <NewLocaleForm
          action={submitNewLocale}
          profiles={PROFILES}
          presets={THEME_PRESETS}
          skins={SKINS}
          modules={MODULES}
          rootDomain={rootDomain}
        />
      </main>
    </div>
  );
}
