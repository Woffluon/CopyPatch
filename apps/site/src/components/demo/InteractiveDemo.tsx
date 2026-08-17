import React, { useState, useEffect, useRef } from 'react';

type DemoLocale = 'en' | 'tr' | 'de';

interface CopyMap {
  [key: string]: string;
}

const DEFAULT_COPIES: Record<DemoLocale, CopyMap> = {
  en: {
    'demo.badge': '✦ Lightweight & Open-Source',
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
    'demo.badge': '✦ Hafif ve Açık Kaynak',
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
    'demo.badge': '✦ Schlank & Open-Source',
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

const STORAGE_KEY = 'copypatch_demo_v1';

interface Props {
  defaultLocale?: string;
  siteLang?: string;
}

// Get computed CSS variable value at runtime
function getCssVar(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function useThemeColors() {
  const [colors, setColors] = useState({
    bg: '#e4e2dd',
    surface: '#dddbd6',
    surfaceElevated: '#d5d3ce',
    border: 'rgba(43,43,43,0.15)',
    borderSubtle: 'rgba(43,43,43,0.08)',
    borderHover: 'rgba(43,43,43,0.28)',
    text: '#2b2b2b',
    textMuted: '#5a5a57',
    textDim: '#7d7b77',
    accent: '#2b2b2b',
  });

  const refresh = () => {
    setColors({
      bg: getCssVar('--cp-bg') || '#e4e2dd',
      surface: getCssVar('--cp-surface') || '#dddbd6',
      surfaceElevated: getCssVar('--cp-surface-elevated') || '#d5d3ce',
      border: getCssVar('--cp-border') || 'rgba(43,43,43,0.15)',
      borderSubtle: getCssVar('--cp-border-subtle') || 'rgba(43,43,43,0.08)',
      borderHover: getCssVar('--cp-border-hover') || 'rgba(43,43,43,0.28)',
      text: getCssVar('--cp-text') || '#2b2b2b',
      textMuted: getCssVar('--cp-text-muted') || '#5a5a57',
      textDim: getCssVar('--cp-text-dim') || '#7d7b77',
      accent: getCssVar('--cp-accent') || '#2b2b2b',
    });
  };

  useEffect(() => {
    refresh();
    // Re-sync when theme changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        if (m.type === 'attributes' && m.attributeName === 'data-theme') {
          // Small delay to let CSS vars propagate
          setTimeout(refresh, 50);
        }
      });
    });
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  return colors;
}

