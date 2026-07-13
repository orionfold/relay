ALTER TABLE usage_ledger ADD COLUMN usage_completeness TEXT DEFAULT 'partial' NOT NULL;
ALTER TABLE usage_ledger ADD COLUMN usage_source TEXT;
ALTER TABLE usage_ledger ADD COLUMN usage_details TEXT;
