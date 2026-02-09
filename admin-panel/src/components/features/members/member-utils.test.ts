import { describe, it, expect, vi, afterEach } from 'vitest';
import { getDisplayStatus, memberStatusConfig } from './member-utils';

describe('member-utils', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('expõe configuração de labels e classes para todos os status visuais', () => {
    expect(memberStatusConfig.trial.label).toBe('Trial');
    expect(memberStatusConfig.ativo.label).toBe('Ativo');
    expect(memberStatusConfig.vencendo.label).toBe('Vencendo');
    expect(memberStatusConfig.inadimplente.label).toBe('Inadimplente');
    expect(memberStatusConfig.expirado.label).toBe('Expirado');
    expect(memberStatusConfig.removido.label).toBe('Removido');
  });

  it('retorna vencendo para membro ativo que vence em menos de 7 dias', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-09T00:00:00Z'));

    const displayStatus = getDisplayStatus({
      status: 'ativo',
      subscription_ends_at: '2026-02-12T00:00:00Z',
    });

    expect(displayStatus).toBe('vencendo');
  });

  it('retorna expirado para membro ativo com vencimento no passado', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-09T00:00:00Z'));

    const displayStatus = getDisplayStatus({
      status: 'ativo',
      subscription_ends_at: '2026-02-01T00:00:00Z',
    });

    expect(displayStatus).toBe('expirado');
  });

  it('retorna ativo para membro ativo que vence após 7 dias', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-09T00:00:00Z'));

    const displayStatus = getDisplayStatus({
      status: 'ativo',
      subscription_ends_at: '2026-02-20T00:00:00Z',
    });

    expect(displayStatus).toBe('ativo');
  });

  it('mantém status originais para trial, inadimplente e removido', () => {
    expect(getDisplayStatus({ status: 'trial', subscription_ends_at: null })).toBe('trial');
    expect(getDisplayStatus({ status: 'inadimplente', subscription_ends_at: null })).toBe('inadimplente');
    expect(getDisplayStatus({ status: 'removido', subscription_ends_at: null })).toBe('removido');
  });
});
