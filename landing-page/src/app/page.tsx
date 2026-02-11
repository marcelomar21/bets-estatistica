import Image from "next/image";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 100 12.324 6.162 6.162 0 100-12.324zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405a1.441 1.441 0 11-2.88 0 1.441 1.441 0 012.88 0z" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3v18h18" />
      <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
    </svg>
  );
}

function BrainIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2a6 6 0 0 1 6 6c0 3-2 5.5-4 7v3h-4v-3c-2-1.5-4-4-4-7a6 6 0 0 1 6-6z" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </svg>
  );
}

function BoltIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M14.615 1.595a.75.75 0 01.359.852L12.982 9.75h7.268a.75.75 0 01.548 1.262l-10.5 11.25a.75.75 0 01-1.272-.71l1.992-7.302H3.75a.75.75 0 01-.548-1.262l10.5-11.25a.75.75 0 01.913-.143z" clipRule="evenodd" />
    </svg>
  );
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
    </svg>
  );
}

const LEAGUES = [
  { flag: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}", name: "Premier League", country: "Inglaterra" },
  { flag: "\u{1F1EA}\u{1F1F8}", name: "La Liga", country: "Espanha" },
  { flag: "\u{1F1E9}\u{1F1EA}", name: "Bundesliga", country: "Alemanha" },
  { flag: "\u{1F1EB}\u{1F1F7}", name: "Ligue 1", country: "França" },
  { flag: "\u{1F1EE}\u{1F1F9}", name: "Serie A", country: "Itália" },
  { flag: "\u{1F1E7}\u{1F1F7}", name: "Brasileirão Série A", country: "Brasil" },
  { flag: "\u{1F1E7}\u{1F1F7}", name: "Paulistão", country: "Brasil" },
  { flag: "\u{1F1E7}\u{1F1F7}", name: "Carioca", country: "Brasil" },
  { flag: "\u{1F1E7}\u{1F1F7}", name: "Mineiro", country: "Brasil" },
  { flag: "\u{1F30D}", name: "Champions League", country: "UEFA" },
  { flag: "\u{1F30D}", name: "Europa League", country: "UEFA" },
  { flag: "\u{1F30E}", name: "Copa Libertadores", country: "CONMEBOL" },
  { flag: "\u{1F1E7}\u{1F1F7}", name: "Copa do Brasil", country: "Brasil" },
];

