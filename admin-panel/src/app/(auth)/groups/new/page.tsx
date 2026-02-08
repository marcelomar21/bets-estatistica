import Link from 'next/link';
import { OnboardingWizard } from '@/components/features/groups/OnboardingWizard';

export default function NewGroupPage() {
  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <Link
          href="/groups"
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          &larr; Voltar para Grupos
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Onboarding de Influencer</h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <OnboardingWizard />
      </div>
    </div>
  );
}
