-- 036: новая линейка пакетов с приманкой (decoy).
-- Комната = приманка, Квартира = цель, Дом = якорь.
UPDATE credit_packs SET active = false, updated_at = now()
WHERE id IN ('pack2', 'pack5', 'pack15');

INSERT INTO credit_packs (id, title, credits, price_kopecks, active, sort) VALUES
  ('room',  'Одна комната',  8,   39900, true, 10),
  ('flat',  'Вся квартира', 15,   59900, true, 20),
  ('house', 'Весь дом',     50,  149900, true, 30)
ON CONFLICT (id) DO UPDATE
  SET title = EXCLUDED.title,
      credits = EXCLUDED.credits,
      price_kopecks = EXCLUDED.price_kopecks,
      active = EXCLUDED.active,
      sort = EXCLUDED.sort,
      updated_at = now();
