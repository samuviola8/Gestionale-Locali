CREATE TABLE "bill_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"table_number" integer NOT NULL,
	"alias" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bill_settlements_tenant_id_table_number_alias_unique" UNIQUE("tenant_id","table_number","alias")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "party_size" integer;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "cover_charge_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bill_settlements" ADD CONSTRAINT "bill_settlements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;