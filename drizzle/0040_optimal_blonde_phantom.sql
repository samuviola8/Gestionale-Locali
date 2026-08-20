CREATE TABLE "tenant_custom_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"label" text DEFAULT 'Su misura' NOT NULL,
	"descrizione" text,
	"moduli" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mensile_cents" integer DEFAULT 0 NOT NULL,
	"annuale_cents" integer DEFAULT 0 NOT NULL,
	"attivazione_cents" integer DEFAULT 0 NOT NULL,
	"assistenza_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_custom_packs_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
ALTER TABLE "tenant_custom_packs" ADD CONSTRAINT "tenant_custom_packs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;