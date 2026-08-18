-- 153 foto e 1 loghi, esportati da questo database.
-- Tocca solo i prodotti che una foto non ce l'hanno: quelle caricate
-- sull'altra installazione non vengono sovrascritte.
--
--   psql "$DATABASE_URL" -f scripts/foto-agganci.sql

BEGIN;

UPDATE menu_products p SET image_url = '/uploads/bar-centrale/menu-birre-birra-media.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'bar-centrale' AND c.name = 'Birre' AND p.name = 'Birra media'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/bar-centrale/menu-cocktail-negroni.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'bar-centrale' AND c.name = 'Cocktail' AND p.name = 'Negroni'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/bar-centrale/menu-cocktail-spritz-aperol.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'bar-centrale' AND c.name = 'Cocktail' AND p.name = 'Spritz Aperol'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/bar-centrale/menu-cucina-patatine-fritte.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'bar-centrale' AND c.name = 'Cucina' AND p.name = 'Patatine fritte'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/bar-centrale/menu-cucina-tagliere-misto.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'bar-centrale' AND c.name = 'Cucina' AND p.name = 'Tagliere misto'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-amari-amaro-amara.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Amari' AND p.name = 'Amaro Amara'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-amari-amaro-del-capo.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Amari' AND p.name = 'Amaro del Capo'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-amari-jagermeister.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Amari' AND p.name = 'Jagermeister'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-amari-jefferson.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Amari' AND p.name = 'Jefferson'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-amari-montenegro.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Amari' AND p.name = 'Montenegro'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-amari-unicum.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Amari' AND p.name = 'Unicum'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-birre-24-baroni-alla-spina.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Birre' AND p.name = '24 Baroni alla spina'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-birre-24-baroni-in-bottiglia.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Birre' AND p.name = '24 Baroni in bottiglia'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-bollicine-e-champagne-baglio-oro-trusce-spumante-brut.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Bollicine e Champagne' AND p.name = 'Baglio Oro — Truscè Spumante Brut'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-bollicine-e-champagne-biancavigna-prosecco-docg-brut.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Bollicine e Champagne' AND p.name = 'Biancavigna — Prosecco DOCG Brut'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-bollicine-e-champagne-champagne-bruno-paillard-premiere-cuvee.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Bollicine e Champagne' AND p.name = 'Champagne Bruno Paillard — Première Cuvée'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-bollicine-e-champagne-champagne-mandois-brut-origine.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Bollicine e Champagne' AND p.name = 'Champagne Mandois — Brut Origine'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-bollicine-e-champagne-champagne-mandois-brut-rose-origine.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Bollicine e Champagne' AND p.name = 'Champagne Mandois — Brut Rosé Origine'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-bollicine-e-champagne-cusumano-700-metodo-classico-sicilia.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Bollicine e Champagne' AND p.name = 'Cusumano — 700 Metodo Classico Sicilia'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-bollicine-e-champagne-derbusco-cives-franciacorta-brut.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Bollicine e Champagne' AND p.name = 'Derbusco Cives — Franciacorta Brut'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-bollicine-e-champagne-maschio-dei-cavalieri-shamat.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Bollicine e Champagne' AND p.name = 'Maschio dei Cavalieri — Shamat'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-bollicine-e-champagne-toblino-vent-trento-doc.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Bollicine e Champagne' AND p.name = 'Toblino — Vènt Trento DOC'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-food-avocado-toast-beef.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Food' AND p.name = 'Avocado toast-beef'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-food-dolce-del-giorno.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Food' AND p.name = 'Dolce del giorno'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-food-filetto-di-maialino-in-cbt-grigliato.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Food' AND p.name = 'Filetto di maialino in CBT grigliato'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-food-focaccia-pugliese.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Food' AND p.name = 'Focaccia pugliese'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-food-gamberi-in-tempura-homemade.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Food' AND p.name = 'Gamberi in tempura homemade'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-food-noya-crunch-chicken.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Food' AND p.name = 'Noya Crunch Chicken'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-food-noya-smash.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Food' AND p.name = 'Noya Smash'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-food-pane-cunzato-misto.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Food' AND p.name = 'Pane cunzato misto'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-food-patata-fresca-stick.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Food' AND p.name = 'Patata fresca stick'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-food-tartare-di-tonno.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Food' AND p.name = 'Tartare di tonno'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-gin-alkemist.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Gin' AND p.name = 'Alkemist'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-gin-bulldog.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Gin' AND p.name = 'Bulldog'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-gin-elephant.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Gin' AND p.name = 'Elephant'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-gin-etsu.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Gin' AND p.name = 'Etsu'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-gin-etsu-sakura.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Gin' AND p.name = 'Etsu Sakura'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-gin-gran-cabaret.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Gin' AND p.name = 'Gran Cabaret'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-gin-hendrick-s.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Gin' AND p.name = 'Hendrick''s'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-gin-lunar.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Gin' AND p.name = 'Lunar'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-gin-midsummer.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Gin' AND p.name = 'Midsummer'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-gin-monkey-47.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Gin' AND p.name = 'Monkey 47'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-gin-n3.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Gin' AND p.name = 'N3'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-gin-nikka-gin.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Gin' AND p.name = 'Nikka Gin'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-gin-nordes.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Gin' AND p.name = 'Nordes'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-gin-ondina.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Gin' AND p.name = 'Ondina'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-gin-portofino.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Gin' AND p.name = 'Portofino'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-gin-professore-madame.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Gin' AND p.name = 'Professore Madame'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-gin-sabatini.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Gin' AND p.name = 'Sabatini'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-gin-saigon-baigur.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Gin' AND p.name = 'Saigon Baigur'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-gin-tamashi.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Gin' AND p.name = 'Tamashi'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-gin-tamashi-premium.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Gin' AND p.name = 'Tamashi Premium'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-iba-selection-boulevardier.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'IBA Selection' AND p.name = 'Boulevardier'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-iba-selection-chartreuse-swizzle.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'IBA Selection' AND p.name = 'Chartreuse Swizzle'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-iba-selection-don-s-special-daiquiri.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'IBA Selection' AND p.name = 'Don''s Special Daiquiri'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-iba-selection-missionary-s-downfall.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'IBA Selection' AND p.name = 'Missionary''s Downfall'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-iba-selection-naked-and-famous.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'IBA Selection' AND p.name = 'Naked and Famous'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-iba-selection-negroni.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'IBA Selection' AND p.name = 'Negroni'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-iba-selection-old-fashioned.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'IBA Selection' AND p.name = 'Old Fashioned'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-iba-selection-paloma.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'IBA Selection' AND p.name = 'Paloma'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-iba-selection-sidecar.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'IBA Selection' AND p.name = 'Sidecar'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-liquori-e-after-dinner-cachaca-sagatiba.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Liquori e after dinner' AND p.name = 'Cachaça Sagatiba'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-liquori-e-after-dinner-campari-bitter.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Liquori e after dinner' AND p.name = 'Campari Bitter'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-liquori-e-after-dinner-cognac-courvoisier.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Liquori e after dinner' AND p.name = 'Cognac Courvoisier'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-liquori-e-after-dinner-disaronno.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Liquori e after dinner' AND p.name = 'Disaronno'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-liquori-e-after-dinner-drambuie.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Liquori e after dinner' AND p.name = 'Drambuie'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-liquori-e-after-dinner-frangelico.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Liquori e after dinner' AND p.name = 'Frangelico'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-liquori-e-after-dinner-grappa-barricata-18lune.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Liquori e after dinner' AND p.name = 'Grappa Barricata 18Lune'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-liquori-e-after-dinner-grappa-bianca-18lune.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Liquori e after dinner' AND p.name = 'Grappa Bianca 18Lune'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-liquori-e-after-dinner-kahlua.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Liquori e after dinner' AND p.name = 'Kahlua'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-liquori-e-after-dinner-liquore-al-cioccolato.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Liquori e after dinner' AND p.name = 'Liquore al cioccolato'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-liquori-e-after-dinner-liquore-amarena-ratafia.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Liquori e after dinner' AND p.name = 'Liquore Amarena Ratafia'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-liquori-e-after-dinner-liquore-pesca-etna.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Liquori e after dinner' AND p.name = 'Liquore Pesca Etna'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-liquori-e-after-dinner-passito.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Liquori e after dinner' AND p.name = 'Passito'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-liquori-e-after-dinner-pisco-barsol.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Liquori e after dinner' AND p.name = 'Pisco Barsol'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-liquori-e-after-dinner-saint-germain.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Liquori e after dinner' AND p.name = 'Saint Germain'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-rum-abuelo-xii.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Rum' AND p.name = 'Abuelo XII'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-rum-appleton.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Rum' AND p.name = 'Appleton'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-rum-diplomatico.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Rum' AND p.name = 'Diplomatico'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-rum-don-papa-baroko.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Rum' AND p.name = 'Don Papa Baroko'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-rum-j-bally-agricole.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Rum' AND p.name = 'J. Bally Agricole'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-rum-kingstone-chiaro.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Rum' AND p.name = 'Kingstone Chiaro'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-rum-kingstone-scuro.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Rum' AND p.name = 'Kingstone Scuro'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-rum-zacapa-23.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Rum' AND p.name = 'Zacapa 23'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-signature-basil-gin-sour.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Signature' AND p.name = 'Basil Gin Sour'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-signature-cocktail-del-barman.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Signature' AND p.name = 'Cocktail del barman'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-signature-coffee-velvet.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Signature' AND p.name = 'Coffee Velvet'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-signature-peach-gin-fizz.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Signature' AND p.name = 'Peach Gin Fizz'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-signature-red-berry-vodka.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Signature' AND p.name = 'Red Berry Vodka'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-signature-rose-st-germain.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Signature' AND p.name = 'Rose St-Germain'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-signature-spritz-passion.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Signature' AND p.name = 'Spritz Passion'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-soft-drink-acqua-effervescente.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Soft drink' AND p.name = 'Acqua effervescente'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-soft-drink-acqua-frizzante.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Soft drink' AND p.name = 'Acqua frizzante'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-soft-drink-acqua-naturale.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Soft drink' AND p.name = 'Acqua naturale'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-soft-drink-coca-cola.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Soft drink' AND p.name = 'Coca Cola'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-soft-drink-coca-cola-zero.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Soft drink' AND p.name = 'Coca Cola Zero'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-soft-drink-ginger-ale-thomas-henry.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Soft drink' AND p.name = 'Ginger Ale Thomas Henry'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-soft-drink-ginger-beer-thomas-henry.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Soft drink' AND p.name = 'Ginger Beer Thomas Henry'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-soft-drink-indiana-fever-tree.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Soft drink' AND p.name = 'Indiana Fever Tree'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-soft-drink-lemon-schweppes.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Soft drink' AND p.name = 'Lemon Schweppes'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-soft-drink-mediterranea-fever-tree.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Soft drink' AND p.name = 'Mediterranea Fever Tree'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-soft-drink-perrier-frizzante.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Soft drink' AND p.name = 'Perrier frizzante'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-soft-drink-soda-pompelmo-thomas-henry.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Soft drink' AND p.name = 'Soda pompelmo Thomas Henry'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-soft-drink-soda-schweppes.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Soft drink' AND p.name = 'Soda Schweppes'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-soft-drink-tonica-schweppes.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Soft drink' AND p.name = 'Tonica Schweppes'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-spritz-aperol-spritz.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Spritz' AND p.name = 'Aperol Spritz'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-spritz-campari-spritz.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Spritz' AND p.name = 'Campari Spritz'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-spritz-hugo-spritz.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Spritz' AND p.name = 'Hugo Spritz'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-spritz-limoncello-spritz.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Spritz' AND p.name = 'Limoncello Spritz'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-spritz-sarti-rosa-spritz.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Spritz' AND p.name = 'Sarti Rosa Spritz'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-tequila-e-mezcal-espolon-anejo.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Tequila e Mezcal' AND p.name = 'Espolon Anejo'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-tequila-e-mezcal-espolon-blanco.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Tequila e Mezcal' AND p.name = 'Espolon Blanco'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-tequila-e-mezcal-espolon-reposado.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Tequila e Mezcal' AND p.name = 'Espolon Reposado'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-tequila-e-mezcal-montebolos-mezcal.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Tequila e Mezcal' AND p.name = 'Montebolos Mezcal'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-vermouth-antica-formula.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Vermouth' AND p.name = 'Antica Formula'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-vermouth-carpano.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Vermouth' AND p.name = 'Carpano'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-vermouth-cinzano-bottega-1757.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Vermouth' AND p.name = 'Cinzano Bottega 1757'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-vermouth-martini-bianco-extra-dry.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Vermouth' AND p.name = 'Martini Bianco Extra Dry'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-vermouth-punt-e-mes.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Vermouth' AND p.name = 'Punt e Mes'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-vermouth-vermouth-del-professore-bianco.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Vermouth' AND p.name = 'Vermouth del Professore Bianco'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-vermouth-vermouth-del-professore-rosso.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Vermouth' AND p.name = 'Vermouth del Professore Rosso'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/5a85713b557e4746.jpg'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Vini bianchi' AND p.name = 'Baglio Oro — Ammari Frizzante'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/87e008741fa9df13.jpg'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Vini bianchi' AND p.name = 'Baglio Oro — Ceppibianchi Zibibbo'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/c426b457cc782427.jpg'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Vini bianchi' AND p.name = 'Baglio Oro — Kiggiari Grecanico'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-vini-bianchi-cantine-fina-kike.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Vini bianchi' AND p.name = 'Cantine Fina — Kikè'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-vini-bianchi-feudo-montoni-grillo.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Vini bianchi' AND p.name = 'Feudo Montoni — Grillo'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/01de47cc932a6b96.jpg'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Vini bianchi' AND p.name = 'Feudo Montoni — Inzolia'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/62961fc13cd3ab09.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Vini bianchi' AND p.name = 'Firriato — Angimbè'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/a306c743301c9ad9.jpg'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Vini bianchi' AND p.name = 'Firriato — Charme Frizzante'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/f612512c472abd0d.jpg'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Vini bianchi' AND p.name = 'Firriato — Shamaris Grillo'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-vini-bianchi-pietradolce-etna-bianco.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Vini bianchi' AND p.name = 'Pietradolce — Etna Bianco'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/fcb8479c181c0d58.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Vini bianchi' AND p.name = 'Rio Favara — Mizzica Moscato Bianco'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-vini-rossi-e-rosati-baglio-oro-donsar-syrah.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Vini rossi e rosati' AND p.name = 'Baglio Oro — Donsar Syrah'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-vini-rossi-e-rosati-cusumano-disueri-nero-d-avola.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Vini rossi e rosati' AND p.name = 'Cusumano — Disueri Nero d''Avola'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-vini-rossi-e-rosati-feudo-montoni-perricone.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Vini rossi e rosati' AND p.name = 'Feudo Montoni — Perricone'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-vini-rossi-e-rosati-pietradolce-etna-rosato.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Vini rossi e rosati' AND p.name = 'Pietradolce — Etna Rosato'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-vini-rossi-e-rosati-pietradolce-etna-rosso.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Vini rossi e rosati' AND p.name = 'Pietradolce — Etna Rosso'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-vodka-beluga.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Vodka' AND p.name = 'Beluga'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-vodka-belvedere.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Vodka' AND p.name = 'Belvedere'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-vodka-grey-goose.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Vodka' AND p.name = 'Grey Goose'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-vodka-ketel-one.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Vodka' AND p.name = 'Ketel One'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-vodka-skyy.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Vodka' AND p.name = 'Skyy'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-whiskey-bushmills.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Whiskey' AND p.name = 'Bushmills'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-whiskey-jameson.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Whiskey' AND p.name = 'Jameson'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-whiskey-jameson-black-barrell.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Whiskey' AND p.name = 'Jameson Black Barrell'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-whiskey-laphroaig.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Whiskey' AND p.name = 'Laphroaig'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-whiskey-nikka-whiskey.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Whiskey' AND p.name = 'Nikka Whiskey'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-whiskey-oban.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Whiskey' AND p.name = 'Oban'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-whiskey-red-label.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Whiskey' AND p.name = 'Red Label'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/bottiglia-whiskey-talisker.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Whiskey' AND p.name = 'Talisker'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-whiskey-wild-turkey-101.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Whiskey' AND p.name = 'Wild Turkey 101'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-whiskey-wild-turkey-bourbon.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Whiskey' AND p.name = 'Wild Turkey Bourbon'
    AND p.image_url IS NULL;

UPDATE menu_products p SET image_url = '/uploads/noya-lounge/menu-whiskey-wild-turkey-rye.webp'
  FROM menu_categories c, tenants t
  WHERE p.category_id = c.id AND p.tenant_id = t.id
    AND t.slug = 'noya-lounge' AND c.name = 'Whiskey' AND p.name = 'Wild Turkey Rye'
    AND p.image_url IS NULL;

UPDATE tenants SET logo_url = '/uploads/noya-lounge/noya-logo.svg'
  WHERE slug = 'noya-lounge'
    AND (logo_url IS NULL OR logo_url = '/uploads/noya-logo.svg');

COMMIT;
