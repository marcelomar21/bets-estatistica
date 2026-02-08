import type { BotPoolListItem } from '@/types/database';
import { botStatusConfig, formatDate } from './bot-utils';

interface BotCardProps {
  bot: BotPoolListItem;
}

export function BotCard({ bot }: BotCardProps) {
  const status = botStatusConfig[bot.status];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">{bot.bot_username}</h3>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}
        >
          {status.label}
        </span>
      </div>
      {bot.status === 'in_use' && bot.groups?.name && (
        <p className="mt-1 text-sm text-gray-600">
          Grupo: {bot.groups.name}
        </p>
      )}
      <p className="mt-2 text-sm text-gray-500">
        Criado em {formatDate(bot.created_at)}
      </p>
    </div>
  );
}
