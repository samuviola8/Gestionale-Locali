import { NextResponse } from "next/server";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { printJobs } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";

// Lavori di stampa ancora da fare. Il dispositivo chiede solo quelli dei
// reparti che ha dichiarato di servire: due postazioni sulla stessa rete non
// devono stampare l'una la comanda dell'altra.
export async function GET(req: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ jobs: [] }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const richiesti = (searchParams.get("reparti") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // "generale" e' la pseudo-chiave delle voci senza reparto e dello scontrino
  // del conto, che non appartengono a nessuna postazione.
  const vuoleGenerale = richiesti.includes("generale");
  const ids = richiesti.filter((r) => r !== "generale");

  if (!ids.length && !vuoleGenerale) return NextResponse.json({ jobs: [] });

  const jobs = await db
    .select()
    .from(printJobs)
    .where(
      and(
        eq(printJobs.tenantId, session.tenantId),
        isNull(printJobs.printedAt),
        ids.length && vuoleGenerale
          ? undefined
          : ids.length
            ? inArray(printJobs.repartoId, ids)
            : isNull(printJobs.repartoId)
      )
    )
    .orderBy(asc(printJobs.createdAt))
    .limit(20);

  // Con reparti espliciti piu' il generale il filtro si fa qui: metterlo nella
  // query vorrebbe dire un OR fra inArray e isNull, che regge male il caso
  // in cui l'elenco e' vuoto.
  const filtrati =
    ids.length && vuoleGenerale
      ? jobs.filter((j) => j.repartoId === null || ids.includes(j.repartoId))
      : jobs;

  return NextResponse.json({
    jobs: filtrati.map((j) => ({ id: j.id, payload: j.payload })),
  });
}
