-- 004: новая редакция документов (подключён Resend, уточнены получатели данных).
INSERT INTO legal_docs (document, version, published_at, url) VALUES
  ('offer',        '2026-10-26.3', now(), '/offer'),
  ('privacy',      '2026-10-26.3', now(), '/privacy'),
  ('cross_border', '2026-10-26.3', now(), '/privacy#cross-border')
ON CONFLICT (document, version) DO NOTHING;
