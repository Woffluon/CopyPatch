import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { CopyPatchProvider, EditableText } from '@copypatch/react';

function FixtureApp() {
  const [locale, setLocale] = useState<'en' | 'tr'>('en');
  const [navigationOpen, setNavigationOpen] = useState(false);

  useEffect(() => {
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavigationOpen(false);
    };
    window.addEventListener('keydown', closeWithEscape);
    return () => window.removeEventListener('keydown', closeWithEscape);
  }, []);

  return (
    <CopyPatchProvider locale={locale} apiBase="/__copypatch/api/v2">
      <header>
        <div aria-label="Language selection" role="group">
          <button aria-pressed={locale === 'en'} onClick={() => setLocale('en')} type="button">EN</button>
          <button aria-pressed={locale === 'tr'} onClick={() => setLocale('tr')} type="button">TR</button>
        </div>
        <button aria-label="Open navigation menu" onClick={() => setNavigationOpen(true)} type="button">Menu</button>
      </header>
      {navigationOpen && (
        <div aria-label="Mobile Navigation" role="dialog">
          <button onClick={() => setNavigationOpen(false)} type="button">Close navigation menu</button>
        </div>
      )}
      <main>
        <EditableText contentKey="hero.title" as="h1">
          {locale === 'en' ? 'Public English snapshot' : 'Genel Turkce anlik goruntusu'}
        </EditableText>
      </main>
    </CopyPatchProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<FixtureApp />);
