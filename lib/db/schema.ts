import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  unique,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Schema database.

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  customDomain: text("custom_domain").unique(),
  suspended: boolean("suspended").notNull().default(false),

  // Anagrafica del locale: serve in fase di onboarding e sui documenti.
  legalName: text("legal_name"),
  address: text("address"),
  city: text("city"),
  province: text("province"),
  postalCode: text("postal_code"),
  phone: text("phone"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  notes: text("notes"),

  // Branding: il preset vive nel codice (lib/themes.ts), qui solo la scelta
  // e gli scostamenti del singolo locale. Null = usa il valore del preset.
  themePreset: text("theme_preset").notNull().default("default"),
  brandColor: text("brand_color"),
  brandAccent: text("brand_accent"),
  logoUrl: text("logo_url"),
  // "dark" | "light" | "system": default proposto al cliente al primo accesso.
  defaultTheme: text("default_theme").notNull().default("system"),

  // Skin del menu: decide SOLO come si presenta la pagina cliente (layout,
  // animazioni, accenti). La logica di ordine e carrello e' la stessa per tutti.
  menuSkin: text("menu_skin").notNull().default("base"),

  // Durata della sessione tavolo aperta scansionando il QR.
  tableSessionMinutes: integer("table_session_minutes").notNull().default(120),

  // Coperto: prezzo fisso a persona, addebitato a ciascun commensale.
  // 0 = il locale non lo applica.
  coverChargeCents: integer("cover_charge_cents").notNull().default(0),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Moduli attivi per locale. Il catalogo dei moduli vive in lib/modules.ts:
// qui si registra solo lo stato per tenant, cosi' aggiungere un modulo nuovo
// non richiede una migrazione.
export const tenantModules = pgTable(
  "tenant_modules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    moduleKey: text("module_key").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    config: jsonb("config"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.tenantId, table.moduleKey)]
);

export const restaurantTables = pgTable(
  "restaurant_tables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.tenantId, table.number)]
);

export const menuCategories = pgTable("menu_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const menuProducts = pgTable("menu_products", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => menuCategories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  ingredients: text("ingredients")
    .array()
    .notNull()
    .default(sql`'{}'`),
  allergens: text("allergens")
    .array()
    .notNull()
    .default(sql`'{}'`),
  priceCents: integer("price_cents").notNull(),
  available: boolean("available").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Formati alternativi dello stesso prodotto: "Porzione"/"Shot" per i
// distillati, "Piccola"/"Media" per le birre. Un prodotto senza varianti usa
// il proprio price_cents e si ordina con un tocco solo.
export const menuProductVariants = pgTable(
  "menu_product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => menuProducts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    priceCents: integer("price_cents").notNull(),
    available: boolean("available").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.productId, table.name)]
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("staff"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.tenantId, table.email)]
);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  tableNumber: integer("table_number").notNull(),
  status: text("status").notNull().default("new"),
  // Quante persone sono sedute al tavolo. Serve per dividere le voci
  // condivise e per contare i coperti; lo dichiara il cliente alla prima
  // consumazione condivisa, lo staff puo' correggerlo dal conto.
  partySize: integer("party_size"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => menuProducts.id, {
    onDelete: "set null",
  }),
  variantId: uuid("variant_id").references(() => menuProductVariants.id, {
    onDelete: "set null",
  }),
  // Snapshot: nome e prezzo restano quelli del momento dell'ordine, anche se
  // il menu cambia dopo. Per una variante il nome include il formato.
  name: text("name").notNull(),
  priceCents: integer("price_cents").notNull(),
  quantity: integer("quantity").notNull().default(1),
  alias: text("alias"),
  paid: boolean("paid").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Quota condivisa e coperto non sono righe d'ordine: si calcolano sul conto.
// Qui si registra chi li ha gia' saldati, altrimenti incassare una persona
// lascerebbe la sua parte di condiviso senza traccia. Le righe spariscono
// alla chiusura del tavolo.
export const billSettlements = pgTable(
  "bill_settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    tableNumber: integer("table_number").notNull(),
    alias: text("alias").notNull(),
    // Quanto ha effettivamente pagato. Congelarlo evita che, cambiando dopo
    // il numero di persone, cambi anche quello che uno ha gia' versato.
    amountCents: integer("amount_cents").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique().on(table.tenantId, table.tableNumber, table.alias)]
);

// Gestore del servizio (super-admin), separato dagli utenti dei locali.
export const platformAdmins = pgTable("platform_admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const adminSessions = pgTable("admin_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  adminId: uuid("admin_id")
    .notNull()
    .references(() => platformAdmins.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Sessione aperta scansionando il QR del tavolo. Ha una scadenza: quando
// scade il cliente deve riscansionare il codice, cosi' il link non resta
// valido per sempre una volta uscito dal locale.
export const tableSessions = pgTable(
  "table_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    tableId: uuid("table_id")
      .notNull()
      .references(() => restaurantTables.id, { onDelete: "cascade" }),
    tableNumber: integer("table_number").notNull(),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // Valorizzato quando lo staff chiude il conto: invalida i telefoni al tavolo.
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("table_sessions_tenant_table_idx").on(table.tenantId, table.tableNumber)]
);

// Chiamate del cameriere al tavolo (separate dagli ordini).
export const waiterCalls = pgTable("waiter_calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  tableNumber: integer("table_number").notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
