CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"kind" text DEFAULT 'canone' NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"number" integer,
	"kind" text DEFAULT 'fattura' NOT NULL,
	"status" text DEFAULT 'bozza' NOT NULL,
	"issued_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"vat_rate_bps" integer DEFAULT 0 NOT NULL,
	"vat_cents" integer DEFAULT 0 NOT NULL,
	"stamp_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"seller_snapshot" jsonb,
	"buyer_snapshot" jsonb,
	"vat_note" text,
	"sdi_status" text,
	"sdi_id" text,
	"sdi_sent_at" timestamp with time zone,
	"sdi_error" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_numero_anno" UNIQUE("year","number")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid,
	"amount_cents" integer NOT NULL,
	"method" text DEFAULT 'bonifico' NOT NULL,
	"provider_ref" text,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_provider_ref" UNIQUE("provider_ref")
);
--> statement-breakpoint
CREATE TABLE "tenant_billing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"model" text DEFAULT 'abbonamento' NOT NULL,
	"pack" text DEFAULT 'sala' NOT NULL,
	"period" text DEFAULT 'mensile' NOT NULL,
	"recurring_cents" integer DEFAULT 0 NOT NULL,
	"activation_cents" integer DEFAULT 0 NOT NULL,
	"activation_invoiced_at" timestamp with time zone,
	"transaction_bps" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'prova' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"next_invoice_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"provider" text DEFAULT 'manuale' NOT NULL,
	"provider_customer_id" text,
	"provider_subscription_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_billing_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "vat_number" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "tax_code" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "sdi_code" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "pec_email" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "billing_email" text;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_billing" ADD CONSTRAINT "tenant_billing_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_lines_invoice_idx" ON "invoice_lines" USING btree ("invoice_id","position");--> statement-breakpoint
CREATE INDEX "invoices_tenant_idx" ON "invoices" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "payments_tenant_idx" ON "payments" USING btree ("tenant_id","paid_at");