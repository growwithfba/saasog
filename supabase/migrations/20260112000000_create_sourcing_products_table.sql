-- Create sourcing_products table for storing supplier quotes and sourcing data
-- This table stores supplier quotes with basic and advanced form data

CREATE TABLE IF NOT EXISTS sourcing_products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES research_products(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'none' CHECK (status IN ('none', 'working', 'completed')),
  
  -- Supplier quotes stored as JSONB with structure:
  -- {
  --   "supplier_1": { "basic": {...}, "advanced": {...} },
  --   "supplier_2": { "basic": {...}, "advanced": {...} }
  -- }
  supplier_quotes JSONB DEFAULT '{}',
  
  -- Profit calculator data
  profit_calculator JSONB DEFAULT '{}',
  
  -- Sourcing hub overrides
  sourcing_hub JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one sourcing record per user per product
  UNIQUE(user_id, product_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sourcing_products_user_id ON sourcing_products(user_id);
CREATE INDEX IF NOT EXISTS idx_sourcing_products_product_id ON sourcing_products(product_id);
CREATE INDEX IF NOT EXISTS idx_sourcing_products_status ON sourcing_products(status);
CREATE INDEX IF NOT EXISTS idx_sourcing_products_user_product ON sourcing_products(user_id, product_id);

-- Enable Row Level Security (RLS)
ALTER TABLE sourcing_products ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sourcing_products table
-- Users can only view their own sourcing products
CREATE POLICY "Users can view their own sourcing products" ON sourcing_products
  FOR SELECT USING (auth.uid() = user_id);

-- Users can only insert their own sourcing products
CREATE POLICY "Users can insert their own sourcing products" ON sourcing_products
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only update their own sourcing products
CREATE POLICY "Users can update their own sourcing products" ON sourcing_products
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can only delete their own sourcing products
CREATE POLICY "Users can delete their own sourcing products" ON sourcing_products
  FOR DELETE USING (auth.uid() = user_id);

-- Create trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_sourcing_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_sourcing_products_updated_at ON sourcing_products;
CREATE TRIGGER update_sourcing_products_updated_at
    BEFORE UPDATE ON sourcing_products
    FOR EACH ROW
    EXECUTE FUNCTION update_sourcing_products_updated_at();
