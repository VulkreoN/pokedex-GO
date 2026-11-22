CREATE TABLE "variant_overrides" (
	"variant_key" text PRIMARY KEY NOT NULL,
	"released" boolean,
	"label_en" text,
	"label_fr" text,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "variant_overrides" ADD CONSTRAINT "variant_overrides_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;