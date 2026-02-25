ALTER TABLE `agent_runs` ADD `ended_at` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `is_dogfooding` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `tickets` ADD `blocked` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `tickets` ADD `blocked_reason` text;--> statement-breakpoint
ALTER TABLE `tickets` ADD `blocked_at` text;--> statement-breakpoint
ALTER TABLE `tickets` ADD `on_hold` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `tickets` ADD `hold_reason` text;--> statement-breakpoint
ALTER TABLE `tickets` ADD `hold_at` text;