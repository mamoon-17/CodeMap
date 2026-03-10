-- Run this SQL query in your PostgreSQL/Supabase database to fix the schema issue
-- This will drop the old User table, enums, and let TypeORM recreate everything

DROP TABLE IF EXISTS "User" CASCADE;
DROP TYPE IF EXISTS "User_authprovider_enum" CASCADE;

-- After running this, restart your server with: npm run dev
-- TypeORM will automatically create the table with the correct schema
