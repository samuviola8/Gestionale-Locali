ALTER TABLE "menu_products" ADD COLUMN "accepts_note" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "price_adjusted" boolean DEFAULT false NOT NULL;