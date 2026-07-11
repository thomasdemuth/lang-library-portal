-- Shelf/rack number shown on the map (e.g. "04", "R15"), separate from the
-- descriptive label. Optional free text.
alter table shelves add column if not exists shelf_number text;
