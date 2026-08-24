ALTER TABLE "tenants" ADD COLUMN "delivery_bands" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "delivery_free_over_cents" integer DEFAULT 0 NOT NULL;