ALTER TABLE "menu_products" ADD COLUMN "takeaway_available" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_products" ADD COLUMN "delivery_available" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "web_order_takeaway" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "web_order_delivery" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "web_order_slot_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "web_order_takeaway_lead_minutes" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "web_order_delivery_lead_minutes" integer DEFAULT 40 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "web_order_horizon_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "web_order_pieces_per_slot" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "web_order_auto_accept" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "web_order_note" text;