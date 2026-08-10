-- Menu di esempio per il Bar Centrale. Idempotente: ripulisce e reinserisce.
DO $$
DECLARE
  tid uuid;
  cocktail uuid;
  birre uuid;
  cucina uuid;
BEGIN
  SELECT id INTO tid FROM tenants WHERE slug = 'bar-centrale';

  DELETE FROM menu_products WHERE tenant_id = tid;
  DELETE FROM menu_categories WHERE tenant_id = tid;

  INSERT INTO menu_categories (tenant_id, name, sort_order) VALUES (tid, 'Cocktail', 1) RETURNING id INTO cocktail;
  INSERT INTO menu_categories (tenant_id, name, sort_order) VALUES (tid, 'Birre', 2) RETURNING id INTO birre;
  INSERT INTO menu_categories (tenant_id, name, sort_order) VALUES (tid, 'Cucina', 3) RETURNING id INTO cucina;

  INSERT INTO menu_products
    (tenant_id, category_id, name, description, ingredients, allergens, price_cents, available, sort_order)
  VALUES
    (tid, cocktail, 'Spritz Aperol', 'Il classico aperitivo veneziano', ARRAY['Aperol','Prosecco','Soda'], ARRAY['Solfiti'], 700, true, 1),
    (tid, cocktail, 'Negroni', 'Gin, vermouth rosso, bitter', ARRAY['Gin','Vermouth','Bitter Campari'], ARRAY['Solfiti'], 800, true, 2),
    (tid, birre, 'Birra media', 'Bionda alla spina 0,4L', ARRAY['Acqua','Malto d''orzo','Luppolo'], ARRAY['Glutine'], 500, true, 1),
    (tid, cucina, 'Tagliere misto', 'Salumi e formaggi locali', ARRAY['Salumi','Formaggi'], ARRAY['Latte'], 1200, false, 1),
    (tid, cucina, 'Patatine fritte', 'Porzione', ARRAY['Patate','Sale'], ARRAY[]::text[], 400, true, 2);
END $$;
