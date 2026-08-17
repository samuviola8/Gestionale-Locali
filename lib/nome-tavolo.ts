// Il nome di chi ordina, ricordato sul suo telefono.
//
// Sta in un cookie e non in localStorage per una ragione sola: la pagina del
// tavolo e' resa dal server, e con un cookie il nome c'e' gia' al primo
// disegno. Con localStorage la domanda "come ti chiami?" comparirebbe per un
// istante a ogni ricarica, per poi sparire da sola: peggio che chiederlo.
//
// Nessun dato delicato: e' il nome che il cliente scrive per farsi riconoscere
// al tavolo, e serve solo a non doverlo riscrivere.

export function cookieNome(tenantId: string): string {
  return "comanda_nome_" + tenantId;
}

// Il nome vale finche' dura la sessione aperta col QR, e la sessione si
// riconosce dal suo istante di scadenza: cambia a ogni scansione. Cosi' quando
// lo staff chiude il tavolo e il cliente dopo riscansiona, il telefono non si
// porta addosso il nome di chi era seduto prima.
export function marcaSessione(expiresAt: Date): string {
  return String(expiresAt.getTime());
}

export function valoreRicordo(nome: string, marca: string): string {
  return encodeURIComponent(`${marca}|${nome}`);
}

// Il nome ricordato, ma solo se e' di questa sessione. Il nome puo' contenere
// una barra verticale: si divide sulla prima e il resto e' tutto nome.
export function nomeRicordato(
  raw: string | undefined,
  marca: string
): string | null {
  if (!raw) return null;
  let decodificato: string;
  try {
    decodificato = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const taglio = decodificato.indexOf("|");
  if (taglio < 0) return null;
  const nome = decodificato.slice(taglio + 1).trim();
  return decodificato.slice(0, taglio) === marca && nome ? nome : null;
}
