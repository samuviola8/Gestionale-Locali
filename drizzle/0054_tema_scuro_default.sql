ALTER TABLE "tenants" ALTER COLUMN "default_theme" SET DEFAULT 'dark';--> statement-breakpoint
-- I locali che non hanno mai scelto si portano dietro il vecchio default:
-- "system" vuol dire che il tema lo decide il telefono del cliente, che e'
-- l'unico a non sapere com'e' fatta la sala. Si allineano al nuovo default.
-- Chi ha scelto (dark o light) non si tocca.
UPDATE "tenants" SET "default_theme" = 'dark' WHERE "default_theme" = 'system';
