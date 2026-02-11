'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { GroupListItem } from '@/types/database';
import { statusConfig, formatDate } from './group-utils';

interface GroupCardProps {
  group: GroupListItem;
}

export function GroupCard({ group }: GroupCardProps) {
  const status = statusConfig[group.status];
  const botUsername = group.bot_pool?.[0]?.bot_username;
  const botInviteLink = botUsername ? `https://t.me/${botUsername}?start=subscribe` : null;
  const groupInviteLink = group.telegram_invite_link;
  const [copiedBot, setCopiedBot] = useState(false);

  async function copyBotLink(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!botInviteLink) return;
    await navigator.clipboard.writeText(botInviteLink);
    setCopiedBot(true);
    setTimeout(() => setCopiedBot(false), 2000);
  }

  return (
    <Link
      href={`/groups/${group.id}`}
      className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">{group.name}</h3>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}
        >
          {status.label}
        </span>
      </div>
      <p className="mt-2 text-sm text-gray-500">
        Criado em {formatDate(group.created_at)}
      </p>

      {(botInviteLink || groupInviteLink) && (
        <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.preventDefault()}>
          {botInviteLink && (
            <button
              onClick={copyBotLink}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 transition-colors"
              title="Copiar link do bot"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {copiedBot ? 'Copiado!' : `@${botUsername}`}
            </button>
          )}
          {groupInviteLink && (
            <a
              href={groupInviteLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-600 hover:bg-blue-100 transition-colors"
              title="Abrir grupo no Telegram"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Grupo Telegram
            </a>
          )}
        </div>
      )}
    </Link>
  );
}
