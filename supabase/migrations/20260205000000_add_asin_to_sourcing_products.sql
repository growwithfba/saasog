-- Add asin column to sourcing_products table
-- This allows storing the ASIN directly in sourcing_products for easier querying

ALTER TABLE sourcing_products
ADD COLUMN IF NOT EXISTS asin TEXT;

-- Create an index on asin for better query performance
CREATE INDEX IF NOT EXISTS idx_sourcing_products_asin ON sourcing_products(asin);

-- Add a comment explaining the column
COMMENT ON COLUMN sourcing_products.asin IS 'Amazon ASIN (Amazon Standard Identification Number) for the product';
