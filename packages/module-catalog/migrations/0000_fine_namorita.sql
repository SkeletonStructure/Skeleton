CREATE TABLE "catalog_items" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_items_slug_unique" UNIQUE("slug"),
	CONSTRAINT "catalog_items_status_check" CHECK ("catalog_items"."status" in ('active', 'archived'))
);
--> statement-breakpoint
CREATE INDEX "catalog_items_status_created_at_idx" ON "catalog_items" USING btree ("status","created_at");