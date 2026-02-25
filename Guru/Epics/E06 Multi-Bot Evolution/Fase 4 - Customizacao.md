---
status: todo
tasks: 6
complexity: Media-Alta
design_dependency: true
tags: [phase, epic/e06]
---

# Fase 4 — Customizacao e Preview/Edicao

## Objetivo

Admins controlam o tom de voz e podem revisar/editar mensagens antes do envio.

**Dependencia**: Design de UI deve estar pronto antes das Tasks de UI (4.2 e 4.5). BotContext (Fase 2) ja disponivel.

## Tasks

| # | Task | Prioridade | Deps | Design? |
|---|------|-----------|------|---------|
| 4.1 | [[4.1 API Tom de Voz]] | medium | [[2.3 Migrations SQL]] | Nao |
| 4.2 | [[4.2 UI Tom de Voz]] | medium | [[4.1 API Tom de Voz]] | **Sim** |
| 4.3 | [[4.3 Integrar Tom copyService]] | medium | [[2.1 BotContext e BotRegistry]], [[4.1 API Tom de Voz]] | Nao |
| 4.4 | [[4.4 API Preview Mensagens]] | medium | [[4.3 Integrar Tom copyService]] | Nao |
| 4.5 | [[4.5 UI Preview Edicao]] | medium | [[4.4 API Preview Mensagens]] | **Sim** |
| 4.6 | [[4.6 Overrides Post-Now]] | medium | [[4.4 API Preview Mensagens]] | Nao |

## Acceptance Criteria

- [ ] **AC 4.1**: Given **group_admin** do Osmar na secao "Tom de Voz", when escreve "Informal, sem usar 'aposta', chamar de 'palpite'" e salva, then o backend converte em config estruturada e o proximo copy respeita as regras.
- [ ] **AC 4.2**: Given super_admin na secao "Tom de Voz" do grupo Guru, when usa os campos avancados (persona, palavras proibidas, CTA), then o copyService gera mensagem respeitando todas as configs.
- [ ] **AC 4.3**: Given operador clica "Preparar Postagem" no celular, when o preview e gerado, then cada bet aparece como card full-width com texto formatado, botoes de Editar/Regenerar/Remover acessiveis com thumb.
- [ ] **AC 4.4**: Given operador edita o texto de uma mensagem no preview, when confirma e envia, then o Telegram recebe o texto editado (nao o original gerado por LLM).
- [ ] **AC 4.5**: Given operador clica "Regenerar" em um card, when o novo texto e gerado, then um diff visual mostra o que mudou em relacao ao texto anterior.
- [ ] **AC 4.6**: Given operador remove uma bet do lote no preview, when confirma e envia, then apenas as bets restantes sao postadas.

## Testing Strategy

- **Unit tests**: testar injecao de tone config no prompt do copyService, testar conversao de texto livre em config estruturada, testar endpoints de preview e regenerate
- **E2E (Playwright)**: fluxo completo mobile — config tom -> preparar postagem -> editar preview -> confirmar envio -> verificar no Telegram
- **E2E**: testar que group_admin consegue editar tom de voz do seu grupo mas nao de outro
