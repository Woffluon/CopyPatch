import React, { useState, useEffect, useRef } from 'react';

type DemoLocale = 'en' | 'tr' | 'de';

interface CopyMap {
  [key: string]: string;
}

const DEFAULT_COPIES: Record<DemoLocale, CopyMap> = {
  en: {
    'demo.badge': 'Lightweight & Open-Source',
    'demo.title': 'Build something people actually use.',
    'demo.subtitle':
      'Let clients edit approved website copy inline on the live site without touching code or layout.',
    'demo.cta': 'Get Started Free',
    'demo.card1.title': 'Zero Layout Shift',
    'demo.card1.desc':
      'Only plain text strings are updated. Styles and DOM structure stay intact.',
    'demo.card2.title': 'SQLite Persistence',
    'demo.card2.desc':
      'Single-file local database with in-memory snapshot cache for fast reads.',
    'demo.card3.title': 'Argon2id Auth',
    'demo.card3.desc':
      'Cryptographically secure sessions with HttpOnly cookies and CSRF checks.',
  },
  tr: {
    'demo.badge': 'Hafif ve Açık Kaynak',
    'demo.title': 'İnsanların gerçekten kullandığı ürünler üretin.',
    'demo.subtitle':
      'Müşterilerinizin site metinlerini doğrudan canlı ortamda kod veya tasarıma dokunmadan güncellemesini sağlayın.',
    'demo.cta': 'Ücretsiz Başlayın',
    'demo.card1.title': 'Sıfır Düzen Bozulması',
    'demo.card1.desc':
      'Yalnızca düz metin dizgeleri güncellenir. Stiller ve DOM yapısı korunur.',
    'demo.card2.title': 'SQLite Kalıcılığı',
    'demo.card2.desc':
      'Hızlı okuma için bellek içi anlık görüntü önbelleğine sahip tek dosya veritabanı.',
    'demo.card3.title': 'Argon2id Güvenliği',
    'demo.card3.desc':
      'HttpOnly çerezleri ve CSRF denetimleriyle kriptografik olarak güvenli oturumlar.',
  },
  de: {
    'demo.badge': 'Schlank & Open-Source',
    'demo.title': 'Bauen Sie Produkte, die Menschen wirklich nutzen.',
    'demo.subtitle':
      'Ermöglichen Sie Kunden, genehmigte Texte direkt auf der Website zu bearbeiten, ohne Code zu verändern.',
    'demo.cta': 'Kostenlos starten',
    'demo.card1.title': 'Kein Layout-Shift',
    'demo.card1.desc':
      'Nur reine Textzeichenfolgen werden aktualisiert. Styles bleiben vollständig erhalten.',
    'demo.card2.title': 'SQLite-Persistenz',
    'demo.card2.desc':
      'Lokale Einzeldatei-Datenbank mit In-Memory-Snapshot-Cache für schnelle Ladezeiten.',
    'demo.card3.title': 'Argon2id-Sicherheit',
    'demo.card3.desc':
      'Sichere Sessions mit HttpOnly-Cookies und integriertem CSRF-Schutz.',
  },
};

const TOUR_EXAMPLES: Record<DemoLocale, { key: string; newText: string }> = {
  en: {
    key: 'demo.title',
    newText: 'Turn approved copy into instant live updates.',
  },
  tr: {
    key: 'demo.title',
    newText: 'Onaylanan metinleri anında canlıya aktarın.',
  },
  de: {
    key: 'demo.title',
    newText: 'Verwandeln Sie genehmigte Texte in sofortige Live-Updates.',
  },
};

const STORAGE_KEY = 'copypatch_demo_v2';

interface Props {
  defaultLocale?: string;
  siteLang?: string;
  compact?: boolean;
}

