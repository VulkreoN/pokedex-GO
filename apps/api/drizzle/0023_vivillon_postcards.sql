CREATE TABLE IF NOT EXISTS "user_postcards" (
	"user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"pattern" text NOT NULL,
	"quantity" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_postcards_user_id_pattern_pk" PRIMARY KEY("user_id","pattern")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_postcards_pattern_idx" ON "user_postcards" USING btree ("pattern");
