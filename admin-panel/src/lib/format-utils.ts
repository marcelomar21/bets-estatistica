const TZ = 'America/Sao_Paulo';

function safeFormat(dateString: string, options: Intl.DateTimeFormatOptions): string {
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { ...options, timeZone: TZ }).format(d);
}

/** DD/MM/YYYY */
export function formatDate(dateString: string) {
  return safeFormat(dateString, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** DD/MM/YYYY HH:MM */
export function formatDateTime(dateString: string) {
  return safeFormat(dateString, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** DD/MM HH:MM */
export function formatDateTimeShort(dateString: string) {
  return safeFormat(dateString, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** DD/MM HH:MM:SS */
export function formatDateTimeWithSeconds(dateString: string) {
  return safeFormat(dateString, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
