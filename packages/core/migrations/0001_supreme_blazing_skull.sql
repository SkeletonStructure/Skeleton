CREATE TABLE "core_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"request_id" text,
	"actor_id" text,
	"subject_id" text,
	"action" text NOT NULL,
	"outcome" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "core_audit_events_outcome_check" CHECK ("core_audit_events"."outcome" in ('success', 'failure'))
);
--> statement-breakpoint
CREATE INDEX "core_audit_events_occurred_at_idx" ON "core_audit_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "core_audit_events_actor_id_idx" ON "core_audit_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "core_audit_events_request_id_idx" ON "core_audit_events" USING btree ("request_id");--> statement-breakpoint
CREATE FUNCTION "core_audit_events_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'core_audit_events is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "core_audit_events_no_update" BEFORE UPDATE ON "core_audit_events" FOR EACH ROW EXECUTE FUNCTION "core_audit_events_append_only"();
--> statement-breakpoint
CREATE TRIGGER "core_audit_events_no_delete" BEFORE DELETE ON "core_audit_events" FOR EACH ROW EXECUTE FUNCTION "core_audit_events_append_only"();
