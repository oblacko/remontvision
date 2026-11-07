-- Роадмап ремонта: редактируемые пункты (галочки, комментарии, свои строки).
CREATE TABLE IF NOT EXISTS roadmap_items (
  id            TEXT PRIMARY KEY,
  room_id       TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  section_key   TEXT NOT NULL,
  section_title TEXT NOT NULL,
  section_icon  TEXT NOT NULL DEFAULT 'hammer',
  section_sort  INT NOT NULL DEFAULT 0,
  sort          INT NOT NULL DEFAULT 0,
  text          TEXT NOT NULL,
  done          BOOLEAN NOT NULL DEFAULT false,
  active        BOOLEAN NOT NULL DEFAULT true,
  comment       TEXT,
  is_custom     BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS roadmap_items_room_idx
  ON roadmap_items (room_id, section_sort, sort, created_at);
