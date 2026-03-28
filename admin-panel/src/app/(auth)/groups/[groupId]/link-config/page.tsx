import { LinkConfigForm } from '@/components/features/links/LinkConfigForm';

interface LinkConfigPageProps {
  params: Promise<{ groupId: string }>;
}

export default async function LinkConfigPage({ params }: LinkConfigPageProps) {
  const { groupId } = await params;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <LinkConfigForm groupId={groupId} />
    </div>
  );
}
