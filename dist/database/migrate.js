"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("./db");
async function migrate() {
    console.log('⚡ Running PostgreSQL + PostGIS Schema Migrations...');
    try {
        await db_1.db.runMigrations();
        console.log('✅ Migrations completed.');
    }
    catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
    finally {
        await db_1.db.close();
    }
}
migrate();
//# sourceMappingURL=migrate.js.map