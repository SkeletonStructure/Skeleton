CREATE TABLE "demo_ecommerce_cart_items" (
	"buyer_ref" text NOT NULL,
	"catalog_item_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "demo_ecommerce_cart_items_buyer_ref_catalog_item_id_pk" PRIMARY KEY("buyer_ref","catalog_item_id"),
	CONSTRAINT "demo_ecommerce_cart_items_quantity_check" CHECK ("demo_ecommerce_cart_items"."quantity" between 1 and 99)
);
--> statement-breakpoint
CREATE TABLE "demo_ecommerce_carts" (
	"buyer_ref" text PRIMARY KEY NOT NULL,
	"last_idempotency_key" text,
	"last_order_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "demo_ecommerce_cart_items" ADD CONSTRAINT "demo_ecommerce_cart_items_buyer_ref_demo_ecommerce_carts_buyer_ref_fk" FOREIGN KEY ("buyer_ref") REFERENCES "public"."demo_ecommerce_carts"("buyer_ref") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_ecommerce_cart_items" ADD CONSTRAINT "demo_ecommerce_cart_items_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE restrict ON UPDATE no action;