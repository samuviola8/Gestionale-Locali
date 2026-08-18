ALTER TABLE "menu_products" ADD COLUMN "requires_glasses" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "glasses" integer;