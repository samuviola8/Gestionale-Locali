CREATE TABLE "billing_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"mensile_cents" integer DEFAULT 0 NOT NULL,
	"annuale_cents" integer DEFAULT 0 NOT NULL,
	"attivazione_cents" integer DEFAULT 0 NOT NULL,
	"assistenza_cents" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_prices_scope_key" UNIQUE("scope","key")
);
--> statement-breakpoint
CREATE TABLE "billing_settings" (
	"id" text PRIMARY KEY DEFAULT 'unico' NOT NULL,
	"trial_days" integer DEFAULT 30 NOT NULL,
	"transaction_bps" integer DEFAULT 40 NOT NULL,
	"grace_days" integer DEFAULT 10 NOT NULL,
	"auto_suspend" boolean DEFAULT false NOT NULL,
	"suspend_expired_trials" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_addons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"module_key" text NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_addons_tenant_module" UNIQUE("tenant_id","module_key")
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "service_blocked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "blocked_reason" text;--> statement-breakpoint
ALTER TABLE "tenant_addons" ADD CONSTRAINT "tenant_addons_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;