CREATE TABLE "users_role_permissions" (
	"role" text NOT NULL,
	"permission" text NOT NULL,
	CONSTRAINT "users_role_permissions_role_permission_pk" PRIMARY KEY("role","permission")
);
--> statement-breakpoint
CREATE TABLE "users_user_roles" (
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "users_user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "users_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "users_user_roles" ADD CONSTRAINT "users_user_roles_user_id_users_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_role_permissions_permission_idx" ON "users_role_permissions" USING btree ("permission");
--> statement-breakpoint
INSERT INTO "users_role_permissions" ("role", "permission") VALUES
  ('user', 'users:read:self'),
  ('user', 'users:update:self')
ON CONFLICT ("role", "permission") DO NOTHING;