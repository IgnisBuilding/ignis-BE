// data-source.ts
import { DataSource } from 'typeorm';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env file for migrations
dotenv.config();

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || "011539", // ← Ensure this is always a string
  database: process.env.DB_NAME || 'ignis',
  entities: [path.join(__dirname, 'libs/database/src/entities/*.entity{.ts,.js}')],
  migrations: [path.join(__dirname, 'libs/database/src/migrations/*.ts')],
});