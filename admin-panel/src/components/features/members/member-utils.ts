import type { Member } from '@/types/database';

export type MemberDisplayStatus =
  | 'trial'
  | 'ativo'
  | 'vencendo'
  | 'inadimplente'
  | 'removido'
  | 'expirado';

export const memberStatusConfig: Record<MemberDisplayStatus, { label: string; className: string }> = {
  trial: { label: 'Trial', className: 'bg-blue-100 text-blue-800' },
  ativo: { label: 'Ativo', className: 'bg-green-100 text-green-800' },
  vencendo: { label: 'Vencendo', className: 'bg-yellow-100 text-yellow-800' },
  inadimplente: { label: 'Inadimplente', className: 'bg-red-100 text-red-800' },
  expirado: { label: 'Expirado', className: 'bg-red-100 text-red-800' },
  removido: { label: 'Removido', className: 'bg-gray-100 text-gray-800' },
};

type DisplayStatusInput = Pick<Member, 'status' | 'subscription_ends_at'>;

export function getDisplayStatus(member: DisplayStatusInput): MemberDisplayStatus {
  if (member.status === 'ativo' && member.subscription_ends_at) {
    const now = new Date();
    const endsAt = new Date(member.subscription_ends_at);

    if (endsAt <= now) return 'expirado';

    const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    if (endsAt <= sevenDaysAhead) return 'vencendo';
  }

  return member.status;
}
