import { NextResponse } from 'next/server';
import { createApiHandler } from '@/middleware/api-handler';
import { determineStatus, isValidUrl, normalizeLink } from '@/lib/bet-utils';
import type { BetStatus } from '@/types/database';

const MAX_BULK_ITEMS = 50;

export const POST = createApiHandler(
  async (req, context) => {
    const { supabase } = context;

    // Parse and validate request body
    let body: { updates?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Corpo da requisicao invalido' } },
        { status: 400 },
      );
    }

    if (!Array.isArray(body.updates) || body.updates.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Lista de updates vazia ou invalida' } },
        { status: 400 },
      );
    }

    if (body.updates.length > MAX_BULK_ITEMS) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: `Maximo de ${MAX_BULK_ITEMS} itens por request` } },
        { status: 400 },
      );
    }

    // Validate each item
    const seenIds = new Set<number>();
    for (const item of body.updates) {
      if (!item || typeof item !== 'object') {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'Item invalido na lista de updates' } },
          { status: 400 },
        );
      }
      if (!Number.isInteger(item.id) || item.id <= 0) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: `ID invalido: ${item.id}` } },
          { status: 400 },
        );
      }

      if (seenIds.has(item.id)) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: `ID duplicado na lista de updates: ${item.id}` } },
          { status: 400 },
        );
      }
      seenIds.add(item.id);

      if (!Object.prototype.hasOwnProperty.call(item, 'link')) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: `Campo obrigatorio ausente em bet ${item.id}: 'link'` } },
          { status: 400 },
        );
      }

      if (item.link !== null && typeof item.link !== 'string') {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: `Campo 'link' invalido para bet ${item.id}: deve ser string ou null` } },
          { status: 400 },
        );
      }

      const normalized = normalizeLink(item.link);
      if (normalized !== null && !isValidUrl(normalized)) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: `URL invalida para bet ${item.id}. O link deve comecar com http:// ou https://` } },
          { status: 400 },
        );
      }
    }

    const results = { updated: 0, promoted: 0, skipped: 0, failed: 0, errors: [] as Array<{ id: number; error: string }> };

    // Process sequentially to avoid race conditions
    for (const item of body.updates as Array<{ id: number; link: string | null }>) {
      const newLink = normalizeLink(item.link);

      // Fetch current bet
      const { data: current, error: fetchError } = await supabase
        .from('suggested_bets')
        .select('odds, deep_link, bet_status, promovida_manual')
        .eq('id', item.id)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        results.failed++;
        results.errors.push({ id: item.id, error: `DB_ERROR: ${fetchError.message}` });
        continue;
      }

      if (!current) {
        results.failed++;
        results.errors.push({ id: item.id, error: 'NOT_FOUND' });
        continue;
      }

      // Skip if link didn't change
      if ((current.deep_link ?? null) === newLink) {
        results.skipped++;
        continue;
      }

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
        .eq('id', item.id);

      if (updateError) {
        results.failed++;
        results.errors.push({ id: item.id, error: updateError.message });
        continue;
      }

      if (shouldUpdateStatus && newStatus === 'ready') {
        results.promoted++;
      }

      results.updated++;
    }

    return NextResponse.json({
      success: true,
      data: results,
    });
  },
  { allowedRoles: ['super_admin'] },
);
