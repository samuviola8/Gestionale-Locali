import { richiediAdmin } from "@/lib/admin-auth";
import { THEME_PRESETS } from "@/lib/themes";
import { PROFILES } from "@/lib/profiles";
import { MODULES } from "@/lib/modules";
import { SKIN_CATALOGO } from "@/lib/skins";
import NewLocaleForm from "@/components/NewLocaleForm";
import { submitNewLocale } from "./actions";

export default async function NuovoLocalePage() {
  await richiediAdmin();

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
          skins={SKIN_CATALOGO}
          modules={MODULES}
          rootDomain={rootDomain}
        />
      </main>
    </div>
  );
}
