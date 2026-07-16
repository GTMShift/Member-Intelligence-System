-- 017_tshirt_sizes.sql

CREATE TYPE tshirt_size AS ENUM ('XS', 'S', 'M', 'L', 'XL', 'XXL');
ALTER TABLE member_profile ADD COLUMN tshirt_size tshirt_size;