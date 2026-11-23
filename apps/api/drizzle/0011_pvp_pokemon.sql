CREATE TABLE "pvp_pokemon" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"form_key" text NOT NULL,
	"atk" integer NOT NULL,
	"def" integer NOT NULL,
	"sta" integer NOT NULL,
	"level" real,
	"shadow" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pvp_pokemon" ADD CONSTRAINT "pvp_pokemon_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pvp_pokemon_user_idx" ON "pvp_pokemon" USING btree ("user_id");