-- Publish preview UX hardening: distinguish adapter URL from resolved final URL.

ALTER TABLE deployments ADD COLUMN final_url TEXT;
