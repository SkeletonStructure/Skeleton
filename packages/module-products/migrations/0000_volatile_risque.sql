CREATE TABLE "commerce_products" (
	"catalog_item_id" text PRIMARY KEY NOT NULL,
	"sku" text NOT NULL,
	"price_amount" integer NOT NULL,
	"currency" char(3) NOT NULL,
	"weight_grams" integer,
	"shipping_class" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commerce_products_sku_unique" UNIQUE("sku"),
	CONSTRAINT "commerce_products_price_amount_check" CHECK ("commerce_products"."price_amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "commerce_products" ADD CONSTRAINT "commerce_products_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE restrict ON UPDATE no action;