ALTER TABLE `payment_proofs` MODIFY COLUMN `file_path` varchar(255);--> statement-breakpoint
ALTER TABLE `payment_proofs` MODIFY COLUMN `file_size` int unsigned;--> statement-breakpoint
ALTER TABLE `payment_proofs` ADD `channel` enum('upload','whatsapp') DEFAULT 'upload' NOT NULL;