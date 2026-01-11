/**
 * Job: Send reminders for pending links
 * 
 * Stories covered:
 * - 2.6: Enviar lembretes
 * 
 * Run: node bot/jobs/reminders.js
 * Cron: every 30 minutes
 */
require('dotenv').config();

const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');
const { linkReminderAlert } = require('../services/alertService');

// Reminder intervals (in minutes)
const REMINDER_INTERVALS = [30, 60, 90]; // After 30min, 60min, 90min
const HOURLY_AFTER = 3; // After 3 reminders, switch to hourly

/**
 * Get bets pending links that need reminders
 */
async function getBetsNeedingReminders() {
  const { data, error } = await supabase
    .from('suggested_bets')
    .select(`
      id,
      match_id,
      bet_market,
      bet_pick,
      odds,
      bet_status,
      created_at,
      league_matches!inner (
        home_team_name,
        away_team_name,
        kickoff_time
      )
    `)
    .eq('bet_status', 'pending_link')
    .eq('eligible', true)
    .is('deep_link', null)
    .gte('league_matches.kickoff_time', new Date().toISOString())
    .order('created_at', { ascending: true });

  if (error) {
    logger.error('Failed to fetch bets for reminders', { error: error.message });
    return [];
  }

  return (data || []).map(bet => ({
    id: bet.id,
    matchId: bet.match_id,
    betMarket: bet.bet_market,
    betPick: bet.bet_pick,
    odds: bet.odds,
    createdAt: new Date(bet.created_at),
    homeTeamName: bet.league_matches.home_team_name,
    awayTeamName: bet.league_matches.away_team_name,
    kickoffTime: bet.league_matches.kickoff_time,
  }));
}

/**
 * Calculate reminder number based on time since request
 * @param {Date} createdAt - When the link was requested
 * @returns {number} - Reminder number (0 = no reminder needed)
 */
function calculateReminderNumber(createdAt) {
  const minutesSinceRequest = (Date.now() - createdAt.getTime()) / (1000 * 60);
  
  // Check each reminder interval
  for (let i = 0; i < REMINDER_INTERVALS.length; i++) {
    const interval = REMINDER_INTERVALS[i];
    const nextInterval = REMINDER_INTERVALS[i + 1] || interval + 30;
    
    if (minutesSinceRequest >= interval && minutesSinceRequest < nextInterval) {
      // Only send if we haven't sent this reminder yet
      // (within a 5 minute window of the interval)
      if (minutesSinceRequest < interval + 5) {
        return i + 1;
      }
    }
  }
  
  // After all regular reminders, send hourly
  if (minutesSinceRequest >= REMINDER_INTERVALS[REMINDER_INTERVALS.length - 1]) {
    const hoursSinceLastReminder = (minutesSinceRequest - REMINDER_INTERVALS[REMINDER_INTERVALS.length - 1]) / 60;
    if (hoursSinceLastReminder % 1 < 0.1) { // Within 6 minutes of the hour
      return HOURLY_AFTER + Math.floor(hoursSinceLastReminder);
    }
  }
  
  return 0;
}

/**
 * Main job
 */
async function runReminders() {
  logger.info('Starting reminders job');

  const bets = await getBetsNeedingReminders();
  logger.info('Bets pending links', { count: bets.length });

  if (bets.length === 0) {
    logger.info('No reminders needed');
    return { sent: 0 };
  }

  let sent = 0;

  for (const bet of bets) {
    const reminderNumber = calculateReminderNumber(bet.createdAt);
    
    if (reminderNumber > 0) {
      await linkReminderAlert(bet, reminderNumber);
      sent++;
      logger.info('Reminder sent', { betId: bet.id, reminder: reminderNumber });
    }
  }

  logger.info('Reminders complete', { sent });
  return { sent };
}

// Run if called directly
if (require.main === module) {
  runReminders()
    .then(result => {
      console.log('✅ Reminders complete:', result);
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Reminders failed:', err.message);
      process.exit(1);
    });
}

module.exports = { runReminders };
