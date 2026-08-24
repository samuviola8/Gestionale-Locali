import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, orderItems, reservations } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { richiediServizio } from "@/lib/billing/blocco";
import { formatPrice } from "@/lib/menu";
import { getTenantModules, type ModuleKey } from "@/lib/modules";
import { getAvvio } from "@/lib/avvio";
import { problemiDelLocale } from "@/lib/pronto";
import { STATI_ATTIVI } from "@/lib/prenotazioni";
import { seduteAperte } from "@/lib/sedute";
import ChecklistAvvio from "@/components/ChecklistAvvio";
import ProblemiLocale from "@/components/ProblemiLocale";
import ChiediTestimonianza from "@/components/ChiediTestimonianza";
import { chiediAlGestore, COOKIE_RIMANDA } from "@/lib/recensioni";
import {
  inviaTestimonianza,
  rimandaTestimonianza,
} from "./testimonianza-actions";
import {
  IconOrders,
  IconBill,
  IconMenu,
  IconQr,
  IconCalendar,
  IconSala,
} from "@/components/icons";

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  // Evidenzia il dato che richiede un'azione adesso (gli ordini in coda).
  accent?: boolean;
}) {
  return (
    <div
      className="stat"
      style={
        accent
          ? { borderColor: "var(--brand)", background: "var(--brand-50)" }
          : undefined
      }
    >
      <div className="stat-label">{label}</div>
      <div
        className="stat-value"
        style={accent ? { color: "var(--brand-text)" } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

export default async function DashboardHome() {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  await richiediServizio();

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const todays = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.tenantId, session.tenantId), gte(orders.createdAt, start)));
  const ordersToday = todays.length;

  const todayIds = todays.map((o) => o.id);
  const todayItems = todayIds.length
    ? await db.select().from(orderItems).where(inArray(orderItems.orderId, todayIds))
    : [];
  const incassoToday = todayItems
    .filter((i) => i.paid)
    .reduce((s, i) => s + i.priceCents * i.quantity, 0);

  const open = await db
    .select({ tableNumber: orders.tableNumber, status: orders.status })
    .from(orders)
    .where(and(eq(orders.tenantId, session.tenantId), isNull(orders.closedAt)));
  // I tavoli occupati adesso: quelli con un conto aperto piu' quelli che la
  // sala ha aperto senza che abbiano ancora ordinato. Gli ordini senza tavolo
  // — banco, asporto, domicilio — restano fuori: contarli qui faceva risultare
  // un tavolo occupato in piu' ogni volta che c'era un asporto in coda.
  const occupati = new Set<number>(
    open.map((o) => o.tableNumber).filter((n): n is number => n !== null)
  );
  for (const s of await seduteAperte(session.tenantId)) {
    for (const n of s.tavoli) occupati.add(n);
  }
  const tavoliAperti = occupati.size;
  const inCoda = open.filter(
    (o) => o.status === "new" || o.status === "preparing"
  ).length;

  const today = new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(start);

  // Le scorciatoie seguono i moduli attivi, come le voci del menu laterale.
  const modules = await getTenantModules(session.tenantId);

  // Chi ha prenotato per oggi. Sta accanto agli ordini perche' e' la stessa
  // domanda del turno che comincia: quanta gente aspettiamo stasera.
  const domani = new Date(start);
  domani.setDate(domani.getDate() + 1);
  const prenotazioniOggi = modules.reservations
    ? await db
        .select({ partySize: reservations.partySize })
        .from(reservations)
        .where(
          and(
            eq(reservations.tenantId, session.tenantId),
            gte(reservations.startsAt, start),
            lt(reservations.startsAt, domani),
            inArray(reservations.status, STATI_ATTIVI)
          )
        )
    : [];
  const copertiPrenotati = prenotazioniOggi.reduce((s, r) => s + r.partySize, 0);

  // Cosa manca per essere operativi. Riguarda chi il locale lo configura: a
  // chi sta in sala non serve sapere che mancano gli orari di apertura.
  const avvio =
    session.role === "owner"
      ? await getAvvio(session.tenantId, modules)
      : null;

  // E quello che invece e' gia' acceso e non funziona. Sta sopra la checklist
  // perche' e' rotto adesso, mentre la checklist e' roba ancora da fare.
  const problemi =
    session.role === "owner"
      ? await problemiDelLocale(session.tenantId, modules)
      : [];

  // La domanda al gestore, dopo il primo mese. Solo al titolare: e' lui che
  // il servizio l'ha scelto, e a un turno di sala non si chiede se rifarebbe
  // l'acquisto. Chi ha gia' risposto, o ha appena detto «non adesso», non la
  // vede.
  const chiediMia =
    session.role === "owner" &&
    !(await cookies()).get(COOKIE_RIMANDA) &&
    (await chiediAlGestore(session.tenantId));

  // Come nel menu di sinistra: con piu' moduli basta averne uno acceso.
  const links: {
    href: string;
    label: string;
    desc: string;
    Icon: React.ComponentType<{ size?: number; className?: string }>;
    module?: ModuleKey | ModuleKey[];
  }[] = [
    {
      href: "/dashboard/sala",
      label: "Sala",
      desc: "Chi è seduto e da quanto",
      Icon: IconSala,
      module: ["qr_ordering", "reservations"],
    },
    {
      href: "/dashboard/orders",
      label: "Coda ordini",
      desc: "Ordini in arrivo",
      Icon: IconOrders,
      module: "qr_ordering",
    },
    {
      href: "/dashboard/bill",
      label: "Conti aperti",
      desc: "Incassa e chiudi",
      Icon: IconBill,
      module: "split_bill",
    },
    {
      href: "/dashboard/prenotazioni",
      label: "Prenotazioni",
      desc: "Chi arriva stasera",
      Icon: IconCalendar,
      module: "reservations",
    },
    { href: "/dashboard/menu", label: "Menu", desc: "Prodotti e foto", Icon: IconMenu },
    {
      href: "/dashboard/tables",
      label: "Tavoli e QR",
      desc: "Genera i codici",
      Icon: IconQr,
      module: "qr_ordering",
    },
  ];

  const scorciatoie = links.filter((l) =>
    !l.module
      ? true
      : Array.isArray(l.module)
        ? l.module.some((k) => modules[k])
        : modules[l.module]
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{session.tenantName}</h1>
        <p className="mt-0.5 text-sm capitalize" style={{ color: "var(--muted)" }}>
          {today}
        </p>
      </div>

      <ProblemiLocale problemi={problemi} />

      {avvio && <ChecklistAvvio avvio={avvio} />}

      {chiediMia && (
        <ChiediTestimonianza
          nomeLocale={session.tenantName}
          invia={inviaTestimonianza}
          rimanda={rimandaTestimonianza}
        />
      )}

      <div
        className={
          "grid grid-cols-2 gap-3 " +
          (modules.reservations ? "sm:grid-cols-3 lg:grid-cols-5" : "sm:grid-cols-4")
        }
      >
        <Stat label="In coda adesso" value={inCoda} accent={inCoda > 0} />
        <Stat label="Tavoli aperti" value={tavoliAperti} />
        {modules.reservations && (
          <Stat
            label="Coperti prenotati"
            value={`${copertiPrenotati}${
              prenotazioniOggi.length ? ` · ${prenotazioniOggi.length} tav.` : ""
            }`}
          />
        )}
        <Stat label="Ordini oggi" value={ordersToday} />
        <Stat label="Incasso oggi" value={formatPrice(incassoToday)} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>
          Gestione
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {scorciatoie.map(({ href, label, desc, Icon }) => (
            <Link
              key={href}
              href={href}
              className="card p-4 transition hover:-translate-y-0.5 hover:shadow-sm"
            >
              <div
                className="flex h-9 w-9 items-center justify-center rounded-lg"
                style={{
                  background: "var(--brand-50)",
                  color: "var(--brand-text)",
                }}
              >
                <Icon size={18} />
              </div>
              <div className="mt-3 font-medium">{label}</div>
              <div className="text-sm" style={{ color: "var(--muted)" }}>
                {desc}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
