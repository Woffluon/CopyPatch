import React from 'react';
import { fetchServerSnapshot } from '@copypatch/next/server';
import AuraApp from './AuraApp';

export default async function Page() {
  // Server-side snapshot fetch for optimal SEO and zero hydration mismatch
  const snapshot = await fetchServerSnapshot('en', {
    apiBaseUrl: process.env.COPYPATCH_API_URL || 'http://localhost:4040',
    revalidate: 60,
  });

  return <AuraApp initialSnapshot={snapshot} />;
}
