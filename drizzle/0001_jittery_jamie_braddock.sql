CREATE TABLE `product_variants` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`product_id` bigint unsigned NOT NULL,
	`sku` varchar(64) NOT NULL,
	`label` varchar(150) NOT NULL,
	`attributes` text NOT NULL,
	`price_override` decimal(12,2),
	`stock` int unsigned NOT NULL DEFAULT 0,
	`weight_grams` int unsigned,
	`sort_order` int NOT NULL DEFAULT 0,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `product_variants_id` PRIMARY KEY(`id`),
	CONSTRAINT `product_variants_sku_unique` UNIQUE(`sku`)
);
--> statement-breakpoint
CREATE TABLE `wholesale_inquiry_items` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`inquiry_id` bigint unsigned NOT NULL,
	`product_id` bigint unsigned,
	`item_name` varchar(200) NOT NULL,
	`quantity` int unsigned NOT NULL,
	CONSTRAINT `wholesale_inquiry_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `products` DROP INDEX `products_sku_unique`;--> statement-breakpoint
ALTER TABLE `order_items` ADD `variant_id` bigint unsigned NOT NULL;--> statement-breakpoint
ALTER TABLE `order_items` ADD `variant_label_snapshot` varchar(150) NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_note` varchar(255);--> statement-breakpoint
ALTER TABLE `product_variants` ADD CONSTRAINT `product_variants_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wholesale_inquiry_items` ADD CONSTRAINT `wholesale_inquiry_items_inquiry_id_wholesale_inquiries_id_fk` FOREIGN KEY (`inquiry_id`) REFERENCES `wholesale_inquiries`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wholesale_inquiry_items` ADD CONSTRAINT `wholesale_inquiry_items_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `product_variants_product_sort_idx` ON `product_variants` (`product_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `wholesale_inquiry_items_inquiry_id_idx` ON `wholesale_inquiry_items` (`inquiry_id`);--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_variant_id_product_variants_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` DROP COLUMN `sku`;--> statement-breakpoint
ALTER TABLE `products` DROP COLUMN `stock`;--> statement-breakpoint
ALTER TABLE `wholesale_inquiries` DROP COLUMN `items_of_interest`;