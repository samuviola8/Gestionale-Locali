ALTER TABLE "billing_prices" DROP CONSTRAINT "billing_prices_scope_key";--> statement-breakpoint
ALTER TABLE "billing_prices" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "tenant_billing" ADD COLUMN "pending_pack" text;--> statement-breakpoint
ALTER TABLE "tenant_billing" ADD COLUMN "pending_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant_billing" ADD COLUMN "adjustment_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_billing" ADD COLUMN "adjustment_note" text;--> statement-breakpoint
ALTER TABLE "billing_prices" ADD CONSTRAINT "billing_prices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_prices" ADD CONSTRAINT "billing_prices_scope_key" UNIQUE("scope","key","tenant_id");