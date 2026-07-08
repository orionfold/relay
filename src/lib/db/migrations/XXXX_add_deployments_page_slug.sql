ALTER TABLE deployments ADD COLUMN page_slug TEXT;

CREATE INDEX IF NOT EXISTS idx_deployments_app_page ON deployments(app_id, page_slug);

UPDATE deployments SET page_slug = 'home' WHERE page_slug IS NULL;
