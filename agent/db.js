/**
 * Database adapter for agent module
 *
 * This module re-exports from lib/db.js for backwards compatibility.
 * All database logic is centralized in lib/db.js
 */
const { getPool, runQuery, closePool, useSupabase } = require('../lib/db');

module.exports = {
  getPool,
  runQuery,
  closePool,
  useSupabase,
};
