DROP INDEX `products_is_featured_idx` ON `products`;--> statement-breakpoint
ALTER TABLE `products` ADD `sort_order` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `featured_sort_order` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `products_status_sort_idx` ON `products` (`status`,`sort_order`);--> statement-breakpoint
CREATE INDEX `products_featured_sort_idx` ON `products` (`is_featured`,`featured_sort_order`);--> statement-breakpoint
-- Hand-added backfill (S10 phase 2b, DATABASE.md DB24): give existing rows a stable initial
-- order matching their current newest-first display, instead of leaving every row at the
-- column's default 0. Window functions are supported on both MySQL 8 and MariaDB 10.2+.
UPDATE products p
JOIN (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC, id DESC) - 1 AS rn FROM products) r
  ON r.id = p.id
SET p.sort_order = r.rn;--> statement-breakpoint
UPDATE products p
JOIN (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC, id DESC) - 1 AS rn
  FROM products WHERE is_featured = 1
) r ON r.id = p.id
SET p.featured_sort_order = r.rn;