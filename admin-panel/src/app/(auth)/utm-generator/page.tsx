'use client';

import { UtmBuilder } from '@/components/features/utm/UtmBuilder';

export default function UtmGeneratorPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Gerador de UTM</h1>
        <p className="mt-1 text-sm text-gray-500">
          Gere URLs com parâmetros UTM para rastrear a origem das suas campanhas.
        </p>
      </div>
      <UtmBuilder />
    </div>
  );
}
