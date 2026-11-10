-- 046: перенос объекта — bbox/dx/dy/label для детерминированной вставки после удаления.
ALTER TABLE renders ADD COLUMN IF NOT EXISTS edit_move JSONB;
