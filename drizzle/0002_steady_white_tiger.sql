ALTER TABLE `wholesale_inquiries` MODIFY COLUMN `business` varchar(150) NOT NULL;--> statement-breakpoint
ALTER TABLE `wholesale_inquiries` ADD `business_type` enum('retail','restaurant_cafe','hotel','event','other') NOT NULL;--> statement-breakpoint
ALTER TABLE `wholesale_inquiries` ADD `city` varchar(100) NOT NULL;--> statement-breakpoint
ALTER TABLE `wholesale_inquiries` ADD `needed_by_date` date;