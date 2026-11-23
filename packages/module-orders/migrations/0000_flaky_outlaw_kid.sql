CREATE TABLE "orders_idempotency" (
	"buyer_ref" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"order_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_idempotency_pk" PRIMARY KEY("buyer_ref","idempotency_key"),
	CONSTRAINT "orders_idempotency_status_check" CHECK ("orders_idempotency"."status" in ('pending', 'completed'))
);
--> statement-breakpoint
CREATE TABLE "orders_order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"catalog_item_id" text NOT NULL,
	"position" integer NOT NULL,
	"quantity" integer NOT NULL,
	"name_snapshot" text NOT NULL,
	"unit_amount_snapshot" integer NOT NULL,
	"currency_snapshot" char(3) NOT NULL,
	"extension_kind" text NOT NULL,
	"details_schema_version" integer NOT NULL,
	"details_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_items_quantity_check" CHECK ("orders_order_items"."quantity" > 0),
	CONSTRAINT "orders_order_items_unit_amount_check" CHECK ("orders_order_items"."unit_amount_snapshot" >= 0),
	CONSTRAINT "orders_order_items_details_schema_version_check" CHECK ("orders_order_items"."details_schema_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "orders_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"buyer_kind" text NOT NULL,
	"buyer_ref" text NOT NULL,
	"idempotency_key" text,
	"request_hash" text,
	"total_amount" integer NOT NULL,
	"currency" char(3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_orders_buyer_kind_check" CHECK ("orders_orders"."buyer_kind" = 'user'),
	CONSTRAINT "orders_orders_status_check" CHECK ("orders_orders"."status" = 'confirmed')
);
--> statement-breakpoint
ALTER TABLE "orders_order_items" ADD CONSTRAINT "orders_order_items_order_id_orders_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders_order_items" ADD CONSTRAINT "orders_order_items_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_order_items_order_position_unique" ON "orders_order_items" USING btree ("order_id","position");--> statement-breakpoint
CREATE INDEX "orders_order_items_order_id_idx" ON "orders_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_orders_buyer_idempotency_key_unique" ON "orders_orders" USING btree ("buyer_ref","idempotency_key");--> statement-breakpoint
CREATE INDEX "orders_orders_buyer_created_at_idx" ON "orders_orders" USING btree ("buyer_ref","created_at","id");