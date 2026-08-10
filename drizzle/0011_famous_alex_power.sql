CREATE TABLE "menu_product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price_cents" integer NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "menu_product_variants_product_id_name_unique" UNIQUE("product_id","name")
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "variant_id" uuid;--> statement-breakpoint
ALTER TABLE "menu_product_variants" ADD CONSTRAINT "menu_product_variants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_product_variants" ADD CONSTRAINT "menu_product_variants_product_id_menu_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."menu_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_menu_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."menu_product_variants"("id") ON DELETE set null ON UPDATE no action;