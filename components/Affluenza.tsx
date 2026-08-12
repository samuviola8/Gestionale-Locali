import type { Analytics } from "@/lib/analytics";

const GIORNI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

// Quando il locale è pieno, giorno per fascia oraria. È la domanda dietro a
// "quanto ho incassato": l'incasso dice com'è andata, questo dice quando
// serve gente dietro al banco.
//
// Server component: nessuno stato, solo <title> per il dettaglio al passaggio
// del mouse. Un tooltip scritto a mano qui non aggiungerebbe niente.
export default function Affluenza({
  dati,
}: {
  dati: Analytics["affluenza"];
}) {
  if (dati.length === 0) {
    return (
      <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
        Nessun ordine in questo periodo.
      </p>
    );
  }

  // Si mostrano solo le ore in cui il locale ha davvero lavorato: una griglia
  // da mezzanotte alle 24 sarebbe per tre quarti vuota.
  const ore = [...new Set(dati.map((d) => d.ora))].sort((a, b) => a - b);
  const dalle = Math.max(0, Math.min(...ore) - 1);
  const alle = Math.min(23, Math.max(...ore) + 1);
  const colonne = Array.from({ length: alle - dalle + 1 }, (_, i) => dalle + i);

  const mappa = new Map(dati.map((d) => [`${d.giorno}:${d.ora}`, d.ordini]));
  const max = Math.max(...dati.map((d) => d.ordini));

  return (
    <div className="scroll-x mt-3">
      <table className="w-full min-w-[420px] border-separate border-spacing-[2px]">
        <thead>
          <tr>
            <th />
            {colonne.map((h) => (
              <th
                key={h}
                className="tnum pb-1 text-[10px] font-normal"
                style={{ color: "var(--muted)" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {GIORNI.map((nome, g) => (
            <tr key={nome}>
              <th
                className="pr-2 text-right text-[10px] font-normal"
                style={{ color: "var(--muted)" }}
              >
                {nome}
              </th>
              {colonne.map((h) => {
                const n = mappa.get(`${g}:${h}`) ?? 0;
                return (
                  <td key={h}>
                    {/* title come attributo, non come tag: <title> vale
                        dentro un SVG, qui siamo in HTML. */}
                    <div
                      title={`${nome} ${h}:00 — ${n} ${n === 1 ? "ordine" : "ordini"}`}
                      className="h-6 rounded-[3px]"
                      style={{
                        background:
                          n === 0
                            ? "var(--surface-2)"
                            : `color-mix(in srgb, var(--brand) ${Math.round(
                                20 + (n / max) * 80
                              )}%, transparent)`,
                      }}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
