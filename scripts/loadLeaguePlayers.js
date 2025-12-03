require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATA_DIR = path.join(__dirname, '..', 'data', 'json', 'league-players');

if (!fs.existsSync(DATA_DIR)) {
  console.error(`Diretório ${DATA_DIR} não encontrado. Rode o fetch antes de carregar os dados.`);
  process.exit(1);
}

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
  database: process.env.PGDATABASE || 'bets_stats',
  user: process.env.PGUSER || 'bets',
  password: process.env.PGPASSWORD || 'bets_pass_123',
  ssl: false,
});

async function loadFile(filePath) {
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const seasonId = payload.season_id;
  const players = Array.isArray(payload.data) ? payload.data : [];

  console.log(`Carregando ${players.length} jogadores de season_id=${seasonId} (${path.basename(filePath)})...`);

  if (!seasonId || !players.length) {
    console.warn(`Arquivo ${filePath} inválido ou sem jogadores. Ignorando.`);
    return 0;
  }

  const client = await pool.connect();
  let upserts = 0;

  try {
    await client.query('BEGIN');

    const query = `
      INSERT INTO league_players
        (season_id, player_id, full_name, known_as, shorthand, age, nationality,
         position, club_team_id, minutes_played_overall, appearances_overall,
         goals_overall, assists_overall, cards_overall, yellow_cards_overall,
         red_cards_overall, raw_player, stats, updated_at)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
      ON CONFLICT (season_id, player_id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        known_as = EXCLUDED.known_as,
        shorthand = EXCLUDED.shorthand,
        age = EXCLUDED.age,
        nationality = EXCLUDED.nationality,
        position = EXCLUDED.position,
        club_team_id = EXCLUDED.club_team_id,
        minutes_played_overall = EXCLUDED.minutes_played_overall,
        appearances_overall = EXCLUDED.appearances_overall,
        goals_overall = EXCLUDED.goals_overall,
        assists_overall = EXCLUDED.assists_overall,
        cards_overall = EXCLUDED.cards_overall,
        yellow_cards_overall = EXCLUDED.yellow_cards_overall,
        red_cards_overall = EXCLUDED.red_cards_overall,
        raw_player = EXCLUDED.raw_player,
        stats = EXCLUDED.stats,
        updated_at = NOW();
    `;

    for (const player of players) {
      if (!player?.id) {
        continue;
      }

      const params = [
        seasonId,
        player.id,
        player.full_name || 'UNKNOWN',
        player.known_as || null,
        player.shorthand || null,
        player.age || null,
        player.nationality || null,
        player.position || null,
        player.club_team_id || null,
        player.minutes_played_overall || null,
        player.appearances_overall || null,
        player.goals_overall || null,
        player.assists_overall || null,
        player.cards_overall || null,
        player.yellow_cards_overall || null,
        player.red_cards_overall || null,
        JSON.stringify(player),
        JSON.stringify({
          goals_per_90_overall: player.goals_per_90_overall,
          assists_per_90_overall: player.assists_per_90_overall,
          goals_involved_per_90_overall: player.goals_involved_per_90_overall,
          clean_sheets_overall: player.clean_sheets_overall,
          conceded_overall: player.conceded_overall,
          rank_in_league_top_attackers: player.rank_in_league_top_attackers,
          rank_in_league_top_defenders: player.rank_in_league_top_defenders,
          rank_in_league_top_midfielders: player.rank_in_league_top_midfielders,
        }),
      ];

      await client.query(query, params);
      upserts += 1;
    }

    await client.query('COMMIT');
    console.log(`Arquivo ${path.basename(filePath)} importado (${upserts} jogadores).`);
    return upserts;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`Erro ao importar ${filePath}:`, err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((file) => file.startsWith('season-') && file.endsWith('.json'))
    .sort();

  if (!files.length) {
    console.log('Nenhum arquivo season-*.json encontrado em league-players.');
    return;
  }

  let total = 0;
  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    total += await loadFile(filePath);
  }

  console.log(`Importação de jogadores concluída. ${total} registros processados.`);
  await pool.end();
}

main().catch((err) => {
  console.error('Falha ao carregar league players:', err.message);
  process.exit(1);
});







