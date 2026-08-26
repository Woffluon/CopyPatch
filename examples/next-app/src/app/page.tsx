import React from 'react';
import { readPublishedSnapshot } from '@copypatch/next/server';
import { getCopyPatchBackend } from '../lib/copypatch';
import AuraApp from './AuraApp';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const backend = await getCopyPatchBackend();
  const snapshot = backend ? await readPublishedSnapshot(backend, 'en') : undefined;

  return <AuraApp initialSnapshot={snapshot} />;
}
