-- Add original_csv_data field to store the original uploaded CSV content
-- This allows users to download the exact same file they uploaded

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS original_csv_data JSONB;

-- Add an index for better performance when querying CSV data
CREATE INDEX IF NOT EXISTS idx_submissions_original_csv_data ON submissions USING gin(original_csv_data);

-- Add a comment to explain the purpose of the new column
COMMENT ON COLUMN submissions.original_csv_data IS 'Stores the original CSV file content and metadata to enable exact file reconstruction for downloads';
