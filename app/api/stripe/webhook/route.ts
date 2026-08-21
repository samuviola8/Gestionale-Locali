import { NextResponse } from "next/server";
import { stripe, stripeConfigurato } from "@/lib/stripe/client";
import { gestisciEvento } from "@/lib/stripe/eventi";

// Dove Stripe viene a raccontarci cosa e' successo.
//
// E' l'unico punto della piattaforma che accetta ordini da fuori senza che ci
// sia un utente collegato, e quindi l'unico che va difeso con la firma: senza
// quel controllo chiunque conosca l'indirizzo potrebbe mandarci un
// "invoice.paid" scritto a mano e farsi segnare un incasso mai arrivato.
//
// Il segreto della firma NON e' la chiave segreta di Stripe: e' un secondo
// valore, uno per ogni webhook, che Stripe mostra quando lo si crea.

// Node e non edge: la verifica della firma vuole crypto, e il corpo va letto
// grezzo. Con il body gia' passato da un parser la firma non torna mai piu'.
export const runtime = "nodejs";
// Nessuna cache: e' un endpoint che scrive.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const segreto = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  if (!stripeConfigurato() || !segreto) {
    // 503 e non 200: dire "va bene" a Stripe mentre non si e' in grado di
    // registrare niente vuol dire perdere l'avviso per sempre, perche' un
    // evento accettato non viene piu' riprovato. Con questo invece resta in
    // coda e arriva quando le chiavi ci sono.
    return NextResponse.json(
      { errore: "Stripe non e' configurato su questo server." },
      { status: 503 }
    );
  }

  const firma = req.headers.get("stripe-signature");
  if (!firma) {
    return NextResponse.json({ errore: "Firma mancante." }, { status: 400 });
  }

  // Il corpo esattamente com'e' arrivato, byte per byte. Riserializzarlo dopo
  // un JSON.parse cambierebbe spazi e ordine dei campi, e la firma non
  // tornerebbe.
  const corpo = await req.text();

  let evento;
  try {
    evento = stripe().webhooks.constructEvent(corpo, firma, segreto);
  } catch (e) {
    // 400 e non 500: 400 dice a Stripe che il messaggio non va bene e di non
    // riprovarlo. Un 500 lo farebbe ritentare per tre giorni con la stessa
    // firma sbagliata.
    console.error("[stripe] firma non valida:", e);
    return NextResponse.json({ errore: "Firma non valida." }, { status: 400 });
  }

  try {
    const esito = await gestisciEvento(evento);
    console.log(`[stripe] ${evento.type}: ${esito}`);
    return NextResponse.json({ ok: true, esito });
  } catch (e) {
    // Qui il 500 ci vuole: il messaggio era buono, siamo noi che non siamo
    // riusciti a scriverlo. Stripe lo ripropone, e la seconda volta trova il
    // database in piedi. E' anche il motivo per cui gli incassi controllano
    // `provider_ref` prima di scrivere: il secondo tentativo non deve
    // incassare due volte.
    console.error(`[stripe] ${evento.type} non gestito:`, e);
    return NextResponse.json({ errore: "Errore interno." }, { status: 500 });
  }
}
