-- 005: две бесплатные генерации при регистрации + новая редакция оферты.
INSERT INTO legal_docs (document, version, published_at, url) VALUES
  ('offer',        '2026-10-26.4', now(), '/offer'),
  ('privacy',      '2026-10-26.4', now(), '/privacy'),
  ('cross_border', '2026-10-26.4', now(), '/privacy#cross-border')
ON CONFLICT (document, version) DO NOTHING;

-- старым пользователям, получившим 1 кредит, добавляем ещё 1
INSERT INTO credit_txn (user_id, delta, reason)
SELECT u.id, 1, 'signup_bonus_2'
FROM users u
WHERE EXISTS (SELECT 1 FROM credit_txn WHERE user_id = u.id AND reason = 'signup_bonus')
  AND NOT EXISTS (SELECT 1 FROM credit_txn WHERE user_id = u.id AND reason = 'signup_bonus_2');
