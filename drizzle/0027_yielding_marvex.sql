ALTER TABLE "tenants" ADD COLUMN "call_sound" text DEFAULT 'campanello' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "call_blink" boolean DEFAULT true NOT NULL;