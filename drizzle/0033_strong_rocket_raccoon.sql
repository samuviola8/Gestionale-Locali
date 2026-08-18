CREATE TABLE "login_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"token" text NOT NULL,
	"method" text NOT NULL,
	"code_hash" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "login_challenges_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "platform_admins" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD COLUMN "temp_password_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD COLUMN "twofa_method" text;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD COLUMN "twofa_secret" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "twofa_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "temp_password_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "twofa_method" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "twofa_secret" text;