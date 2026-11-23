CREATE TABLE "raid_alerts" (
	"user_id" text NOT NULL,
	"boss_id" text NOT NULL,
	"alerted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "raid_alerts_user_id_boss_id_pk" PRIMARY KEY("user_id","boss_id")
);
--> statement-breakpoint
ALTER TABLE "raid_alerts" ADD CONSTRAINT "raid_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;