ALTER TABLE candidates ADD COLUMN original_document BYTEA;
ALTER TABLE candidates ADD COLUMN document_mime_type VARCHAR(100);
