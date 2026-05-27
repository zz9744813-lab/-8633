CREATE TABLE `agent_vocab` (
	`agent_id` text NOT NULL,
	`lexicon_id` text NOT NULL,
	`learned_from_agent_id` text,
	`learned_tick` integer NOT NULL,
	`usage_count` integer DEFAULT 0,
	`fidelity` real DEFAULT 1,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lexicon_id`) REFERENCES `lexicon`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`name` text NOT NULL,
	`age` integer NOT NULL,
	`gender` text,
	`occupation` text NOT NULL,
	`backstory` text,
	`personality` text,
	`identity` text,
	`state` text,
	`daily_plan` text,
	`last_plan_tick` integer DEFAULT 0,
	`position_x` real DEFAULT 0,
	`position_y` real DEFAULT 0,
	`known_languages` text DEFAULT '["common"]',
	`sprite_url` text,
	`portrait_url` text,
	`palette_hash` text,
	`home_id` text,
	`workplace_id` text,
	`x` real,
	`y` real,
	`health` real DEFAULT 1,
	`status` text DEFAULT 'alive',
	`born_tick` integer,
	`died_tick` integer,
	`current_activity` text DEFAULT 'idle',
	`current_goals` text,
	`energy` real DEFAULT 70,
	`mood` real DEFAULT 50,
	`stress` real DEFAULT 30,
	`updated_at` integer,
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `buildings` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`type` text NOT NULL,
	`name` text,
	`x` integer,
	`y` integer,
	`w` integer,
	`h` integer,
	`width` integer DEFAULT 1,
	`height` integer DEFAULT 1,
	`position` text,
	`description` text,
	`owner_id` text,
	`state` text,
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `chronicles` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`tick` integer NOT NULL,
	`year` integer NOT NULL,
	`season` text NOT NULL,
	`day` integer NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`agent_ids` text,
	`building_ids` text,
	`importance` real DEFAULT 0.5,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `lexicon` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`word` text NOT NULL,
	`meaning` text NOT NULL,
	`origin_agent_id` text NOT NULL,
	`origin_tick` integer NOT NULL,
	`parent_word_id` text,
	`popularity` real DEFAULT 0.05,
	`status` text DEFAULT 'coined',
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `llm_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text,
	`purpose` text,
	`model` text,
	`prompt_tokens` integer,
	`completion_tokens` integer,
	`cost_usd` real,
	`duration_ms` integer,
	`tick` integer
);
--> statement-breakpoint
CREATE TABLE `memories` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`importance` real NOT NULL,
	`tick` integer NOT NULL,
	`last_accessed_tick` integer,
	`embedding_id` text,
	`related_agent_ids` text,
	`location_id` text,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reflections` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`content` text NOT NULL,
	`pattern_type` text,
	`source_memory_ids` text,
	`created_tick` integer NOT NULL,
	`last_accessed_tick` integer,
	`importance` real DEFAULT 0.8,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `relationships` (
	`id` text PRIMARY KEY NOT NULL,
	`from_agent_id` text NOT NULL,
	`to_agent_id` text NOT NULL,
	`affinity` real DEFAULT 0,
	`familiarity` real DEFAULT 0,
	`label` text,
	`last_interaction_tick` integer,
	FOREIGN KEY (`from_agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rumors` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`originator_id` text,
	`tick` integer NOT NULL,
	`type` text NOT NULL,
	`subject` text NOT NULL,
	`content` text NOT NULL,
	`truth_level` real DEFAULT 0.5,
	`spread_count` integer DEFAULT 0,
	`known_by_ids` text DEFAULT '[]',
	`source_memory_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`originator_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `world_events` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`tick` integer NOT NULL,
	`type` text NOT NULL,
	`payload` text,
	`witness_ids` text,
	`description` text NOT NULL,
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `worlds` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`era_pack_id` text,
	`seed` integer DEFAULT 0 NOT NULL,
	`current_tick` integer DEFAULT 0,
	`tick_count` integer DEFAULT 0,
	`year_offset` integer DEFAULT 0,
	`width` integer DEFAULT 100 NOT NULL,
	`height` integer DEFAULT 100 NOT NULL,
	`speed` integer DEFAULT 1,
	`paused` integer DEFAULT false,
	`config` text,
	`created_at` integer NOT NULL,
	`updated_at` integer
);
