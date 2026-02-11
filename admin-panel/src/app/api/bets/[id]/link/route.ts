import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { determineStatus, isValidUrl, normalizeLink } from '@/lib/bet-utils';
import type { BetStatus } from '@/types/database';

export const PATCH = createApiHandler(
  async (req, context, routeContext) => {
    const { supabase } = context;
    const { id } = await routeContext.params;
    const betId = Number.parseInt(id, 10);

    if (Number.isNaN(betId) || betId <= 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'ID de aposta invalido' } },
        { status: 400 },
      );
    }

    // Parse and validate request body
    let body: { link?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Corpo da requisicao invalido' } },
        { status: 400 },
      );
    }

    if (!body || typeof body !== 'object' || !Object.prototype.hasOwnProperty.call(body, 'link')) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: "Campo obrigatorio ausente: 'link'" } },
        { status: 400 },
      );
    }

    if (body.link !== null && typeof body.link !== 'string') {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: "Campo 'link' deve ser string ou null" } },
        { status: 400 },
      );
    }

    // Normalize link: trim + null if empty
    const newLink = normalizeLink(body.link);

    // Validate URL format if link is provided
    if (newLink !== null && !isValidUrl(newLink)) {
      const trimmed = newLink.trim();
      if (trimmed.length > 2048) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'URL muito longa (maximo 2048 caracteres)' } },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'URL invalida. O link deve comecar com http:// ou https://' } },
        { status: 400 },
      );
    }

    // Fetch current bet
    const { data: current, error: fetchError } = await supabase
      .from('suggested_bets')
      .select('id, odds, deep_link, bet_status, promovida_manual')
      .eq('id', betId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: 'Erro ao buscar aposta' } },
        { status: 500 },
      );
    }

    if (!current) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Aposta nao encontrada' } },
        { status: 404 },
      );
    }

    // Skip if link didn't change
    if ((current.deep_link ?? null) === newLink) {
      return NextResponse.json({
        success: true,
        data: {
          bet: current,
          promoted: false,
          old_link: current.deep_link,
          new_link: newLink,
        },
      });
    }

    const oldLink = current.deep_link;
    const newStatus = determineStatus(
      current.bet_status as BetStatus,
      current.odds,
      newLink,
      current.promovida_manual,
    );
    const shouldUpdateStatus = newStatus !== current.bet_status && current.bet_status !== 'posted';

    const updatePayload: { deep_link: string | null; bet_status?: BetStatus } = { deep_link: newLink };
    if (shouldUpdateStatus) {
      updatePayload.bet_status = newStatus;
    }

    // Update link (and status when needed) in a single query
    const { error: updateError } = await supabase
      .from('suggested_bets')
      .update(updatePayload)
      .eq('id', betId);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: { code: 'DB_ERROR', message: 'Erro ao atualizar link' } },
        { status: 500 },
      );
    }

    const promoted = shouldUpdateStatus && newStatus === 'ready';

    // Fetch updated bet for response
    const { data: updatedBet } = await supabase
      .from('suggested_bets')
      .select('*')
      .eq('id', betId)
      .single();

    return NextResponse.json({
      success: true,
      data: {
        bet: updatedBet ?? current,
        promoted,
        old_link: oldLink,
        new_link: newLink,
      },
    });
  },
  { allowedRoles: ['super_admin'] },
);
