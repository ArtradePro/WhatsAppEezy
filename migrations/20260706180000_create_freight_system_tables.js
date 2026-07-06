/**
 * Knex migration script: Freight platform database setup
 * 
 * Boots Postgres extensions and creates core tables:
 * - users (Authentication login records)
 * - shipper_profiles (Shipper business metadata)
 * - carrier_profiles (Carrier business metadata)
 * - carrier_rates (Ingested carrier matrices - updated schema)
 */

exports.up = async function(knex) {
  // 1. Enable Required Database Extensions
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "postgis"');

  // 2. Create Core 'users' Table (Authentication & Identity)
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('email', 255).unique().notNullable();
    table.string('password_hash', 255).notNullable();
    table.string('role', 50).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    // Add constraint checks to enforce roles strictly at the db level
    table.checks('role IN (\'shipper\', \'carrier\', \'admin\')', 'chk_user_role');
  });

  // 3. Create 'shipper_profiles' Table (1-to-1 Mapping to users)
  await knex.schema.createTable('shipper_profiles', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').unique().notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('company_name', 255).notNullable();
    table.string('vat_number', 50); // South African B2B Tax compliance
    table.text('default_address');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 4. Create 'carrier_profiles' Table (1-to-1 Mapping to users)
  await knex.schema.createTable('carrier_profiles', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').unique().notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('company_name', 255).notNullable();
    table.string('support_email', 255); // Operational booking mail recipient
    table.string('insurance_doc_url', 512); // GIT Insurance Proof document url
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 5. Create 'carrier_rates' Table (Aligned with bulk CSV insertion logic)
  await knex.schema.createTable('carrier_rates', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('carrier_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('origin_zone', 255).notNullable();
    table.string('dest_zone', 255).notNullable();
    table.decimal('max_weight', 10, 2).notNullable();
    table.decimal('base_rate', 12, 2).notNullable();
    table.decimal('per_kg_rate', 12, 2).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Unique Constraint: prevents duplicates and matches transaction upserts
    table.unique(['carrier_id', 'origin_zone', 'dest_zone', 'max_weight'], 'uniq_carrier_rate_bracket');
  });
};

exports.down = async function(knex) {
  // Drop tables in reverse dependency order
  await knex.schema.dropTableIfExists('carrier_rates');
  await knex.schema.dropTableIfExists('carrier_profiles');
  await knex.schema.dropTableIfExists('shipper_profiles');
  await knex.schema.dropTableIfExists('users');
};
