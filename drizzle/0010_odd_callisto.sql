CREATE TABLE "table_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"table_number" integer NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "table_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "tenant_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"module_key" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"config" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_modules_tenant_id_module_key_unique" UNIQUE("tenant_id","module_key")
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "legal_name" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "province" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "postal_code" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "contact_name" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "theme_preset" text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "brand_color" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "brand_accent" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "default_theme" text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "table_session_minutes" integer DEFAULT 120 NOT NULL;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_table_id_restaurant_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."restaurant_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_modules" ADD CONSTRAINT "tenant_modules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "table_sessions_tenant_table_idx" ON "table_sessions" USING btree ("tenant_id","table_number");