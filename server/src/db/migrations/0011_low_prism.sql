ALTER TABLE "skill_versions" ADD COLUMN "name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD COLUMN "type" text DEFAULT 'custom' NOT NULL;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD COLUMN "trusted" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "trusted" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "skills_workspace_name_uq" ON "skills" USING btree ("workspace_id","name");