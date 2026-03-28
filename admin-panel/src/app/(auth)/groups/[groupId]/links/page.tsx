import Link from 'next/link';
import { LinkConfigForm } from '@/components/features/links/LinkConfigForm';

export default async function GroupLinksPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Link
          href={`/groups/${groupId}`}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          &larr; Voltar para Grupo
        </Link>
      </div>
      <LinkConfigForm groupId={groupId} />
    </div>
  );
}
