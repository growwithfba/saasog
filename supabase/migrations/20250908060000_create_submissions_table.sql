-- Create the main submissions table
CREATE TABLE IF NOT EXISTS submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  product_name TEXT,
  score NUMERIC,
  status TEXT CHECK (status IN ('PASS', 'RISKY', 'FAIL')),
  submission_data JSONB,
  metrics JSONB,
  is_public BOOLEAN DEFAULT FALSE,
  public_shared_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_public ON submissions(is_public) WHERE is_public = TRUE;
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at);

CREATE INDEX IF NOT EXISTS idx_validation_submissions_user_id ON validation_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_validation_submissions_status ON validation_submissions(status);
CREATE INDEX IF NOT EXISTS idx_validation_submissions_submission_id ON validation_submissions(submission_id);

-- Enable Row Level Security (RLS)
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_submissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for submissions table
CREATE POLICY "Users can view their own submissions" ON submissions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own submissions" ON submissions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own submissions" ON submissions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own submissions" ON submissions
  FOR DELETE USING (auth.uid() = user_id);

-- Allow public access to submissions marked as public
CREATE POLICY "Public submissions are viewable by anyone" ON submissions
  FOR SELECT USING (is_public = TRUE);

-- RLS Policies for validation_submissions table
CREATE POLICY "Users can view their own validation submissions" ON validation_submissions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own validation submissions" ON validation_submissions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own validation submissions" ON validation_submissions
  FOR UPDATE USING (auth.uid() = user_id);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply the trigger to both tables
CREATE TRIGGER update_submissions_updated_at
    BEFORE UPDATE ON submissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_validation_submissions_updated_at
    BEFORE UPDATE ON validation_submissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
