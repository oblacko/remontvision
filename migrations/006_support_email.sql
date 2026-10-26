-- 006: контактная почта support@remontvision.ru и новая редакция документов.
INSERT INTO legal_docs (document, version, published_at, url) VALUES
  ('offer',        '2026-10-26.5', now(), '/offer'),
  ('privacy',      '2026-10-26.5', now(), '/privacy'),
  ('cross_border', '2026-10-26.5', now(), '/privacy#cross-border')
ON CONFLICT (document, version) DO NOTHING;

UPDATE users SET email = 'support@remontvision.ru'
WHERE email = 'yaoblacko@gmail.com';

UPDATE auth_identities SET email = 'support@remontvision.ru'
WHERE provider = 'email'
  AND user_id IN (SELECT id FROM users WHERE email = 'support@remontvision.ru');
