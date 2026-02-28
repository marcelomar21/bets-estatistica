import type { WhatsAppNumberStatus } from '@/types/database';

export const whatsappStatusConfig: Record<WhatsAppNumberStatus, { label: string; className: string }> = {
  available: { label: 'Disponivel', className: 'bg-green-100 text-green-800' },
  active: { label: 'Ativo', className: 'bg-blue-100 text-blue-800' },
  backup: { label: 'Backup', className: 'bg-cyan-100 text-cyan-800' },
  banned: { label: 'Banido', className: 'bg-red-100 text-red-800' },
  cooldown: { label: 'Cooldown', className: 'bg-yellow-100 text-yellow-800' },
  connecting: { label: 'Conectando', className: 'bg-orange-100 text-orange-800' },
};

export function formatPhoneNumber(phone: string): string {
  // Format +5511999887766 → +55 11 99988-7766
  if (phone.startsWith('+55') && phone.length === 14) {
    return `+55 ${phone.slice(3, 5)} ${phone.slice(5, 10)}-${phone.slice(10)}`;
  }
  return phone;
}
