-- v18: soft-delete (archive) support for members
ALTER TABLE members ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
