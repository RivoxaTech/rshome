CREATE TABLE `wholesale_inquiry_notes` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`inquiry_id` bigint unsigned NOT NULL,
	`author_user_id` bigint unsigned NOT NULL,
	`note` text NOT NULL,
	`created_at` datetime NOT NULL,
	CONSTRAINT `wholesale_inquiry_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `wholesale_inquiry_items` ADD `note` varchar(255);--> statement-breakpoint
ALTER TABLE `wholesale_inquiry_notes` ADD CONSTRAINT `wholesale_inquiry_notes_inquiry_id_wholesale_inquiries_id_fk` FOREIGN KEY (`inquiry_id`) REFERENCES `wholesale_inquiries`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wholesale_inquiry_notes` ADD CONSTRAINT `wholesale_inquiry_notes_author_user_id_users_id_fk` FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `wholesale_inquiry_notes_inquiry_id_idx` ON `wholesale_inquiry_notes` (`inquiry_id`);