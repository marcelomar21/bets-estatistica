/**
 * Run SQL migration on Supabase
 * Usage: node scripts/run-migration.js [migration_file]
 * Example: node scripts/run-migration.js sql/migrations/001_initial_schema.sql
 */
const fs = require('fs');
const path = require('path');
const { supabase } = require('../lib/supabase');
const logger = require('../lib/logger');

async function runMigration(filePath) {
  const absolutePath = path.resolve(filePath);
  
  if (!fs.existsSync(absolutePath)) {
    logger.error('Migration file not found', { path: absolutePath });
    return { success: false, error: { code: 'FILE_NOT_FOUND', message: `File not found: ${absolutePath}` } };
  }

  const sql = fs.readFileSync(absolutePath, 'utf8');
  logger.info('Running migration', { file: path.basename(absolutePath), size: sql.length });

  try {
    // Split by semicolons but preserve those inside functions/triggers
    // For simplicity, we'll run the entire script at once
    const { data: _data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      // If RPC doesn't exist, provide instructions
      if (error.code === 'PGRST202') {
        logger.warn('exec_sql function not found - run migration manually in Supabase SQL Editor');
        console.log('\n📋 Copy the SQL from:', absolutePath);
        console.log('📍 Paste in: Supabase Dashboard → SQL Editor → New Query → Run\n');
        return { success: false, error: { code: 'MANUAL_REQUIRED', message: 'Run migration manually in Supabase SQL Editor' } };
      }
      
      logger.error('Migration failed', { error: error.message });
      return { success: false, error: { code: 'MIGRATION_ERROR', message: error.message } };
    }

    logger.info('Migration completed successfully');
    return { success: true, data: { executed: true } };
  } catch (err) {
    logger.error('Migration error', { error: err.message });
    return { success: false, error: { code: 'EXECUTION_ERROR', message: err.message } };
  }
}

async function main() {
  const migrationFile = process.argv[2] || 'sql/migrations/001_initial_schema.sql';
  
  console.log('🔄 Running migration...\n');
  const result = await runMigration(migrationFile);
  
  if (result.success) {
    console.log('✅ Migration completed successfully!');
    process.exit(0);
  } else if (result.error.code === 'MANUAL_REQUIRED') {
    console.log('⚠️  Manual migration required (see instructions above)');
    process.exit(0);
  } else {
    console.log('❌ Migration failed:', result.error.message);
    process.exit(1);
  }
}

main();
