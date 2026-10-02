import { db } from './db';

async function migrate() {
  console.log('⚡ Running PostgreSQL + PostGIS Schema Migrations...');
  try {
    await db.runMigrations();
    console.log('✅ Migrations completed.');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await db.close();
  }
}

migrate();
