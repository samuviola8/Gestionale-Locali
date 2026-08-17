CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"party_size" integer NOT NULL,
	"table_numbers" integer[] DEFAULT '{}' NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"customer_email" text,
	"notes" text,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"previous_starts_at" timestamp with time zone,
	"notified_at" timestamp with time zone,
	"source" text DEFAULT 'web' NOT NULL,
	"token" text NOT NULL,
	"seated_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "restaurant_tables" ADD COLUMN "seats" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurant_tables" ADD COLUMN "bookable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "reservation_slot_minutes" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "reservation_duration_minutes" integer DEFAULT 105 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "reservation_min_party" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "reservation_max_party" integer DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "reservation_lead_minutes" integer DEFAULT 120 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "reservation_horizon_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "reservation_auto_confirm" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "reservation_max_join" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "reservation_extra_seats" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "smtp_host" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "smtp_port" integer DEFAULT 465 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "smtp_user" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "smtp_pass" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "reservation_note" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservations_tenant_start_idx" ON "reservations" USING btree ("tenant_id","starts_at");