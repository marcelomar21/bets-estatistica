const fs = require('fs');

try {
  // O psql com -t pode gerar o output com pipes (|) separando colunas se não for bem tratado,
  // mas aqui estamos pegando 3 colunas JSON. O output bruto do psql muitas vezes vem em uma linha longa ou quebrado.
  // Vamos ler o arquivo e tentar extrair os 3 objetos JSON.
  
  const content = fs.readFileSync('final_raw_data.json', 'utf8');
  
  // O formato esperado do psql é algo como: " {json1} | {json2} | {json3} "
  // Vamos tentar dar split no pipe |.
  
  const parts = content.split('|');
  
  if (parts.length < 3) {
      console.log('Formato inesperado (menos de 3 partes). Tentando parsing direto se for só um objeto, ou falhando.');
      // Fallback debug
      console.log('Preview:', content.substring(0, 200));
      process.exit(0);
  }

  const parseJson = (str) => {
    try {
      return JSON.parse(str.trim());
    } catch (e) {
      return null;
    }
  };

  const odds = parseJson(parts[0]);
  const homeStats = parseJson(parts[1]);
  const awayStats = parseJson(parts[2]);

  if (!odds || !homeStats || !awayStats) {
     console.log('Falha ao parsear JSONs.');
     process.exit(0);
  }

  // Análise Odds
  const homeWinOdd = odds.full_time?.["1"] ?? odds.full_time?.home ?? 1.32; // Fallback se a chave mudar
  const over25Odd = odds.full_time?.over_25 ?? 1.44;
  const bttsYesOdd = odds.btts_yes ?? 1.92;

  // Análise Santos (Home)
  // seasonWinsNum_home, seasonScoredAVG_home, seasonConcededAVG_home, seasonBTTSPercentage_home
  const santos = {
     winHome: homeStats.seasonWinsNum_home,
     scoredAvgHome: homeStats.seasonScoredAVG_home,
     concededAvgHome: homeStats.seasonConcededAVG_home,
     bttsHome: homeStats.seasonBTTSPercentage_home,
     over25Home: homeStats.seasonOver25Percentage_home
  };

  // Análise Sport (Away)
  // seasonLossesNum_away, seasonScoredAVG_away, seasonConcededAVG_away
  const sport = {
     lossAway: awayStats.seasonLossesNum_away, // 5 derrotas?
     scoredAvgAway: awayStats.seasonScoredAVG_away,
     concededAvgAway: awayStats.seasonConcededAVG_away, // 3.4?
     bttsAway: awayStats.seasonBTTSPercentage_away,
     over25Away: awayStats.seasonOver25Percentage_away
  };

  console.log('--- DADOS EXTRAÍDOS ---');
  console.log('ODDS:', JSON.stringify(odds.full_time || odds, null, 2));
  console.log('SANTOS (Casa):', JSON.stringify(santos, null, 2));
  console.log('SPORT (Fora):', JSON.stringify(sport, null, 2));

} catch (err) {
  console.error(err);
}