function getCssVar(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function useThemeColors() {
  const [colors, setColors] = useState({
    bg: '#08090a',
    surface: '#0f1011',
    surfaceElevated: '#161718',
    border: '#23252a',
    borderSubtle: 'rgba(255,255,255,0.05)',
    borderHover: '#383b3f',
    text: '#ffffff',
    textMuted: '#d0d6e0',
    textDim: '#8a8f98',
    accent: '#e4f222',
    diffAdd: '#27a644',
    diffAddBg: 'rgba(39, 166, 68, 0.12)',
    diffRemove: '#eb5757',
    diffRemoveBg: 'rgba(235, 87, 87, 0.12)',
  });

  const refresh = () => {
    setColors({
      bg: getCssVar('--cp-bg') || '#08090a',
      surface: getCssVar('--cp-surface') || '#0f1011',
      surfaceElevated: getCssVar('--cp-surface-elevated') || '#161718',
      border: getCssVar('--cp-border') || '#23252a',
      borderSubtle: getCssVar('--cp-border-subtle') || 'rgba(255,255,255,0.05)',
      borderHover: getCssVar('--cp-border-hover') || '#383b3f',
      text: getCssVar('--cp-text') || '#ffffff',
      textMuted: getCssVar('--cp-text-muted') || '#d0d6e0',
      textDim: getCssVar('--cp-text-dim') || '#8a8f98',
      accent: getCssVar('--cp-accent') || '#e4f222',
      diffAdd: getCssVar('--cp-diff-add') || '#27a644',
      diffAddBg: getCssVar('--cp-diff-add-bg') || 'rgba(39, 166, 68, 0.12)',
      diffRemove: getCssVar('--cp-diff-remove') || '#eb5757',
      diffRemoveBg: getCssVar('--cp-diff-remove-bg') || 'rgba(235, 87, 87, 0.12)',
    });
  };

  useEffect(() => {
    refresh();
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        if (m.type === 'attributes' && m.attributeName === 'data-theme') {
          setTimeout(refresh, 50);
        }
      });
    });
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  return colors;
}

