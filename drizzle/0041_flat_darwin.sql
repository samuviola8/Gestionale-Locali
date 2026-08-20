CREATE TABLE "table_sittings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"table_numbers" integer[] DEFAULT '{}' NOT NULL,
	"main_table" integer NOT NULL,
	"party_size" integer,
	"reservation_id" uuid,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "table_sittings" ADD CONSTRAINT "table_sittings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sittings" ADD CONSTRAINT "table_sittings_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "table_sittings_tenant_open_idx" ON "table_sittings" USING btree ("tenant_id","closed_at");