const TESTIMONIALS = [
  {
    name: "Rafael S.",
    text: "Recebia as tips no Telegram e no começo duvidei, mas em 2 semanas vi que a taxa de acerto era real. Hoje faz parte da minha rotina.",
    role: "Assinante desde nov/2025",
  },
  {
    name: "Camila M.",
    text: "O diferencial é que não é achismo, dá pra ver que tem análise por trás. As odds são boas e a consistência impressiona.",
    role: "Assinante desde dez/2025",
  },
  {
    name: "Lucas P.",
    text: "Já testei vários grupos de tips e esse é o único que mostra transparência nos resultados. A estatística realmente faz diferença.",
    role: "Assinante desde nov/2025",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-guru-purple-900 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-guru-purple-900/95 backdrop-blur-sm border-b border-white/10">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Image
              src="/logo-amarela-roxa.png"
              alt="Guru da Bet"
              width={40}
              height={40}
              className="rounded-lg"
            />
            <span className="text-lg font-bold text-guru-gold">
              Guru da Bet
            </span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://admin.gurudabet.com.br"
              className="hidden sm:inline-flex rounded-lg border border-guru-gold/60 px-4 py-2 text-sm font-medium text-guru-gold transition hover:bg-guru-gold/10"
            >
              Área de Influencer
            </a>
            <a
              href="https://wa.me/5541992268584"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-guru-gold px-4 py-2 text-sm font-bold text-guru-purple-900 transition hover:bg-guru-gold-light"
            >
              <WhatsAppIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Fale Conosco</span>
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-guru-purple-900 via-guru-purple to-guru-purple-600" />
        <div className="relative mx-auto max-w-4xl px-4 py-20 text-center sm:py-28 lg:py-36">
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            Tips de apostas esportivas com{" "}
            <span className="text-guru-gold">Análise Estatística</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-white/70 sm:text-lg">
            Análise estatística avançada para maximizar seus resultados. Receba
            tips diretamente no seu Telegram, com transparência total nos
            resultados.
          </p>

          {/* Hit rate badge */}
          <div className="mt-10 inline-flex flex-col items-center rounded-2xl border border-guru-gold/30 bg-guru-gold/10 px-8 py-5 backdrop-blur-sm">
            <span className="text-5xl font-extrabold text-guru-gold sm:text-6xl">
              71,32%
            </span>
            <span className="mt-1 text-sm font-medium text-guru-gold-light">
              taxa de acerto
            </span>
          </div>

          {/* CTA */}
          <div className="mt-10">
            <a
              href="https://t.me/TheGuruBet_Bot?start=subscribe"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-guru-gold px-8 py-4 text-lg font-bold text-guru-purple-900 shadow-lg shadow-guru-gold/25 transition hover:bg-guru-gold-light hover:shadow-guru-gold/40"
            >
              <TelegramIcon className="h-5 w-5" />
              Quero receber as tips
            </a>
          </div>

          <p className="mt-6 text-xs text-white/40">
            Análise baseada em modelos matemáticos e dados estatísticos
          </p>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="relative border-y border-white/10 bg-guru-purple-900">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-4 py-12 text-center sm:grid-cols-4 sm:py-14">
          <div>
            <p className="text-3xl font-extrabold text-guru-gold sm:text-4xl">13+</p>
            <p className="mt-1 text-sm text-white/50">Campeonatos monitorados</p>
          </div>
          <div>
            <p className="text-3xl font-extrabold text-guru-gold sm:text-4xl">71,32%</p>
            <p className="mt-1 text-sm text-white/50">Taxa de acerto</p>
          </div>
          <div>
            <p className="text-3xl font-extrabold text-guru-gold sm:text-4xl">1.500+</p>
            <p className="mt-1 text-sm text-white/50">Tips já enviadas</p>
          </div>
          <div>
            <p className="text-3xl font-extrabold text-guru-gold sm:text-4xl">24/7</p>
            <p className="mt-1 text-sm text-white/50">Monitoramento estatístico</p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-guru-purple">
        <div className="mx-auto max-w-5xl px-4 py-20 sm:py-24">
          <h2 className="text-center text-2xl font-extrabold sm:text-3xl">
            Como <span className="text-guru-gold">funciona</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-white/60">
            Nossa tecnologia analisa milhares de dados antes de cada partida para
            encontrar as melhores oportunidades.
          </p>
          <div className="mt-14 grid gap-8 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-guru-gold/15">
                <ChartIcon className="h-7 w-7 text-guru-gold" />
              </div>
              <h3 className="mt-5 text-lg font-bold">Coleta de dados</h3>
              <p className="mt-2 text-sm text-white/60">
                Coletamos estatísticas de desempenho, histórico de confrontos,
                odds de mercado e dezenas de variáveis de cada partida.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-guru-gold/15">
                <BrainIcon className="h-7 w-7 text-guru-gold" />
              </div>
              <h3 className="mt-5 text-lg font-bold">Modelos estatísticos</h3>
              <p className="mt-2 text-sm text-white/60">
                Nossos modelos matemáticos processam os dados e identificam
                padrões que o olho humano não consegue ver.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-guru-gold/15">
                <BoltIcon className="h-7 w-7 text-guru-gold" />
              </div>
              <h3 className="mt-5 text-lg font-bold">Tip no Telegram</h3>
              <p className="mt-2 text-sm text-white/60">
                Quando o modelo encontra uma oportunidade com alta probabilidade,
                você recebe a tip direto no Telegram em tempo real.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Leagues */}
      <section className="bg-guru-purple-900">
        <div className="mx-auto max-w-5xl px-4 py-20 sm:py-24">
          <h2 className="text-center text-2xl font-extrabold sm:text-3xl">
            Campeonatos que{" "}
            <span className="text-guru-gold">monitoramos</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-white/60">
            Cobertura completa dos maiores campeonatos do mundo e do Brasil, com
            análise em tempo real de cada partida.
          </p>
          <div className="mx-auto mt-12 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {LEAGUES.map((league) => (
              <div
                key={league.name}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
              >
                <span className="text-2xl" role="img" aria-label={league.country}>
                  {league.flag}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{league.name}</p>
                  <p className="truncate text-xs text-white/40">{league.country}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bet Markets */}
      <section className="border-y border-white/10 bg-guru-purple">
        <div className="mx-auto max-w-5xl px-4 py-20 sm:py-24">
          <h2 className="text-center text-2xl font-extrabold sm:text-3xl">
            Mercados <span className="text-guru-gold">analisados</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-white/60">
            Não nos limitamos a um único mercado. Nossos modelos analisam múltiplas
            categorias para encontrar valor em cada jogo.
          </p>
          <div className="mx-auto mt-12 grid max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Gols", desc: "Over/Under, Resultado Exato" },
              { label: "Escanteios", desc: "Over/Under corners" },
              { label: "Cartões", desc: "Over/Under cards" },
              { label: "Ambas Marcam", desc: "BTTS Sim/Não" },
            ].map((market) => (
              <div
                key={market.label}
                className="rounded-xl border border-guru-gold/20 bg-guru-gold/5 p-5 text-center"
              >
                <p className="text-lg font-bold text-guru-gold">{market.label}</p>
                <p className="mt-1 text-xs text-white/50">{market.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-guru-purple-900">
        <div className="mx-auto max-w-5xl px-4 py-20 sm:py-24">
          <h2 className="text-center text-2xl font-extrabold sm:text-3xl">
            O que dizem nossos{" "}
            <span className="text-guru-gold">assinantes</span>
          </h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <div
                key={t.name}
                className="rounded-2xl border border-white/10 bg-white/5 p-6"
              >
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <StarIcon key={i} className="h-4 w-4 text-guru-gold" />
                  ))}
                </div>
                <p className="mt-4 text-sm leading-relaxed text-white/70">
                  &ldquo;{t.text}&rdquo;
                </p>
                <div className="mt-5 border-t border-white/10 pt-4">
                  <p className="text-sm font-semibold">{t.name}</p>
                  <p className="text-xs text-white/40">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Instagram */}
      <section className="border-y border-white/10 bg-guru-purple">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:py-24">
          <InstagramIcon className="mx-auto h-12 w-12 text-guru-gold" />
          <h2 className="mt-5 text-2xl font-extrabold sm:text-3xl">
            Siga o <span className="text-guru-gold">@gurudabet_</span> no
            Instagram
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-white/60">
            Acompanhe resultados diários, bastidores das análises, pré-jogo e
            dicas exclusivas. Conteúdo novo todos os dias.
          </p>
          <div className="mt-10">
            <a
              href="https://www.instagram.com/gurudabet_"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 px-8 py-4 text-lg font-bold text-white shadow-lg transition hover:opacity-90"
            >
              <InstagramIcon className="h-5 w-5" />
              Seguir no Instagram
            </a>
          </div>

        </div>
      </section>

      {/* CTA Mid-page */}
      <section className="bg-guru-purple-900">
        <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:py-24">
          <h2 className="text-2xl font-extrabold sm:text-3xl lg:text-4xl">
            Pronto para lucrar com{" "}
            <span className="text-guru-gold">análise estatística</span>?
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-white/60">
            Junte-se a centenas de apostadores que já recebem tips com mais de 71% de acerto.
            Sem achismo, sem palpite — apenas matemática e dados.
          </p>
          <div className="mt-10">
            <a
              href="https://t.me/TheGuruBet_Bot?start=subscribe"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-guru-gold px-8 py-4 text-lg font-bold text-guru-purple-900 shadow-lg shadow-guru-gold/25 transition hover:bg-guru-gold-light hover:shadow-guru-gold/40"
            >
              <TelegramIcon className="h-5 w-5" />
              Começar a receber tips agora
            </a>
          </div>
        </div>
      </section>

      {/* Influencers Section */}
      <section className="relative bg-guru-purple">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:py-24">
          <span className="inline-block rounded-full bg-guru-gold/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-guru-gold">
            Para Influencers
          </span>
          <h2 className="mt-6 text-2xl font-extrabold leading-tight sm:text-3xl lg:text-4xl">
            É influencer digital?{" "}
            <span className="text-guru-gold">
              Temos uma proposta pra você
            </span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base text-white/70 sm:text-lg">
            Monetize sua audiência no mercado de apostas esportivas de forma
            profissional. Oferecemos uma parceria exclusiva com tecnologia e
            suporte completo para você focar no que faz de melhor.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              { title: "Tecnologia própria", desc: "Modelos estatísticos e análise de dados que geram resultados reais para sua audiência." },
              { title: "Suporte completo", desc: "Time dedicado para te ajudar com conteúdo, estratégia e operação." },
              { title: "Monetização real", desc: "Modelo de parceria transparente e lucrativo para ambos os lados." },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-white/10 bg-white/5 p-5 text-left"
              >
                <p className="font-bold text-guru-gold">{item.title}</p>
                <p className="mt-2 text-sm text-white/60">{item.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-10">
            <a
              href="https://wa.me/5541992268584"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-guru-gold px-8 py-4 text-lg font-bold text-guru-purple-900 transition hover:bg-guru-gold-light"
            >
              <WhatsAppIcon className="h-5 w-5" />
              Quero saber mais
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-guru-purple-900">
        <div className="mx-auto max-w-6xl px-4 py-10 text-center">
          <Image
            src="/logo-branca.png"
            alt="Guru da Bet"
            width={48}
            height={48}
            className="mx-auto rounded-lg"
          />
          <div className="mt-5 flex items-center justify-center gap-6 text-sm text-white/60">
            <a
              href="https://t.me/TheGuruBet_Bot?start=subscribe"
              target="_blank"
              rel="noopener noreferrer"
              className="transition hover:text-guru-gold"
            >
              Telegram
            </a>
            <a
              href="https://www.instagram.com/gurudabet_"
              target="_blank"
              rel="noopener noreferrer"
              className="transition hover:text-guru-gold"
            >
              Instagram
            </a>
            <a
              href="https://wa.me/5541992268584"
              target="_blank"
              rel="noopener noreferrer"
              className="transition hover:text-guru-gold"
            >
              WhatsApp
            </a>
            <a
              href="https://admin.gurudabet.com.br"
              className="transition hover:text-guru-gold"
            >
              Área de Influencer
            </a>
          </div>
          <p className="mt-6 text-xs text-white/30">
            &copy; 2025 Guru da Bet. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
