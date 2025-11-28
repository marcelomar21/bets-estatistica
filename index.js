require('dotenv').config();
const axios = require('axios');
const https = require('https');

// Configuração do agente HTTPS para ignorar erros de SSL (se necessário)
const httpsAgent = new https.Agent({  
  rejectUnauthorized: false
});

const API_KEY = process.env.api_key;
const BASE_URL = 'https://api.football-data-api.com';

async function fetchLeagues() {
  if (!API_KEY) {
    console.error('Erro: Chave de API não encontrada no arquivo .env');
    process.exit(1);
  }

  const url = `${BASE_URL}/league-list?key=${API_KEY}`;

  console.log(`Buscando lista de ligas...`);

  try {
    const response = await axios.get(url, { 
      httpsAgent,
      headers: {
        // Headers padrão para evitar bloqueios simples
        'User-Agent': 'BetsEstatistica/1.0'
      }
    });

    if (response.data && response.data.data) {
        const leagues = response.data.data;
        console.log(`Sucesso! ${leagues.length} ligas encontradas.`);
        
        // Vamos pegar a primeira liga como exemplo para buscar as estatísticas
        // Você pode mudar a lógica aqui para buscar uma liga específica pelo nome, por exemplo.
        if (leagues.length > 0) {
            const league = leagues[0]; // Pegando a primeira liga (ex: USA MLS)
            console.log(`\nSelecionando a liga: ${league.name} (${league.country})`);
            
            // Pegando a temporada mais recente (geralmente a última do array ou ordenada por ano)
            // O array 'season' parece vir ordenado, mas vamos garantir pegando o maior ano/id
            const latestSeason = league.season.sort((a, b) => b.year - a.year)[0];
            
            if (latestSeason) {
                console.log(`Temporada selecionada: ${latestSeason.year} (ID: ${latestSeason.id})`);
                await fetchLeagueStats(latestSeason.id);
            } else {
                console.log('Nenhuma temporada encontrada para esta liga.');
            }
        }

    } else {
        console.log('Resposta recebida:', response.data);
    }

  } catch (error) {
    console.error('Falha na requisição:', error.message); // Simplificado para evitar erro de undefined
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Detalhes:', error.response.data);
    }
    process.exit(1);
  }
}

async function fetchLeagueStats(seasonId) {
    const url = `${BASE_URL}/league-season?key=${API_KEY}&season_id=${seasonId}`;
    console.log(`\nBuscando estatísticas da temporada (ID: ${seasonId})...`);

    try {
        const response = await axios.get(url, { 
            httpsAgent,
            headers: { 'User-Agent': 'BetsEstatistica/1.0' }
        });

        if (response.data && response.data.data) {
            console.log('Estatísticas recebidas com sucesso!');
            // Exibindo um resumo das estatísticas
            const stats = response.data.data;
            console.log(JSON.stringify(stats, null, 2));
        } else {
            console.log('Não foi possível obter as estatísticas ou formato inesperado.');
            console.log('Resposta:', response.data);
        }
    } catch (error) {
        console.error('Erro ao buscar estatísticas da liga:');
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error('Detalhes:', error.response.data);
            
            if (error.response.data && error.response.data.message && error.response.data.message.includes('League is not chosen')) {
                console.log('\nAVISO: Parece que esta liga não está selecionada no seu painel da API FootyStats.');
                console.log('Acesse https://footystats.org/api/ e selecione as ligas que deseja acessar.');
            }
        } else {
            console.error(error.message);
        }
    }
}

fetchLeagues();

