CREATE TABLE `permissions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`key` varchar(100) NOT NULL,
	`description` varchar(255),
	CONSTRAINT `permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `permissions_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`bucket` varchar(191) NOT NULL,
	`count` int unsigned NOT NULL DEFAULT 0,
	`window_ends_at` datetime NOT NULL,
	CONSTRAINT `rate_limits_bucket` PRIMARY KEY(`bucket`)
);
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`role_id` bigint unsigned NOT NULL,
	`permission_id` bigint unsigned NOT NULL,
	CONSTRAINT `role_permissions_role_id_permission_id_pk` PRIMARY KEY(`role_id`,`permission_id`)
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`key` varchar(50) NOT NULL,
	`name` varchar(100) NOT NULL,
	`is_system` boolean NOT NULL DEFAULT false,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `roles_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` char(64) NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`expires_at` datetime NOT NULL,
	`last_seen_at` datetime NOT NULL,
	`ip` varchar(45),
	`user_agent` varchar(255),
	`created_at` datetime NOT NULL,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(150) NOT NULL,
	`email` varchar(191) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`role_id` bigint unsigned NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`last_login_at` datetime,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned,
	`action` varchar(50) NOT NULL,
	`entity` varchar(50) NOT NULL,
	`entity_id` varchar(50) NOT NULL,
	`old_values` text,
	`new_values` text,
	`created_at` datetime NOT NULL,
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`parent_id` bigint unsigned,
	`name` varchar(150) NOT NULL,
	`slug` varchar(191) NOT NULL,
	`description` text,
	`image_path` varchar(255),
	`sort_order` int NOT NULL DEFAULT 0,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `categories_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `product_images` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`product_id` bigint unsigned NOT NULL,
	`path` varchar(255) NOT NULL,
	`width` int NOT NULL,
	`height` int NOT NULL,
	`alt` varchar(255),
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL,
	CONSTRAINT `product_images_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`category_id` bigint unsigned NOT NULL,
	`name` varchar(150) NOT NULL,
	`slug` varchar(191) NOT NULL,
	`sku` varchar(64) NOT NULL,
	`short_description` varchar(500),
	`description` text,
	`price` decimal(12,2) NOT NULL,
	`stock` int unsigned NOT NULL DEFAULT 0,
	`weight_grams` int unsigned,
	`is_featured` boolean NOT NULL DEFAULT false,
	`status` enum('draft','active','archived') NOT NULL DEFAULT 'draft',
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_slug_unique` UNIQUE(`slug`),
	CONSTRAINT `products_sku_unique` UNIQUE(`sku`)
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`order_id` bigint unsigned NOT NULL,
	`product_id` bigint unsigned NOT NULL,
	`name_snapshot` varchar(150) NOT NULL,
	`sku_snapshot` varchar(64) NOT NULL,
	`unit_price` decimal(12,2) NOT NULL,
	`discount_amount` decimal(12,2) NOT NULL,
	`quantity` int unsigned NOT NULL,
	`line_total` decimal(12,2) NOT NULL,
	CONSTRAINT `order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_status_history` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`order_id` bigint unsigned NOT NULL,
	`kind` enum('order','payment','note') NOT NULL,
	`from_status` varchar(50),
	`to_status` varchar(50),
	`note` text,
	`changed_by` bigint unsigned,
	`created_at` datetime NOT NULL,
	CONSTRAINT `order_status_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`order_number` varchar(20) NOT NULL,
	`checkout_token` char(36) NOT NULL,
	`customer_name` varchar(150) NOT NULL,
	`phone` varchar(32) NOT NULL,
	`email` varchar(191),
	`address_line` varchar(255) NOT NULL,
	`city` varchar(100) NOT NULL,
	`state` varchar(100),
	`postal_code` varchar(20),
	`country` char(2) NOT NULL,
	`shipping_zone_id` bigint unsigned,
	`payment_method` enum('cod','bank_transfer') NOT NULL,
	`order_status` enum('pending','awaiting_shipping_quote','confirmed','processing','shipped','delivered','cancelled','rejected') NOT NULL DEFAULT 'pending',
	`payment_status` enum('unpaid','proof_submitted','verified','rejected','cod_pending','cod_collected') NOT NULL,
	`rejection_reason` text,
	`subtotal` decimal(12,2) NOT NULL,
	`discount_total` decimal(12,2) NOT NULL,
	`coupon_id` bigint unsigned,
	`coupon_code` varchar(50),
	`coupon_discount` decimal(12,2) NOT NULL,
	`shipping_total` decimal(12,2),
	`total` decimal(12,2) NOT NULL,
	`display_currency` char(3) NOT NULL,
	`exchange_rate` decimal(12,4) NOT NULL,
	`display_total` decimal(12,2) NOT NULL,
	`customer_note` text,
	`courier` varchar(100),
	`tracking_note` varchar(255),
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_order_number_unique` UNIQUE(`order_number`),
	CONSTRAINT `orders_checkout_token_unique` UNIQUE(`checkout_token`)
);
--> statement-breakpoint
CREATE TABLE `payment_proofs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`order_id` bigint unsigned NOT NULL,
	`file_path` varchar(255) NOT NULL,
	`file_size` int unsigned NOT NULL,
	`status` enum('submitted','verified','rejected') NOT NULL DEFAULT 'submitted',
	`rejection_reason` text,
	`reviewed_by` bigint unsigned,
	`reviewed_at` datetime,
	`created_at` datetime NOT NULL,
	CONSTRAINT `payment_proofs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `static_pages` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`slug` varchar(191) NOT NULL,
	`title` varchar(150) NOT NULL,
	`body` text NOT NULL,
	`is_published` boolean NOT NULL DEFAULT false,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `static_pages_id` PRIMARY KEY(`id`),
	CONSTRAINT `static_pages_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `coupon_usages` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`coupon_id` bigint unsigned NOT NULL,
	`order_id` bigint unsigned NOT NULL,
	`customer_key` varchar(32) NOT NULL,
	`created_at` datetime NOT NULL,
	CONSTRAINT `coupon_usages_id` PRIMARY KEY(`id`),
	CONSTRAINT `coupon_usages_order_id_unique` UNIQUE(`order_id`)
);
--> statement-breakpoint
CREATE TABLE `coupons` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`type` enum('percent','fixed') NOT NULL,
	`value` decimal(12,2) NOT NULL,
	`min_order` decimal(12,2),
	`max_discount` decimal(12,2),
	`usage_limit` int unsigned,
	`per_customer_limit` int unsigned,
	`used_count` int unsigned NOT NULL DEFAULT 0,
	`starts_at` datetime,
	`ends_at` datetime,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `coupons_id` PRIMARY KEY(`id`),
	CONSTRAINT `coupons_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `discount_targets` (
	`discount_id` bigint unsigned NOT NULL,
	`target_id` bigint unsigned NOT NULL,
	CONSTRAINT `discount_targets_discount_id_target_id_pk` PRIMARY KEY(`discount_id`,`target_id`)
);
--> statement-breakpoint
CREATE TABLE `discounts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(150) NOT NULL,
	`type` enum('percent','fixed') NOT NULL,
	`value` decimal(12,2) NOT NULL,
	`target_type` enum('all','category','product') NOT NULL,
	`starts_at` datetime,
	`ends_at` datetime,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `discounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` varchar(100) NOT NULL,
	`value` text NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `shipping_zone_areas` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`zone_id` bigint unsigned NOT NULL,
	`country_code` char(2) NOT NULL,
	`city` varchar(100),
	CONSTRAINT `shipping_zone_areas_id` PRIMARY KEY(`id`),
	CONSTRAINT `shipping_zone_areas_country_city_idx` UNIQUE(`country_code`,`city`)
);
--> statement-breakpoint
CREATE TABLE `shipping_zones` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(150) NOT NULL,
	`mode` enum('flat','quote') NOT NULL,
	`flat_rate` decimal(12,2) NOT NULL,
	`free_over_amount` decimal(12,2),
	`cod_enabled` boolean NOT NULL DEFAULT false,
	`is_fallback` boolean NOT NULL DEFAULT false,
	`is_active` boolean NOT NULL DEFAULT true,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `shipping_zones_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wholesale_inquiries` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(150) NOT NULL,
	`business` varchar(150),
	`phone` varchar(32) NOT NULL,
	`email` varchar(191),
	`items_of_interest` text,
	`message` text NOT NULL,
	`status` enum('new','contacted','closed') NOT NULL DEFAULT 'new',
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `wholesale_inquiries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_id_permissions_id_fk` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `categories` ADD CONSTRAINT `categories_parent_id_categories_id_fk` FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_images` ADD CONSTRAINT `product_images_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_status_history` ADD CONSTRAINT `order_status_history_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_status_history` ADD CONSTRAINT `order_status_history_changed_by_users_id_fk` FOREIGN KEY (`changed_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_shipping_zone_id_shipping_zones_id_fk` FOREIGN KEY (`shipping_zone_id`) REFERENCES `shipping_zones`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_coupon_id_coupons_id_fk` FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_proofs` ADD CONSTRAINT `payment_proofs_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_proofs` ADD CONSTRAINT `payment_proofs_reviewed_by_users_id_fk` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coupon_usages` ADD CONSTRAINT `coupon_usages_coupon_id_coupons_id_fk` FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coupon_usages` ADD CONSTRAINT `coupon_usages_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `discount_targets` ADD CONSTRAINT `discount_targets_discount_id_discounts_id_fk` FOREIGN KEY (`discount_id`) REFERENCES `discounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shipping_zone_areas` ADD CONSTRAINT `shipping_zone_areas_zone_id_shipping_zones_id_fk` FOREIGN KEY (`zone_id`) REFERENCES `shipping_zones`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_at_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `users_role_id_idx` ON `users` (`role_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_created_at_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `categories_parent_id_idx` ON `categories` (`parent_id`);--> statement-breakpoint
CREATE INDEX `categories_active_sort_idx` ON `categories` (`is_active`,`sort_order`);--> statement-breakpoint
CREATE INDEX `product_images_product_sort_idx` ON `product_images` (`product_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `products_category_status_idx` ON `products` (`category_id`,`status`);--> statement-breakpoint
CREATE INDEX `products_status_created_idx` ON `products` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `products_is_featured_idx` ON `products` (`is_featured`);--> statement-breakpoint
CREATE INDEX `order_items_order_id_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_status_history_order_created_idx` ON `order_status_history` (`order_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_status_created_idx` ON `orders` (`order_status`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_payment_status_created_idx` ON `orders` (`payment_status`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_phone_idx` ON `orders` (`phone`);--> statement-breakpoint
CREATE INDEX `orders_created_at_idx` ON `orders` (`created_at`);--> statement-breakpoint
CREATE INDEX `payment_proofs_order_id_idx` ON `payment_proofs` (`order_id`);--> statement-breakpoint
CREATE INDEX `coupon_usages_coupon_customer_idx` ON `coupon_usages` (`coupon_id`,`customer_key`);