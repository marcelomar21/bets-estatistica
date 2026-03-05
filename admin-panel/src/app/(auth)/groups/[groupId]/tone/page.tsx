'use client';

import { useParams } from 'next/navigation';
import ToneConfigForm from '@/components/features/tone/ToneConfigForm';

export default function TonePage() {
  const params = useParams();
  const groupId = params.groupId as string;

  return <ToneConfigForm groupId={groupId} showBackLink />;
}
