const brlFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatBRL(price: number | null): string | null {
  if (price == null || isNaN(price)) return null;
  return brlFormatter.format(price);
}