export default function InteractiveDemo({ defaultLocale = 'en', siteLang = 'en', compact = false }: Props) {
  const initialLocale: DemoLocale = (defaultLocale === 'tr' || defaultLocale === 'de') ? defaultLocale : 'en';
  const [locale, setLocale] = useState<DemoLocale>(initialLocale);
  const [isEditMode, setIsEditMode] = useState<boolean>(true);
  const [showDiff, setShowDiff] = useState<boolean>(false);
  const [isTourPlaying, setIsTourPlaying] = useState<boolean>(false);
  const isTr = siteLang === 'tr' || locale === 'tr';
  const c = useThemeColors();

  const [published, setPublished] = useState<Record<DemoLocale, CopyMap>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    return DEFAULT_COPIES;
  });

  const [unsaved, setUnsaved] = useState<CopyMap>({});
  const [savedToast, setSavedToast] = useState<boolean>(false);
  const unsavedCount = Object.keys(unsaved).length;

  const handleSave = () => {
    if (unsavedCount === 0) return;
    const nextLocaleCopies = { ...published[locale], ...unsaved };
    const nextPublished = { ...published, [locale]: nextLocaleCopies };
    setPublished(nextPublished);
    setUnsaved({});
    setSavedToast(true);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(nextPublished)); } catch { /* ignore */ }
    setTimeout(() => setSavedToast(false), 2500);
  };

  const handleDiscard = () => {
    setUnsaved({});
  };

  const handleResetDemo = () => {
    setPublished(DEFAULT_COPIES);
    setUnsaved({});
    setShowDiff(false);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  };

  const handleTextChange = (key: string, newText: string) => {
    if (newText === published[locale][key]) {
      setUnsaved((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } else {
      setUnsaved((prev) => ({ ...prev, [key]: newText }));
    }
  };

  // Keyboard shortcut listener: Cmd/Ctrl + S to save, Esc to discard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (unsavedCount > 0) {
          handleSave();
        }
      } else if (e.key === 'Escape' && unsavedCount > 0) {
        e.preventDefault();
        handleDiscard();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [unsavedCount, published, locale, unsaved]);

  // Automated Tour simulation
  const handlePlayTour = async () => {
    if (isTourPlaying) return;
    setIsTourPlaying(true);
    setIsEditMode(true);
    const tour = TOUR_EXAMPLES[locale];
    const targetText = tour.newText;
    let current = '';

    for (let i = 0; i <= targetText.length; i++) {
      current = targetText.slice(0, i);
      setUnsaved((prev) => ({ ...prev, [tour.key]: current }));
      await new Promise((r) => setTimeout(r, 28));
    }

    setShowDiff(true);
    await new Promise((r) => setTimeout(r, 600));

    // Save
    const nextLocaleCopies = { ...published[locale], [tour.key]: targetText };
    const nextPublished = { ...published, [locale]: nextLocaleCopies };
    setPublished(nextPublished);
    setUnsaved({});
    setSavedToast(true);
    setTimeout(() => {
      setSavedToast(false);
      setIsTourPlaying(false);
    }, 2000);
  };

  return (
    <div style={{
      border: `1px solid ${c.border}`,
      borderRadius: '16px',
      backgroundColor: c.surface,
      overflow: 'hidden',
      position: 'relative',
      boxShadow: '0 16px 40px -8px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
      fontFamily: "'League Spartan', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      transition: 'box-shadow 200ms ease, border-color 200ms ease',
    }}>
      {/* Realistic Browser Window Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        backgroundColor: c.surfaceElevated,
        borderBottom: `1px solid ${c.border}`,
        flexWrap: 'wrap',
        gap: '8px',
      }}>
        {/* Left: Window Controls & Address Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '6px' }} aria-hidden="true">
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: c.borderHover, display: 'block' }} />
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: c.borderHover, display: 'block' }} />
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: c.borderHover, display: 'block' }} />
          </div>

          <div style={{
            fontSize: '11.5px',
            fontFamily: 'ui-monospace, "SF Mono", monospace',
            color: c.textMuted,
            backgroundColor: c.bg,
            padding: '3px 10px',
            borderRadius: '6px',
            border: `1px solid ${c.borderSubtle}`,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <span>https://app.com</span>
            {isEditMode && (
              <span style={{ color: c.text, fontWeight: 700, backgroundColor: c.surfaceElevated, padding: '1px 4px', borderRadius: '3px' }}>
                ?copypatch=1
              </span>
            )}
          </div>
        </div>

        {/* Right: Mode Switcher, Diff Toggle, Tour, Locale */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Play Auto-Tour Button */}
          <button
            type="button"
            onClick={handlePlayTour}
            disabled={isTourPlaying}
            title={isTr ? 'Otomatik düzenleme turunu izle' : 'Play interactive edit tour'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '3px 8px',
              borderRadius: '6px',
              border: `1px solid ${c.border}`,
              backgroundColor: isTourPlaying ? c.surfaceElevated : c.bg,
              color: c.text,
              fontSize: '11px',
              fontWeight: 600,
              cursor: isTourPlaying ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            <span>{isTourPlaying ? (isTr ? 'Oynatılıyor...' : 'Playing...') : (isTr ? 'Canlı Demo Oynat' : 'Play Tour')}</span>
          </button>

          {/* Diff Toggle Button */}
          <button
            type="button"
            onClick={() => setShowDiff((prev) => !prev)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '6px',
              border: `1px solid ${showDiff ? c.accent : c.border}`,
              backgroundColor: showDiff ? c.accent : c.bg,
              color: showDiff ? c.bg : c.textMuted,
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <span>{isTr ? 'Diff' : 'Diff'}</span>
            {unsavedCount > 0 && (
              <span style={{
                fontSize: '9px',
                padding: '0 4px',
                borderRadius: '9999px',
                backgroundColor: showDiff ? c.bg : c.accent,
                color: showDiff ? c.accent : c.bg,
                fontWeight: 700,
              }}>
                {unsavedCount}
              </span>
            )}
          </button>

          {/* Mode Switcher (Visitor vs Edit Mode) */}
          <div style={{
            display: 'flex',
            backgroundColor: c.bg,
            padding: '2px',
            borderRadius: '6px',
            border: `1px solid ${c.border}`,
          }}>
            <button
              type="button"
              onClick={() => setIsEditMode(false)}
              style={{
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: !isEditMode ? c.accent : 'transparent',
                color: !isEditMode ? c.bg : c.textMuted,
                fontFamily: 'inherit',
              }}
            >
              {isTr ? 'Ziyaretçi' : 'Visitor'}
            </button>
            <button
              type="button"
              onClick={() => setIsEditMode(true)}
              style={{
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: isEditMode ? c.accent : 'transparent',
                color: isEditMode ? c.bg : c.textMuted,
                fontFamily: 'inherit',
              }}
            >
              {isTr ? 'Düzenleme' : 'Edit Mode'}
            </button>
          </div>

          {/* Locale Switcher */}
          <div style={{
            display: 'flex',
            backgroundColor: c.bg,
            padding: '2px',
            borderRadius: '6px',
            border: `1px solid ${c.border}`,
          }}>
            {(['en', 'tr', 'de'] as DemoLocale[]).map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => { setLocale(loc); setUnsaved({}); }}
                style={{
                  padding: '3px 6px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: locale === loc ? c.surfaceElevated : 'transparent',
                  color: locale === loc ? c.text : c.textMuted,
                  textTransform: 'uppercase',
                  fontFamily: 'inherit',
                }}
              >
                {loc}
              </button>
            ))}
          </div>

          {/* Reset */}
          <button
            type="button"
            onClick={handleResetDemo}
            title={isTr ? 'Varsayılan metinlere sıfırla' : 'Reset to defaults'}
            style={{
              background: 'transparent',
              border: `1px solid ${c.border}`,
              color: c.textMuted,
              padding: '3px 6px',
              borderRadius: '6px',
              fontSize: '10px',
              cursor: 'pointer',
              fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            {isTr ? 'Sıfırla' : 'Reset'}
          </button>
        </div>
      </div>

      {/* Snapshot Diff Drawer (when open) */}
      {showDiff && (
        <div style={{
          backgroundColor: c.surfaceElevated,
          borderBottom: `1px solid ${c.border}`,
          padding: '10px 16px',
          fontSize: '12px',
          fontFamily: 'ui-monospace, "SF Mono", monospace',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, color: c.text, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '11px' }}>
              {isTr ? 'Canlı Snapshot Diff' : 'Live Snapshot Diff'} ({locale})
            </span>
            <span style={{ color: c.textDim, fontSize: '11px' }}>
              {unsavedCount === 0 ? (isTr ? 'Değişiklik yok' : 'No changes') : `${unsavedCount} ${isTr ? 'anahtar güncellendi' : 'key(s) modified'}`}
            </span>
          </div>

          {unsavedCount === 0 ? (
            <div style={{ color: c.textMuted, padding: '4px 0', fontSize: '11px' }}>
              {isTr ? 'Metinleri düzenleyerek diff çıktısını anında burada görebilirsiniz.' : 'Edit any text on the canvas to inspect real-time diff lines here.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '120px', overflowY: 'auto' }}>
              {Object.entries(unsaved).map(([key, newText]) => (
                <div key={key} style={{ backgroundColor: c.bg, border: `1px solid ${c.borderSubtle}`, borderRadius: '4px', padding: '6px 8px' }}>
                  <div style={{ color: c.textDim, fontWeight: 600, marginBottom: '2px', fontSize: '10.5px' }}>key: {key}</div>
                  <div style={{ color: c.diffRemove, backgroundColor: c.diffRemoveBg, padding: '2px 4px', borderRadius: '3px', textDecoration: 'line-through' }}>
                    - {published[locale][key]}
                  </div>
                  <div style={{ color: c.diffAdd, backgroundColor: c.diffAddBg, padding: '2px 4px', borderRadius: '3px', marginTop: '2px' }}>
                    + {newText}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Demo Stage / Canvas */}
      <div style={{
        padding: compact ? '24px 16px 64px' : '36px 20px 72px',
        minHeight: compact ? '280px' : '340px',
        position: 'relative',
        backgroundColor: c.bg,
      }}>
        {isEditMode && (
          <div style={{
            position: 'absolute',
            top: '10px',
            right: '12px',
            backgroundColor: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: '9999px',
            padding: '3px 8px',
            fontSize: '10.5px',
            color: c.textMuted,
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            pointerEvents: 'none',
          }}>
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: c.text, display: 'inline-block' }} />
            <span>{isTr ? 'Çerçeveli metne tıklayıp yazın' : 'Click outlined copy to edit'}</span>
          </div>
        )}

        <div style={{ maxWidth: '680px', margin: '0 auto', textAlign: 'center' }}>
          {/* Badge */}
          <div style={{ marginBottom: '12px' }}>
            <DemoEditableField
              contentKey="demo.badge"
              isEditMode={isEditMode}
              locale={locale}
              currentText={unsaved['demo.badge'] ?? published[locale]['demo.badge']}
              onTextChange={handleTextChange}
              colors={c}
              style={{
                display: 'inline-block',
                backgroundColor: c.surface,
                border: `1px solid ${c.border}`,
                padding: '3px 12px',
                borderRadius: '9999px',
                fontSize: '11px',
                color: c.textMuted,
                fontWeight: 600,
                letterSpacing: '0.04em',
              }}
            />
          </div>

          {/* Heading */}
          <div style={{ marginBottom: '12px' }}>
            <DemoEditableField
              contentKey="demo.title"
              isEditMode={isEditMode}
              locale={locale}
              as="h2"
              currentText={unsaved['demo.title'] ?? published[locale]['demo.title']}
              onTextChange={handleTextChange}
              colors={c}
              style={{
                fontSize: compact ? 'clamp(1.3rem, 2.5vw, 1.75rem)' : 'clamp(1.5rem, 3.2vw, 2.15rem)',
                fontWeight: 510,
                color: c.text,
                letterSpacing: '-0.022em',
                lineHeight: 1.1,
                margin: 0,
              }}
            />
          </div>

          {/* Subtitle */}
          <div style={{ marginBottom: '20px' }}>
            <DemoEditableField
              contentKey="demo.subtitle"
              isEditMode={isEditMode}
              locale={locale}
              as="p"
              currentText={unsaved['demo.subtitle'] ?? published[locale]['demo.subtitle']}
              onTextChange={handleTextChange}
              colors={c}
              style={{
                fontSize: compact ? '13.5px' : '15px',
                color: c.textMuted,
                fontWeight: 400,
                lineHeight: 1.5,
                maxWidth: '520px',
                margin: '0 auto',
              }}
            />
          </div>

          {/* CTA Button */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: compact ? '24px' : '32px' }}>
            <button
              type="button"
              style={{
                backgroundColor: c.accent,
                color: c.bg,
                border: `1px solid ${c.accent}`,
                padding: '8px 16px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 510,
                letterSpacing: '-0.011em',
                cursor: isEditMode ? 'default' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontFamily: 'inherit',
              }}
            >
              <DemoEditableField
                contentKey="demo.cta"
                isEditMode={isEditMode}
                locale={locale}
                currentText={unsaved['demo.cta'] ?? published[locale]['demo.cta']}
                onTextChange={handleTextChange}
                colors={c}
              />
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* 3 Feature Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
            textAlign: 'left',
          }}>
            {(['card1', 'card2', 'card3'] as const).map((card) => (
              <div key={card} style={{
                backgroundColor: c.surface,
                border: `1px solid ${c.border}`,
                borderRadius: '6px',
                padding: '12px',
              }}>
                <DemoEditableField
                  contentKey={`demo.${card}.title`}
                  isEditMode={isEditMode}
                  locale={locale}
                  as="h4"
                  currentText={unsaved[`demo.${card}.title`] ?? published[locale][`demo.${card}.title`]}
                  onTextChange={handleTextChange}
                  colors={c}
                  style={{ fontSize: '13px', fontWeight: 510, color: c.text, marginBottom: '4px', display: 'block', letterSpacing: '-0.011em' }}
                />
                <DemoEditableField
                  contentKey={`demo.${card}.desc`}
                  isEditMode={isEditMode}
                  locale={locale}
                  as="p"
                  currentText={unsaved[`demo.${card}.desc`] ?? published[locale][`demo.${card}.desc`]}
                  onTextChange={handleTextChange}
                  colors={c}
                  style={{ fontSize: '11.5px', color: c.textMuted, margin: 0, lineHeight: 1.45, fontWeight: 400 }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Floating Toolbar (Edit Mode) */}
      {isEditMode && (
        <aside
          role="toolbar"
          aria-label="CopyPatch Edit Toolbar"
          style={{
            position: 'absolute',
            bottom: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: c.surfaceElevated,
            border: `1px solid ${c.border}`,
            borderRadius: '9999px',
            padding: '4px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            zIndex: 10,
            whiteSpace: 'nowrap',
            maxWidth: '92%',
          }}
        >
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: c.text, display: 'block' }} />
            <strong style={{ fontSize: '11.5px', fontWeight: 700, color: c.text }}>CopyPatch</strong>
            <span style={{
              fontSize: '9.5px',
              backgroundColor: c.bg,
              color: c.textMuted,
              padding: '1px 4px',
              borderRadius: '3px',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}>
              {locale}
            </span>
          </div>

          <div style={{ width: '1px', height: '14px', backgroundColor: c.border }} />

          {/* Status */}
          <div style={{ fontSize: '11px' }}>
            {unsavedCount > 0 ? (
              <span style={{ color: c.text, fontWeight: 600 }}>
                ● {unsavedCount} {isTr ? 'değişiklik' : `edit${unsavedCount > 1 ? 's' : ''}`}
              </span>
            ) : (
              <span style={{ color: c.textMuted }}>{isTr ? 'Düzenlemeye hazır' : 'Ready'}</span>
            )}
          </div>

          <div style={{ width: '1px', height: '14px', backgroundColor: c.border }} />

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            {unsavedCount > 0 && (
              <button
                type="button"
                onClick={handleDiscard}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: c.textMuted,
                  fontSize: '11px',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  fontFamily: 'inherit',
                  borderRadius: '4px',
                }}
                title={isTr ? 'Değişiklikleri iptal et (Esc)' : 'Discard changes (Esc)'}
              >
                {isTr ? 'Geri Al' : 'Discard'}
              </button>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={unsavedCount === 0}
              style={{
                backgroundColor: unsavedCount > 0 ? c.accent : c.surface,
                color: unsavedCount > 0 ? c.bg : c.textDim,
                border: 'none',
                padding: '3px 10px',
                borderRadius: '9999px',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: unsavedCount > 0 ? 'pointer' : 'default',
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                boxShadow: unsavedCount > 0 ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                transition: 'all 150ms ease',
              }}
            >
              <span>{isTr ? 'Kaydet' : 'Save'}</span>
              {unsavedCount > 0 && (
                <span style={{
                  fontSize: '9px',
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  padding: '0 4px',
                  borderRadius: '3px',
                  fontWeight: 700,
                }}>
                  ⌘S
                </span>
              )}
            </button>
          </div>
        </aside>
      )}

      {/* Toast Notification */}
      {savedToast && (
        <div style={{
          position: 'absolute',
          top: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: c.accent,
          color: c.bg,
          padding: '4px 12px',
          borderRadius: '9999px',
          fontSize: '11.5px',
          fontWeight: 700,
          boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          zIndex: 20,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{isTr ? 'Anlık görüntü kaydedildi!' : 'Snapshot saved!'}</span>
        </div>
      )}
    </div>
  );
}

interface EditableFieldProps {
  contentKey: string;
  isEditMode: boolean;
  locale?: DemoLocale;
  currentText: string;
  as?: string;
  onTextChange: (key: string, text: string) => void;
  style?: React.CSSProperties;
  colors: ReturnType<typeof useThemeColors>;
}

function DemoEditableField({
  contentKey,
  isEditMode,
  currentText,
  as: Component = 'span',
  onTextChange,
  style = {},
  colors: c,
}: EditableFieldProps) {
  const ref = useRef<HTMLElement>(null);
  const [isFocused, setIsFocused] = useState<boolean>(false);

  useEffect(() => {
    if (ref.current && !isFocused && ref.current.textContent !== currentText) {
      ref.current.textContent = currentText;
    }
  }, [currentText, isFocused]);

  if (!isEditMode) {
    return React.createElement(Component, { style, 'data-copypatch': contentKey }, currentText);
  }

  const handleInput = (e: React.SyntheticEvent<HTMLElement>) => {
    onTextChange(contentKey, e.currentTarget.textContent || '');
  };

  const outlineStyle: React.CSSProperties = isFocused
    ? {
        outline: `2px solid ${c.accent}`,
        outlineOffset: '2px',
        backgroundColor: `${c.accent}14`,
        borderRadius: '3px',
        cursor: 'text',
      }
    : {
        outline: `1px dashed ${c.borderHover}`,
        outlineOffset: '2px',
        borderRadius: '3px',
        cursor: 'text',
      };

  return React.createElement(Component, {
    ref,
    role: 'textbox',
    'aria-label': `Edit ${contentKey}`,
    contentEditable: true,
    suppressContentEditableWarning: true,
    onInput: handleInput,
    onFocus: () => setIsFocused(true),
    onBlur: () => setIsFocused(false),
    'data-copypatch': contentKey,
    style: { ...style, ...outlineStyle, transition: 'outline 150ms ease, background-color 150ms ease' },
  }, currentText);
}
