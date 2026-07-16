-- 017_tshirt_sizes.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tshirt_size') THEN
    CREATE TYPE tshirt_size AS ENUM ('XS', 'S', 'M', 'L', 'XL', 'XXL');
  END IF;
END $$;

ALTER TABLE member_profile ADD COLUMN IF NOT EXISTS tshirt_size tshirt_size;