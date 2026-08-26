import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { CopyPatchProvider, EditableText, useCopyPatch } from '@copypatch/react';
import './styles.css';

function AppContent({
  locale,
  setLocale,
}: {
  locale: 'en' | 'tr';
  setLocale: (loc: 'en' | 'tr') => void;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  // useCopyPatch hooks for dynamic button labels
  const primaryCtaText = useCopyPatch(
    'home.hero.cta',
    locale === 'en' ? 'Start Free Trial' : 'Ücretsiz Başlayın'
  );

  const bannerCtaText = useCopyPatch(
    'cta.button',
    locale === 'en' ? 'Get Started with Kite' : "Kite'ı Kullanmaya Başlayın"
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      {/* Floating Island Header & Navigation */}
      <div className="kite-header-wrapper">
        <header className="kite-header-shell">
          <div className="kite-header-inner">
            {/* Logo & Brand */}
            <a href="#" className="kite-brand">
              <div className="kite-logo-icon">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2L2 12l10 10 10-10L12 2z" />
                  <path d="M12 2v20" />
                  <path d="M2 12h20" />
                </svg>
              </div>
              <EditableText contentKey="nav.brand" as="span">
                Kite
              </EditableText>
            </a>

            {/* Desktop Navigation */}
            <nav className="kite-nav" aria-label="Main Navigation">
              <EditableText contentKey="nav.features" as="a" href="#features" className="kite-nav-link">
                {locale === 'en' ? 'Features' : 'Özellikler'}
              </EditableText>
              <EditableText contentKey="nav.workflow" as="a" href="#workflow" className="kite-nav-link">
                {locale === 'en' ? 'Workflow' : 'İş Akışı'}
              </EditableText>
              <EditableText contentKey="nav.architecture" as="a" href="#architecture" className="kite-nav-link">
                {locale === 'en' ? 'Architecture' : 'Mimari'}
              </EditableText>
              <EditableText contentKey="nav.pricing" as="a" href="#pricing" className="kite-nav-link">
                {locale === 'en' ? 'Pricing' : 'Fiyatlandırma'}
              </EditableText>
            </nav>

            {/* Header Actions & Locale Toggle */}
            <div className="kite-header-actions">
              <div className="kite-locale-switch" role="group" aria-label="Language selection">
                <button
                  type="button"
                  onClick={() => setLocale('en')}
                  className={`kite-locale-btn ${locale === 'en' ? 'active' : ''}`}
                  aria-pressed={locale === 'en'}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => setLocale('tr')}
                  className={`kite-locale-btn ${locale === 'tr' ? 'active' : ''}`}
                  aria-pressed={locale === 'tr'}
                >
                  TR
                </button>
              </div>

              <button
                type="button"
                className="kite-mobile-toggle"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                aria-expanded={mobileMenuOpen}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        </header>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation"
          style={{
            position: 'fixed',
            top: '80px',
            left: '16px',
            right: '16px',
            zIndex: 999,
            backgroundColor: 'rgba(14, 14, 22, 0.95)',
            backdropFilter: 'blur(20px)',
            border: '1px solid var(--border-medium)',
            borderRadius: '20px',
            padding: '24px',
            boxShadow: 'var(--shadow-ambient)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <a href="#features" onClick={() => setMobileMenuOpen(false)} className="kite-nav-link" style={{ fontSize: '16px' }}>
              {locale === 'en' ? 'Features' : 'Özellikler'}
            </a>
            <a href="#workflow" onClick={() => setMobileMenuOpen(false)} className="kite-nav-link" style={{ fontSize: '16px' }}>
              {locale === 'en' ? 'Workflow' : 'İş Akışı'}
            </a>
            <a href="#architecture" onClick={() => setMobileMenuOpen(false)} className="kite-nav-link" style={{ fontSize: '16px' }}>
              {locale === 'en' ? 'Architecture' : 'Mimari'}
            </a>
            <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="kite-nav-link" style={{ fontSize: '16px' }}>
              {locale === 'en' ? 'Pricing' : 'Fiyatlandırma'}
            </a>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main style={{ flex: 1 }}>
        {/* Hero Section */}
        <section className="kite-hero">
          <div className="kite-container">
            {/* Eyebrow Badge */}
            <div className="kite-hero-badge-wrap">
              <div className="kite-badge">
                <span className="kite-badge-dot" />
                <EditableText contentKey="home.hero.badge">
                  {locale === 'en'
                    ? 'Kite 2.0 is now live for high-output engineering teams'
                    : 'Mühendislik ekipleri için Kite 2.0 yayında'}
                </EditableText>
              </div>
            </div>

            {/* Hero Title */}
            <EditableText
              contentKey="home.hero.title"
              as="h1"
              className="kite-hero-title"
            >
              {locale === 'en'
                ? 'Build something people actually use.'
                : 'İnsanların gerçekten kullandığı şeyler üretin.'}
            </EditableText>

            {/* Hero Subtitle */}
            <EditableText
              contentKey="home.hero.subtitle"
              as="p"
              allowLineBreaks={true}
              className="kite-hero-desc"
            >
              {locale === 'en'
                ? 'A frictionless, keyboard-first task engine built for engineers who ship. Zero clutter, instant sync, and deep GitHub bidirectional integration.'
                : 'Üreten mühendisler için tasarlanmış, klavye odaklı akıcı görev motoru. Sıfır karmaşa, anında senkronizasyon ve derin GitHub entegrasyonu.'}
            </EditableText>

            {/* Hero Actions (Button-in-Button Architecture) */}
            <div className="kite-hero-actions">
              <button
                type="button"
                className="kite-btn kite-btn-primary"
              >
                <span>{primaryCtaText}</span>
                <div className="kite-btn-icon-circle">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </div>
              </button>

              <button
                type="button"
                className="kite-btn kite-btn-secondary"
              >
                <EditableText contentKey="home.hero.secondary_cta">
                  {locale === 'en' ? 'Explore Interactive Demo' : 'İnteraktif Demoyu İncele'}
                </EditableText>
                <span className="kite-kbd">⌘K</span>
              </button>
            </div>

            {/* Quick Specs */}
            <div className="kite-hero-specs">
              <div className="kite-hero-spec-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                <span>Sub-15ms sync</span>
              </div>
              <div className="kite-hero-spec-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                <span>Zero Electron bloat</span>
              </div>
              <div className="kite-hero-spec-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                <span>Git branch automation</span>
              </div>
              <div className="kite-hero-spec-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                <span>CopyPatch inline ready</span>
              </div>
            </div>
          </div>
        </section>

        {/* UI Preview Section (Double-Bezel Architecture) */}
        <section className="kite-preview-section">
          <div className="kite-container">
            <div className="kite-double-bezel">
              <div className="kite-mockup-frame">
                <div className="kite-mockup-header">
                  <div className="kite-mockup-dots">
                    <div className="kite-mockup-dot" />
                    <div className="kite-mockup-dot" />
                    <div className="kite-mockup-dot" />
                  </div>
                  <div className="kite-mockup-search">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                    <span>kite issue --status=in-progress --tag=infra</span>
                  </div>
                  <div className="kite-mockup-badge">
                    <EditableText contentKey="workspace.badge.speed">
                      {locale === 'en' ? '< 18ms latency' : '< 18ms gecikme'}
                    </EditableText>
                  </div>
                </div>

                <div className="kite-mockup-body">
                  <div className="kite-mockup-grid">
                    <div className="kite-mockup-sidebar">
                      <div className="kite-mockup-tree-item active">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 14 14" /></svg>
                        <span>Active Sprint (v2.4)</span>
                      </div>
                      <div className="kite-mockup-tree-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                        <span>Triage Inbox (8)</span>
                      </div>
                      <div className="kite-mockup-tree-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>
                        <span>Pull Requests</span>
                      </div>
                      <div className="kite-mockup-tree-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                        <span>Architecture Docs</span>
                      </div>
                    </div>

                    <div className="kite-mockup-content">
                      <div className="kite-mockup-card">
                        <div className="kite-mockup-card-header">
                          <EditableText contentKey="workspace.task.tag" as="span" className="kite-mockup-tag">
                            {locale === 'en' ? 'IN PROGRESS' : 'DEVAM EDİYOR'}
                          </EditableText>
                          <span className="kite-mockup-id">KT-4082</span>
                        </div>
                        <EditableText contentKey="workspace.task.title" as="div" className="kite-mockup-title">
                          {locale === 'en'
                            ? 'Refactor Postgres connection pool for high-concurrency writes'
                            : 'Yüksek eşzamanlı yazmalar için Postgres bağlantı havuzunu yeniden yapılandır'}
                        </EditableText>
                        <div className="kite-mockup-meta">
                          <EditableText contentKey="workspace.task.assignee" as="span">
                            {locale === 'en' ? 'Assigned to Core Infrastructure' : 'Çekirdek Altyapı Ekibine Atandı'}
                          </EditableText>
                          <span>•</span>
                          <span>branch: feat/pg-pool-tuning</span>
                        </div>
                      </div>

                      <div className="kite-mockup-card" style={{ opacity: 0.8 }}>
                        <div className="kite-mockup-card-header">
                          <span className="kite-mockup-tag" style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>
                            READY FOR REVIEW
                          </span>
                          <span className="kite-mockup-id">KT-4080</span>
                        </div>
                        <div className="kite-mockup-title">
                          {locale === 'en'
                            ? 'Implement client-side optimistic UI updates for ticket mutations'
                            : 'Bilet güncellemeleri için istemci taraflı iyimser UI desteği ekle'}
                        </div>
                        <div className="kite-mockup-meta">
                          <span>Assigned to Frontend Team</span>
                          <span>•</span>
                          <span>PR #142 approved</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="kite-stats-section">
          <div className="kite-container">
            <div className="kite-stats-grid">
              <div className="kite-stat-card">
                <div className="kite-stat-inner">
                  <EditableText contentKey="stats.s1.val" as="div" className="kite-stat-val">
                    18ms
                  </EditableText>
                  <EditableText contentKey="stats.s1.label" as="div" className="kite-stat-label">
                    {locale === 'en' ? 'Average Keypress Latency' : 'Ortalama Tuş Tepki Süresi'}
                  </EditableText>
                </div>
              </div>

              <div className="kite-stat-card">
                <div className="kite-stat-inner">
                  <EditableText contentKey="stats.s2.val" as="div" className="kite-stat-val">
                    100%
                  </EditableText>
                  <EditableText contentKey="stats.s2.label" as="div" className="kite-stat-label">
                    {locale === 'en' ? 'Offline First & Git Synced' : 'Çevrimdışı Uyumlu & Git Eşzamanlı'}
                  </EditableText>
                </div>
              </div>

              <div className="kite-stat-card">
                <div className="kite-stat-inner">
                  <EditableText contentKey="stats.s3.val" as="div" className="kite-stat-val">
                    4.2x
                  </EditableText>
                  <EditableText contentKey="stats.s3.label" as="div" className="kite-stat-label">
                    {locale === 'en' ? 'Faster Sprint Execution' : 'Daha Hızlı Sprint Tamamlama'}
                  </EditableText>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="kite-features-section">
          <div className="kite-container">
            <div className="kite-section-header">
              <EditableText contentKey="features.tag" as="span" className="kite-section-tag">
                {locale === 'en' ? 'ENGINEERING FIRST' : 'MÜHENDİSLİK ODAKLI'}
              </EditableText>
              <EditableText contentKey="features.title" as="h2" className="kite-section-title">
                {locale === 'en'
                  ? 'Built for teams that measure speed in milliseconds'
                  : 'Hızı milisaniyelerle ölçen ekipler için geliştirildi'}
              </EditableText>
              <EditableText contentKey="features.desc" as="p" className="kite-section-desc">
                {locale === 'en'
                  ? 'Designed from first principles to eliminate administrative drag and keep developers in flow state.'
                  : 'Geliştiricilerin odaklanmasını korumak ve bürokratik engelleri kaldırmak için sıfırdan tasarlandı.'}
              </EditableText>
            </div>

            <div className="kite-features-grid">
              {/* Feature 1 */}
              <div className="kite-feature-card">
                <div className="kite-feature-inner">
                  <div className="kite-feature-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="16 18 22 12 16 6" />
                      <polyline points="8 6 2 12 8 18" />
                    </svg>
                  </div>
                  <EditableText contentKey="features.f1.title" as="h3" className="kite-feature-title">
                    {locale === 'en' ? 'Zero Code Disruption' : 'Sıfır Kod Bozulması'}
                  </EditableText>
                  <EditableText contentKey="features.f1.desc" as="p" className="kite-feature-desc">
                    {locale === 'en'
                      ? 'Only plain strings are modified. HTML structure and CSS styles stay pristine.'
                      : 'Sadece düz metinler düzenlenir. HTML yapısı ve CSS stilleri güvendedir.'}
                  </EditableText>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="kite-feature-card">
                <div className="kite-feature-inner">
                  <div className="kite-feature-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <ellipse cx="12" cy="5" rx="9" ry="3" />
                      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                    </svg>
                  </div>
                  <EditableText contentKey="features.f2.title" as="h3" className="kite-feature-title">
                    {locale === 'en' ? 'SQLite Persistence' : 'SQLite Kalıcılığı'}
                  </EditableText>
                  <EditableText contentKey="features.f2.desc" as="p" className="kite-feature-desc">
                    {locale === 'en'
                      ? 'High read efficiency with zero-query in-memory caching and single-file database.'
                      : 'Sıfır sorgulu bellek önbelleği ve tek dosyalık veritabanı ile yüksek hız.'}
                  </EditableText>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="kite-feature-card">
                <div className="kite-feature-inner">
                  <div className="kite-feature-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                  <EditableText contentKey="features.f3.title" as="h3" className="kite-feature-title">
                    {locale === 'en' ? 'Safe Authentication' : 'Güvenli Kimlik Doğrulama'}
                  </EditableText>
                  <EditableText contentKey="features.f3.desc" as="p" className="kite-feature-desc">
                    {locale === 'en'
                      ? 'Argon2id hashing, secure HttpOnly sessions, CSRF headers, and origin verification.'
                      : 'Argon2id şifreleme, güvenli HttpOnly oturumları ve CSRF koruması.'}
                  </EditableText>
                </div>
              </div>

              {/* Feature 4 */}
              <div className="kite-feature-card">
                <div className="kite-feature-inner">
                  <div className="kite-feature-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="6" y1="3" x2="6" y2="15" />
                      <circle cx="18" cy="6" r="3" />
                      <circle cx="6" cy="18" r="3" />
                      <path d="M18 9a9 9 0 0 1-9 9" />
                    </svg>
                  </div>
                  <EditableText contentKey="features.f4.title" as="h3" className="kite-feature-title">
                    {locale === 'en' ? 'Bilateral Git Sync' : 'Çift Yönlü Git Senkronizasyonu'}
                  </EditableText>
                  <EditableText contentKey="features.f4.desc" as="p" className="kite-feature-desc">
                    {locale === 'en'
                      ? 'Branch names, commits, and pull requests automatically map to active sprint milestones.'
                      : "Dal isimleri, commit'ler ve PR'lar aktif sprint hedefleriyle otomatik eşleşir."}
                  </EditableText>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Workflow Section */}
        <section id="workflow" className="kite-workflow-section">
          <div className="kite-container">
            <div className="kite-section-header">
              <span className="kite-section-tag">
                {locale === 'en' ? 'FLOW ARCHITECTURE' : 'İŞ AKIŞI MİMARİSİ'}
              </span>
              <h2 className="kite-section-title">
                {locale === 'en' ? 'From thought to deployment in three keystrokes' : 'Fikirden canlıya üç tuş vuruşunda'}
              </h2>
            </div>

            <div className="kite-workflow-grid">
              <div className="kite-workflow-step">
                <div className="kite-workflow-inner">
                  <span className="kite-workflow-num">01</span>
                  <EditableText contentKey="workflow.step1.title" as="h3" className="kite-workflow-title">
                    {locale === 'en' ? 'Capture instantly' : 'Anında Yakala'}
                  </EditableText>
                  <EditableText contentKey="workflow.step1.desc" as="p" className="kite-workflow-desc">
                    {locale === 'en'
                      ? 'Hit ⌘+Shift+Space anywhere to file an issue without leaving your IDE or terminal.'
                      : 'IDE veya terminalinizden çıkmadan ⌘+Shift+Space ile anında görev oluşturun.'}
                  </EditableText>
                </div>
              </div>

              <div className="kite-workflow-step">
                <div className="kite-workflow-inner">
                  <span className="kite-workflow-num">02</span>
                  <EditableText contentKey="workflow.step2.title" as="h3" className="kite-workflow-title">
                    {locale === 'en' ? 'Auto-branch & trace' : 'Otomatik Dal & İzleme'}
                  </EditableText>
                  <EditableText contentKey="workflow.step2.desc" as="p" className="kite-workflow-desc">
                    {locale === 'en'
                      ? 'Git branch creation automatically transitions tasks and tracks PR review cycles.'
                      : 'Git dalı açıldığında görevler otomatik ilerler ve PR inceleme süreçleri izlenir.'}
                  </EditableText>
                </div>
              </div>

              <div className="kite-workflow-step">
                <div className="kite-workflow-inner">
                  <span className="kite-workflow-num">03</span>
                  <EditableText contentKey="workflow.step3.title" as="h3" className="kite-workflow-title">
                    {locale === 'en' ? 'Ship & close' : 'Dağıt & Kapat'}
                  </EditableText>
                  <EditableText contentKey="workflow.step3.desc" as="p" className="kite-workflow-desc">
                    {locale === 'en'
                      ? 'Merging into production updates sprint burn-down and notifies stakeholders in real time.'
                      : 'Canlıya birleştirme sprint grafiğini otomatik günceller ve ekibi bilgilendirir.'}
                  </EditableText>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Banner Section */}
        <section id="pricing" className="kite-cta-section">
          <div className="kite-container">
            <div className="kite-cta-shell">
              <div className="kite-cta-card">
                <EditableText contentKey="cta.title" as="h2" className="kite-cta-title">
                  {locale === 'en'
                    ? 'Ready to accelerate your engineering cycle?'
                    : 'Mühendislik döngünüzü hızlandırmaya hazır mısınız?'}
                </EditableText>
                <EditableText contentKey="cta.subtitle" as="p" className="kite-cta-desc">
                  {locale === 'en'
                    ? 'Start your 14-day trial today. No credit card required. Migrate from Jira or Linear in under 2 minutes.'
                    : '14 günlük ücretsiz denemenizi bugün başlatın. Kredi kartı gerekmez. Jira veya Linear verilerinizi 2 dakikada aktarın.'}
                </EditableText>
                <div className="kite-cta-actions">
                  <button
                    type="button"
                    className="kite-btn kite-btn-primary"
                  >
                    <span>{bannerCtaText}</span>
                    <div className="kite-btn-icon-circle">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="kite-btn kite-btn-secondary"
                  >
                    <EditableText contentKey="cta.secondary">
                      {locale === 'en' ? 'Talk to Solutions Architect' : 'Çözüm Mimarı ile Görüşün'}
                    </EditableText>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="kite-footer">
        <div className="kite-container">
          <div className="kite-footer-inner">
            <div className="kite-footer-brand">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="kite-logo-icon" style={{ width: '22px', height: '22px' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5">
                    <path d="M12 2L2 12l10 10 10-10L12 2z" />
                  </svg>
                </div>
                <span style={{ fontWeight: 700, fontSize: '15px' }}>Kite</span>
              </div>
              <EditableText contentKey="footer.tagline" as="p" className="kite-footer-tagline">
                {locale === 'en'
                  ? 'Minimal task architecture for high-output engineering teams.'
                  : 'Yüksek üretkenlikli mühendislik ekipleri için yalın görev mimarisi.'}
              </EditableText>
            </div>

            <div className="kite-footer-status">
              <span className="kite-badge-dot" />
              <EditableText contentKey="footer.status">
                {locale === 'en' ? 'All Systems Operational' : 'Tüm Sistemler Çalışıyor'}
              </EditableText>
            </div>
          </div>

          <div className="kite-footer-bottom">
            <EditableText contentKey="footer.copyright" as="p">
              {locale === 'en'
                ? '© 2026 Kite Technologies Inc. All rights reserved.'
                : '© 2026 Kite Technologies Inc. Tüm hakları saklıdır.'}
            </EditableText>
            <div style={{ display: 'flex', gap: '16px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-disabled)' }}>
                Powered by CopyPatch
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function App() {
  const [locale, setLocale] = useState<'en' | 'tr'>('en');

  return (
    <CopyPatchProvider locale={locale} apiBase="/__copypatch/api/v2">
      <AppContent locale={locale} setLocale={setLocale} />
    </CopyPatchProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
