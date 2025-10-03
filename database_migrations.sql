-- Add public sharing functionality to submissions table
ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS public_shared_at TIMESTAMP WITH TIME ZONE;

-- Create validation submissions table
CREATE TABLE IF NOT EXISTS validation_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
  submission_url TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure a user can only submit the same submission once for validation
  UNIQUE(user_id, submission_id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_validation_submissions_user_id ON validation_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_validation_submissions_status ON validation_submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_public ON submissions(is_public) WHERE is_public = TRUE;

-- Enable Row Level Security (RLS) for validation_submissions
ALTER TABLE validation_submissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for validation_submissions
CREATE POLICY "Users can view their own validation submissions" ON validation_submissions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own validation submissions" ON validation_submissions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own validation submissions" ON validation_submissions
  FOR UPDATE USING (auth.uid() = user_id);

-- Update RLS policy for submissions to allow public access when is_public = true
CREATE POLICY "Public submissions are viewable by anyone" ON submissions
  FOR SELECT USING (is_public = TRUE);

-- Add product_name column to submissions if it doesn't exist
ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS product_name TEXT;

-- Create a trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply the trigger to validation_submissions
DROP TRIGGER IF EXISTS update_validation_submissions_updated_at ON validation_submissions;
CREATE TRIGGER update_validation_submissions_updated_at
    BEFORE UPDATE ON validation_submissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
