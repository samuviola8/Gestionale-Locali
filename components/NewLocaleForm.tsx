"use client";

import { useActionState, useState } from "react";
import type { ThemePreset } from "@/lib/themes";
import type { LocaleProfile } from "@/lib/profiles";
import type { ModuleDef } from "@/lib/modules";
import type { Skin } from "@/components/skins/types";
import type { NewLocaleState } from "@/app/admin/locali/nuovo/actions";

const field =
  "w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm bg-white";
const label = "block text-xs font-medium text-neutral-500 mb-1";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function Step({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="mb-4 flex items-baseline gap-2.5">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-[var(--brand-on)]"
          style={{ background: "var(--brand)" }}
        >
          {n}
        </span>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export default function NewLocaleForm({
  action,
  profiles,
  presets,
  skins,
  modules,
  rootDomain,
}: {
  action: (
    prev: NewLocaleState,
    formData: FormData
  ) => Promise<NewLocaleState>;
  profiles: LocaleProfile[];
  presets: ThemePreset[];
  skins: Skin[];
  modules: ModuleDef[];
  rootDomain: string;
}) {
  const [state, formAction, pending] = useActionState<NewLocaleState, FormData>(
    action,
    {}
  );

  const [profileKey, setProfileKey] = useState(profiles[0]?.key ?? "lounge");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  const profile = profiles.find((p) => p.key === profileKey) ?? profiles[0];
  // Il tema segue il profilo finche' non lo si cambia a mano.
  const [presetKey, setPresetKey] = useState(profile.themePreset);
  const [presetTouched, setPresetTouched] = useState(false);
  const [defaultTheme, setDefaultTheme] = useState(profile.defaultTheme);
  const [themeTouched, setThemeTouched] = useState(false);

  const activePreset =
    presets.find((p) => p.key === (presetTouched ? presetKey : profile.themePreset)) ??
    presets[0];
  const activeTheme = themeTouched ? defaultTheme : profile.defaultTheme;
  const palette = activeTheme === "light" ? activePreset.light : activePreset.dark;

  const effectiveSlug = slugTouched ? slug : slugify(name);

  function pickProfile(key: string) {
    setProfileKey(key);
    setPresetTouched(false);
    setThemeTouched(false);
    const p = profiles.find((x) => x.key === key);
    if (p) {
      setPresetKey(p.themePreset);
      setDefaultTheme(p.defaultTheme);
    }
  }

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div
          role="alert"
          className="rounded-xl border px-4 py-3 text-sm"
          style={{
            borderColor: "#f2b8b5",
            background: "rgba(220,38,38,0.08)",
            color: "#b3261e",
          }}
        >
          {state.error}
        </div>
      )}

      <Step
        n={1}
        title="Tipo di locale"
        hint="Precompila tema, categorie del menu e moduli. Puoi correggere tutto dopo."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {profiles.map((p) => (
            <label
              key={p.key}
              className="flex cursor-pointer gap-2.5 rounded-lg border p-3 text-sm"
              style={{
                borderColor:
                  profileKey === p.key ? "var(--brand)" : "var(--border)",
                background:
                  profileKey === p.key ? "var(--brand-50)" : "transparent",
              }}
            >
              <input
                type="radio"
                name="profile"
                value={p.key}
                checked={profileKey === p.key}
                onChange={() => pickProfile(p.key)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">{p.label}</span>
                <span className="mt-0.5 block text-xs text-neutral-500">
                  {p.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </Step>

      <Step n={2} title="Anagrafica" hint="Serve per i documenti e per ritrovare il locale.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={label}>Nome commerciale *</label>
            <input
              name="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Noya Lounge Bar"
              className={field}
            />
          </div>

          <div className="sm:col-span-2">
            <label className={label}>Indirizzo web *</label>
            <div className="flex items-center gap-1.5">
              <input
                name="slug"
                required
                value={effectiveSlug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(slugify(e.target.value));
                }}
                placeholder="noya-lounge"
                className={field}
              />
              <span className="whitespace-nowrap text-sm text-neutral-500">
                .{rootDomain}
              </span>
            </div>
          </div>

          <div>
            <label className={label}>Ragione sociale</label>
            <input name="legalName" placeholder="Noya Lounge S.r.l.s." className={field} />
          </div>
          <div>
            <label className={label}>Telefono</label>
            <input name="phone" className={field} />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Indirizzo</label>
            <input
              name="address"
              placeholder="Via Antonino di Sangiuliano 40/A"
              className={field}
            />
          </div>
          <div>
            <label className={label}>Citta</label>
            <input name="city" placeholder="Sant'Agata li Battiati" className={field} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>CAP</label>
              <input name="postalCode" placeholder="95030" className={field} />
            </div>
            <div>
              <label className={label}>Provincia</label>
              <input name="province" placeholder="CT" maxLength={2} className={field} />
            </div>
          </div>
          <div>
            <label className={label}>Referente</label>
            <input name="contactName" className={field} />
          </div>
          <div>
            <label className={label}>Email referente</label>
            <input name="contactEmail" type="email" className={field} />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Note interne</label>
            <textarea name="notes" rows={2} className={field} />
          </div>
        </div>
      </Step>

      <Step
        n={3}
        title="Aspetto"
        hint="I colori arrivano dal preset. Gli scostamenti sono opzionali."
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_240px]">
          <div className="space-y-3">
            <div>
              <label className={label}>Preset di tema</label>
              <select
                name="themePreset"
                value={activePreset.key}
                onChange={(e) => {
                  setPresetTouched(true);
                  setPresetKey(e.target.value);
                }}
                className={field}
              >
                {presets.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-neutral-500">
                {activePreset.description}
              </p>
            </div>

            <div>
              <label className={label}>Skin del menu</label>
              <select name="menuSkin" defaultValue="base" className={field}>
                {skins.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-neutral-500">
                Come si presenta il menu al cliente. Il funzionamento non cambia.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Tema di default</label>
                <select
                  name="defaultTheme"
                  value={activeTheme}
                  onChange={(e) => {
                    setThemeTouched(true);
                    setDefaultTheme(e.target.value as typeof defaultTheme);
                  }}
                  className={field}
                >
                  <option value="dark">Scuro</option>
                  <option value="light">Chiaro</option>
                  <option value="system">Come il telefono</option>
                </select>
              </div>
              <div>
                <label className={label}>Logo</label>
                <input
                  name="logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="w-full text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Colore brand (chiaro)</label>
                <input
                  name="brandColor"
                  placeholder="#c9a227"
                  className={field}
                />
              </div>
              <div>
                <label className={label}>Colore brand (scuro)</label>
                <input
                  name="brandAccent"
                  placeholder="lascia vuoto per derivarlo"
                  className={field}
                />
              </div>
            </div>
          </div>

          {/* Anteprima: la stessa intestazione che vedra' il cliente al tavolo. */}
          <div>
            <div className={label}>Anteprima</div>
            <div
              className="overflow-hidden rounded-xl border"
              style={{ background: palette.bg, borderColor: palette.border }}
            >
              <div
                className="px-4 py-5 text-white"
                style={{
                  background: `linear-gradient(135deg, ${palette.heroFrom}, ${palette.heroTo})`,
                }}
              >
                <div
                  className="text-[10px] uppercase tracking-wider"
                  style={{
                    color: `color-mix(in srgb, ${palette.brand} 45%, #ffffff)`,
                  }}
                >
                  Ordina al tavolo
                </div>
                <div
                  className="mt-1 text-lg font-semibold"
                  style={{ fontFamily: activePreset.fontHeading }}
                >
                  {name || "Nome del locale"}
                </div>
              </div>
              <div className="space-y-2 p-3">
                <div
                  className="rounded-lg p-2.5 text-xs"
                  style={{ background: palette.surface, color: palette.text }}
                >
                  <div className="font-semibold">Signature cocktail</div>
                  <div style={{ color: palette.muted }}>Gin, agrumi, tonica</div>
                </div>
                <div
                  className="rounded-lg py-2 text-center text-xs font-medium text-white"
                  style={{ background: palette.brand }}
                >
                  Invia ordine
                </div>
              </div>
            </div>
          </div>
        </div>
      </Step>

      <Step n={4} title="Moduli attivi" hint="Si possono accendere e spegnere in qualsiasi momento.">
        <div className="space-y-2">
          {modules.map((m) => (
            <label
              key={m.key}
              className="flex items-start gap-2.5 rounded-lg border border-neutral-200 p-3 text-sm"
            >
              <input
                type="checkbox"
                name={`modulo_${m.key}`}
                defaultChecked={m.defaultEnabled}
                disabled={m.comingSoon}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="font-medium">{m.label}</span>
                {m.addon && (
                  <span
                    className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{ background: "var(--brand-50)", color: "var(--brand-text)" }}
                  >
                    add-on
                  </span>
                )}
                {m.comingSoon && (
                  <span className="ml-2 text-[10px] text-neutral-400">
                    in sviluppo
                  </span>
                )}
                <span className="mt-0.5 block text-xs text-neutral-500">
                  {m.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </Step>

      <Step n={5} title="Sala" hint="I QR vengono generati subito, uno per tavolo.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>Quanti tavoli</label>
            <input
              name="tableCount"
              type="number"
              min="0"
              max="200"
              defaultValue={0}
              className={field}
            />
            <p className="mt-1 text-xs text-neutral-500">
              Crea i tavoli numerati da 1 a N. Lascia 0 se non li conosci ancora.
            </p>
          </div>
          <div>
            <label className={label}>Coperto a persona</label>
            <input name="coverCharge" placeholder="2,00" className={field} />
            <p className="mt-1 text-xs text-neutral-500">
              In euro. Lascia vuoto se il locale non lo applica.
            </p>
          </div>
          <div>
            <label className={label}>Durata sessione al tavolo (minuti)</label>
            <input
              name="tableSessionMinutes"
              type="number"
              min="15"
              max="1440"
              defaultValue={120}
              className={field}
            />
            <p className="mt-1 text-xs text-neutral-500">
              Scaduta, il cliente deve riscansionare il QR per ordinare.
            </p>
          </div>
        </div>
      </Step>

      <Step n={6} title="Accesso del titolare" hint="Le credenziali per la dashboard del locale.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>Email *</label>
            <input name="ownerEmail" type="email" required className={field} />
          </div>
          <div>
            <label className={label}>Password * (min 8)</label>
            <input
              name="ownerPassword"
              type="password"
              required
              minLength={8}
              className={field}
            />
          </div>
        </div>
      </Step>

      <div className="flex items-center gap-3">
        <button
          disabled={pending}
          className="rounded-lg px-4 py-2.5 text-sm font-medium text-[var(--brand-on)] disabled:opacity-50"
          style={{ background: "var(--brand)" }}
        >
          {pending ? "Creazione in corso..." : "Crea il locale"}
        </button>
        <a href="/admin" className="text-sm text-neutral-500 hover:text-neutral-800">
          Annulla
        </a>
      </div>
    </form>
  );
}
