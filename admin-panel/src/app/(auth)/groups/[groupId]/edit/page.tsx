'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { GroupListItem } from '@/types/database';
import { GroupEditForm } from '@/components/features/groups/GroupEditForm';

export default function GroupEditPage() {
  const params = useParams<{ groupId: string }>();
  const router = useRouter();
  const groupId = params.groupId;

  const [group, setGroup] = useState<GroupListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchGroup() {
      try {
        const res = await fetch(`/api/groups/${groupId}`);
        const json = await res.json();

        if (!res.ok || !json.success) {
          if (res.status === 404) {
            setNotFound(true);
          } else {
            setError(json.error?.message || 'Erro ao carregar grupo');
          }
          return;
        }

        setGroup(json.data);
      } catch {
        setError('Erro ao carregar grupo');
      } finally {
        setLoading(false);
      }
    }

    fetchGroup();
  }, [groupId]);

  async function handleSubmit(data: Record<string, unknown>) {
    setSubmitLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/groups/${groupId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setError(json.error?.message || 'Erro ao salvar alteracoes');
        return;
      }

      router.push(`/groups/${groupId}`);
    } catch {
      setError('Erro ao salvar alteracoes');
    } finally {
      setSubmitLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="h-8 bg-gray-200 rounded w-1/2"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Grupo nao encontrado</h2>
        <p className="text-gray-600 mb-6">O grupo que voce esta tentando editar nao existe ou foi removido.</p>
        <Link
          href="/groups"
          className="text-blue-600 hover:text-blue-800"
        >
          &larr; Voltar para Grupos
        </Link>
      </div>
    );
  }

  if (!group) {
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Link
          href={`/groups/${groupId}`}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          &larr; Voltar para Detalhes
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Editar Grupo</h1>

        <GroupEditForm
          initialData={group}
          onSubmit={handleSubmit}
          loading={submitLoading}
          error={error}
        />
      </div>
    </div>
  );
}
