-- Manual migration to add original_csv_data column to existing database
-- Run this against your Supabase database

-- Add the column if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'submissions' 
        AND column_name = 'original_csv_data'
    ) THEN
        ALTER TABLE submissions ADD COLUMN original_csv_data JSONB;
        
        -- Add an index for better performance when querying CSV data
        CREATE INDEX idx_submissions_original_csv_data ON submissions USING gin(original_csv_data);
        
        -- Add a comment to explain the purpose of the new column
        COMMENT ON COLUMN submissions.original_csv_data IS 'Stores the original CSV file content and metadata to enable exact file reconstruction for downloads';
        
        RAISE NOTICE 'Added original_csv_data column to submissions table';
    ELSE
        RAISE NOTICE 'Column original_csv_data already exists in submissions table';
    END IF;
END $$;
