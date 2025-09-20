/* B Shimelis _ 23554691_ 16 September: Backend Logic */ 


import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // required for Supabase/Render
});

export default pool;