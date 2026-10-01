CREATE TABLE `push_subscriptions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`endpoint` varchar(500) NOT NULL,
	`endpoint_hash` char(64) NOT NULL,
	`p256dh` varchar(191) NOT NULL,
	`auth` varchar(191) NOT NULL,
	`user_agent` varchar(255),
	`created_at` datetime NOT NULL,
	`last_used_at` datetime,
	CONSTRAINT `push_subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `push_subscriptions_endpoint_hash_unique` UNIQUE(`endpoint_hash`)
);
--> statement-breakpoint
ALTER TABLE `push_subscriptions` ADD CONSTRAINT `push_subscriptions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_id_idx` ON `push_subscriptions` (`user_id`);