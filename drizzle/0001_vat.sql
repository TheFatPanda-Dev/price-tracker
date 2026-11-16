ALTER TABLE `products` ADD `vat_percent` real;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `show_net_prices` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `vat_percent` real DEFAULT 22 NOT NULL;