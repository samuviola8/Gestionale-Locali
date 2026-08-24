import { NextResponse } from "next/server";
import { localeDalSito, ordinePerToken } from "@/lib/ordini-web";

// A che punto e' un ordine, per la pagina che il cliente tiene aperta mentre
// aspetta.
//
// Aperta a chiunque abbia il token, che e' il punto: e' l'unica chiave di
// quell'ordine e non apre niente altro. Torna il minimo che serve a disegnare
// la riga dei passi — nome e telefono del cliente li ha gia' la pagina, e da
// qui non escono di nuovo a ogni sondaggio.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const locale = await localeDalSito();
  if (!locale) return NextResponse.json({ ok: false }, { status: 404 });

  const ordine = await ordinePerToken(locale.tenantId, token);
  if (!ordine) return NextResponse.json({ ok: false }, { status: 404 });

  return NextResponse.json({
    ok: true,
    fase: ordine.fase,
    quando: ordine.quando?.toISOString() ?? null,
    readyAt: ordine.readyAt?.toISOString() ?? null,
    outAt: ordine.outAt?.toISOString() ?? null,
    // Il totale puo' cambiare mentre si aspetta: il locale annulla una voce
    // finita, o corregge il costo di consegna accettando.
    totaleCents: ordine.totaleCents,
    consegnaCents: ordine.consegnaCents,
  });
}
