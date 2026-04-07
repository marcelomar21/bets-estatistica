# Requirements: GuruBet

**Defined:** 2026-04-07
**Core Value:** Influencers recebem apostas analisadas por IA e as entregam automaticamente aos seus grupos com qualidade consistente — sem esforço manual, sem erro humano, sem downtime.

## v1 Requirements

Requirements para o milestone atual (manutenção + expansão).

### Posting

- [ ] **POST-01**: Postagem automática deve respeitar o tom de voz configurado por grupo/influencer
- [ ] **POST-02**: Confirmação de envio deve ir apenas para o grupo admin, nunca para grupos de clientes
- [ ] **POST-03**: Post de vitória não deve exibir label CTA quando não aplicável
- [ ] **POST-04**: Post de vitória deve ler e exibir odds corretamente

### Queue

- [ ] **QUEUE-01**: Super admin pode selecionar individualmente quais apostas da fila quer postar (default = todas selecionadas)

### League Upsell

- [ ] **LEAGUE-01**: Super admin pode definir quais ligas são padrão e quais são extras (upsell)
- [ ] **LEAGUE-02**: Cliente pode comprar ligas extras via checkout (valor padrão R$200/mês por liga)
- [ ] **LEAGUE-03**: Super admin pode modificar o valor de cada liga extra individualmente
- [ ] **LEAGUE-04**: Super admin pode conceder desconto em ligas extras para clientes específicos

## v2 Requirements

Deferred para milestone futuro. Tracked mas não no roadmap atual.

(Nenhum definido ainda — emergirá durante operação)

## Out of Scope

| Feature | Reason |
|---------|--------|
| WhatsApp Communities | Complexidade não justifica no momento |
| App mobile nativo | Web-first, admin panel responsivo suficiente |
| API oficial WhatsApp | Baileys atende, API oficial não suporta grupos grandes |
| Novo canal (Discord, etc.) | Foco em estabilizar Telegram + WhatsApp primeiro |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| POST-01 | Phase 1 | Pending |
| POST-02 | Phase 1 | Pending |
| POST-03 | Phase 1 | Pending |
| POST-04 | Phase 1 | Pending |
| QUEUE-01 | Phase 2 | Pending |
| LEAGUE-01 | Phase 3 | Pending |
| LEAGUE-02 | Phase 3 | Pending |
| LEAGUE-03 | Phase 3 | Pending |
| LEAGUE-04 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 9 total
- Mapped to phases: 9
- Unmapped: 0

---
*Requirements defined: 2026-04-07*
*Last updated: 2026-04-07 after roadmap creation*
