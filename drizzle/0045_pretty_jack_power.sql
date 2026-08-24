ALTER TABLE "orders" ADD COLUMN "web_token" text;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_web_token_unique" UNIQUE("web_token");