export default function InteractiveDemo({ defaultLocale = 'en', siteLang = 'en' }: Props) {
  const initialLocale: DemoLocale = (defaultLocale === 'tr' || defaultLocale === 'de') ? defaultLocale : 'en';
  const [locale, setLocale] = useState<DemoLocale>(initialLocale);
  const [isEditMode, setIsEditMode] = useState<boolean>(true);
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

  const handleDiscard = () => setUnsaved({});

  const handleResetDemo = () => {
    setPublished(DEFAULT_COPIES);
    setUnsaved({});
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  };

  const handleTextChange = (key: string, newText: string) => {
    setUnsaved((prev) => ({ ...prev, [key]: newText }));
  };

  return (
    <div style={{
      border: `1px solid ${c.border}`,
      borderRadius: '12px',
      backgroundColor: c.surface,
      overflow: 'hidden',
      position: 'relative',
      boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
      fontFamily: "'League Spartan', 'Helvetica Neue', Arial, sans-serif",
    }}>
      {/* Demo Browser Frame Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        backgroundColor: c.surfaceElevated,
        borderBottom: `1px solid ${c.border}`,
        flexWrap: 'wrap',
        gap: '10px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: c.border, display: 'block' }} />
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: c.border, display: 'block' }} />
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: c.border, display: 'block' }} />
          </div>
          <div style={{
            fontSize: '12px',
            fontFamily: 'ui-monospace, monospace',
            color: c.textMuted,
            backgroundColor: c.bg,
            padding: '4px 12px',
            borderRadius: '6px',
            border: `1px solid ${c.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <span>https://my-saas-app.com</span>
            {isEditMode && (
              <span style={{ color: c.text, fontWeight: 600 }}>?copypatch=1</span>
            )}
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Mode Switcher */}
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
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 500,
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
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: isEditMode ? c.accent : 'transparent',
                color: isEditMode ? c.bg : c.textMuted,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontFamily: 'inherit',
              }}
            >
              <span>{isTr ? 'Düzenleme' : 'Edit Mode'}</span>
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
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
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
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '11px',
              cursor: 'pointer',
              fontWeight: 500,
              fontFamily: 'inherit',
            }}
          >
            {isTr ? 'Sıfırla' : 'Reset'}
          </button>
        </div>
      </div>

      {/* Demo Stage */}
      <div style={{ padding: '40px 24px 80px', minHeight: '380px', position: 'relative', backgroundColor: c.bg }}>
        {isEditMode && (
          <div style={{
            position: 'absolute',
            top: '12px',
            right: '16px',
            backgroundColor: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: '6px',
            padding: '4px 10px',
            fontSize: '11px',
            color: c.textMuted,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            pointerEvents: 'none',
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: c.text, display: 'inline-block' }} />
            <span>{isTr ? 'Çerçeveli metinlere tıklayın' : 'Click outlined text to edit'}</span>
          </div>
        )}

        <div style={{ maxWidth: '780px', margin: '0 auto', textAlign: 'center' }}>
          {/* Badge */}
          <div style={{ marginBottom: '16px' }}>
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
                padding: '4px 14px',
                borderRadius: '9999px',
                fontSize: '12px',
                color: c.textMuted,
                fontWeight: 600,
                letterSpacing: '0.05em',
              }}
            />
          </div>

          {/* Heading */}
          <div style={{ marginBottom: '16px' }}>
            <DemoEditableField
              contentKey="demo.title"
              isEditMode={isEditMode}
              locale={locale}
              as="h1"
              currentText={unsaved['demo.title'] ?? published[locale]['demo.title']}
              onTextChange={handleTextChange}
              colors={c}
              style={{
                fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)',
                fontWeight: 800,
                color: c.text,
                letterSpacing: '-0.03em',
                lineHeight: 1.2,
                margin: 0,
              }}
            />
          </div>

          {/* Subtitle */}
          <div style={{ marginBottom: '28px' }}>
            <DemoEditableField
              contentKey="demo.subtitle"
              isEditMode={isEditMode}
              locale={locale}
              as="p"
              currentText={unsaved['demo.subtitle'] ?? published[locale]['demo.subtitle']}
              onTextChange={handleTextChange}
              colors={c}
              style={{
                fontSize: '16px',
                color: c.textMuted,
                lineHeight: 1.6,
                maxWidth: '600px',
                margin: '0 auto',
              }}
            />
          </div>

          {/* CTA Button */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '40px' }}>
            <button
              type="button"
              style={{
                backgroundColor: 'transparent',
                color: c.text,
                border: `1px solid ${c.accent}`,
                padding: '10px 24px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: isEditMode ? 'default' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* 3 Feature Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            textAlign: 'left',
          }}>
            {(['card1', 'card2', 'card3'] as const).map((card) => (
              <div key={card} style={{
                backgroundColor: c.surface,
                border: `1px solid ${c.border}`,
                borderRadius: '8px',
                padding: '16px',
              }}>
                <DemoEditableField
                  contentKey={`demo.${card}.title`}
                  isEditMode={isEditMode}
                  locale={locale}
                  as="h3"
                  currentText={unsaved[`demo.${card}.title`] ?? published[locale][`demo.${card}.title`]}
                  onTextChange={handleTextChange}
                  colors={c}
                  style={{ fontSize: '14px', fontWeight: 600, color: c.text, marginBottom: '6px', display: 'block' }}
                />
                <DemoEditableField
                  contentKey={`demo.${card}.desc`}
                  isEditMode={isEditMode}
                  locale={locale}
                  as="p"
                  currentText={unsaved[`demo.${card}.desc`] ?? published[locale][`demo.${card}.desc`]}
                  onTextChange={handleTextChange}
                  colors={c}
                  style={{ fontSize: '12px', color: c.textMuted, margin: 0, lineHeight: 1.5 }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Floating Toolbar (Edit Mode) */}
      {isEditMode && (
        <div
          role="toolbar"
          aria-label="CopyPatch Edit Toolbar"
          style={{
            position: 'absolute',
            bottom: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: '9999px',
            padding: '6px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
            zIndex: 10,
            whiteSpace: 'nowrap',
          }}
        >
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: c.text, display: 'block' }} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: c.text }}>CopyPatch</span>
            <span style={{
              fontSize: '10px',
              backgroundColor: c.surfaceElevated,
              color: c.textMuted,
              padding: '2px 5px',
              borderRadius: '4px',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}>
              {locale}
            </span>
          </div>

          <div style={{ width: '1px', height: '16px', backgroundColor: c.border }} />

          {/* Status */}
          <div style={{ fontSize: '12px' }}>
            {unsavedCount > 0 ? (
              <span style={{ color: c.text, fontWeight: 500 }}>
                ● {unsavedCount} {isTr ? 'bekleyen değişiklik' : `pending edit${unsavedCount > 1 ? 's' : ''}`}
              </span>
            ) : (
              <span style={{ color: c.textMuted }}>{isTr ? 'Düzenlemeye hazır' : 'Ready to edit'}</span>
            )}
          </div>

          <div style={{ width: '1px', height: '16px', backgroundColor: c.border }} />

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {unsavedCount > 0 && (
              <button
                type="button"
                onClick={handleDiscard}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: c.textMuted,
                  fontSize: '12px',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  fontFamily: 'inherit',
                }}
              >
                {isTr ? 'Geri Al' : 'Discard'}
              </button>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={unsavedCount === 0}
              style={{
                backgroundColor: unsavedCount > 0 ? c.accent : c.surfaceElevated,
                color: unsavedCount > 0 ? c.bg : c.textDim,
                border: 'none',
                padding: '4px 12px',
                borderRadius: '9999px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: unsavedCount > 0 ? 'pointer' : 'default',
                fontFamily: 'inherit',
              }}
            >
              {isTr ? 'Kaydet' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {savedToast && (
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: c.accent,
          color: c.bg,
          padding: '6px 14px',
          borderRadius: '9999px',
          fontSize: '12px',
          fontWeight: 600,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          zIndex: 20,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{isTr ? 'Kaydedildi!' : 'Changes saved!'}</span>
        </div>
      )}
    </div>
  );
}

interface EditableFieldProps {
  contentKey: string;
  isEditMode: boolean;
  locale: DemoLocale;
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
        outlineOffset: '3px',
        backgroundColor: `${c.accent}14`,
        borderRadius: '3px',
        cursor: 'text',
      }
    : {
        outline: `1px dashed ${c.borderHover}`,
        outlineOffset: '3px',
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
