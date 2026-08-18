// Il catalogo delle skin del menu, in chiaro e senza componenti dentro.
//
// Le skin vere vivono in components/skins, ma quei file sono "use client":
// importati dal server — da un'azione, da una pagina, dalla creazione di un
// locale — arrivano come riferimenti al client, e leggerci dentro `key`
// restituisce `undefined`. Fuori dalla teoria: creare un locale finiva con un
// errore 500, perche' `getSkin(...).key` esplodeva.
//
// Qui c'e' solo quello che al server serve davvero: quali skin esistono e come
// si chiamano. Aggiungendone una va aggiunta in tutte e due le liste — sono
// due righe, e il prezzo per non tirarsi dietro mezzo menu ogni volta che si
// scrive il nome di una skin a database.

export type SkinInfo = { key: string; label: string; description: string };

export const SKIN_DEFAULT = "base";

export const SKIN_CATALOGO: SkinInfo[] = [
  {
    key: "base",
    label: "Base",
    description: "Lista sobria e leggibile. Adatta a qualsiasi locale.",
  },
  {
    key: "noya",
    label: "Noya (lounge notturno)",
    description:
      "Nero profondo, un accento di colore per categoria, card con rilievo 3D allo scorrimento.",
  },
];

/** La chiave da scrivere a database: quella data se esiste, altrimenti la
 *  base. Un valore inventato non deve diventare un menu che non si disegna. */
export function chiaveSkin(valore: string | null | undefined): string {
  return SKIN_CATALOGO.some((s) => s.key === valore) ? valore! : SKIN_DEFAULT;
}
