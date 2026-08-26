'use client';

import React, { useState, useEffect } from 'react';
import type { ContentSnapshot } from '@copypatch/core';
import { NextCopyPatchProvider, EditableText, useCopyPatch } from '@copypatch/next';

interface AuraAppProps {
  initialSnapshot?: ContentSnapshot;
}

function AuraLandingPage({
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

  // useCopyPatch hook for primary CTA button text
  const primaryCtaText = useCopyPatch(
    'hero.cta',
    locale === 'en' ? 'Deploy Cluster' : 'Küme Başlat'
  );

  const bannerCtaText = useCopyPatch(
    'cta.button',
    locale === 'en' ? 'Deploy Your First Model' : 'İlk Modelinizi Dağıtın'
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      {/* Floating Island Header & Navigation */}
      <div className="aura-header-wrapper">
        <header className="aura-header-shell">
          <div className="aura-header-inner">
            <a href="#" className="aura-brand">
              <div className="aura-logo-icon">
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
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 3v18" />
                  <path d="M3 12h18" />
                </svg>
              </div>
              <EditableText contentKey="nav.brand" as="span">
                Aura Engine
              </EditableText>
            </a>

            {/* Desktop Navigation */}
            <nav className="aura-nav" aria-label="Main Navigation">
              <EditableText contentKey="nav.network" as="a" href="#network" className="aura-nav-link">
                {locale === 'en' ? 'Global Mesh' : 'Küresel Ağ'}
              </EditableText>
              <EditableText contentKey="nav.capabilities" as="a" href="#capabilities" className="aura-nav-link">
                {locale === 'en' ? 'Capabilities' : 'Yetenekler'}
              </EditableText>
              <EditableText contentKey="nav.benchmarks" as="a" href="#benchmarks" className="aura-nav-link">
                {locale === 'en' ? 'Benchmarks' : 'Performans'}
              </EditableText>
              <EditableText contentKey="nav.docs" as="a" href="#docs" className="aura-nav-link">
                {locale === 'en' ? 'Documentation' : 'Belgeler'}
              </EditableText>
            </nav>

            {/* Header Actions & Locale Toggle */}
            <div className="aura-header-actions">
              <div className="aura-locale-switch" role="group" aria-label="Language selection">
                <button
                  type="button"
                  onClick={() => setLocale('en')}
                  className={`aura-locale-btn ${locale === 'en' ? 'active' : ''}`}
                  aria-pressed={locale === 'en'}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => setLocale('tr')}
                  className={`aura-locale-btn ${locale === 'tr' ? 'active' : ''}`}
                  aria-pressed={locale === 'tr'}
                >
                  TR
                </button>
              </div>

              <button
                type="button"
                className="aura-mobile-toggle"
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

      {/* Mobile Dropdown */}
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
            backgroundColor: 'rgba(12, 14, 24, 0.95)',
            backdropFilter: 'blur(20px)',
            border: '1px solid var(--border-medium)',
            borderRadius: '20px',
            padding: '24px',
            boxShadow: 'var(--shadow-ambient)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <a href="#network" onClick={() => setMobileMenuOpen(false)} className="aura-nav-link" style={{ fontSize: '16px' }}>
              {locale === 'en' ? 'Global Mesh' : 'Küresel Ağ'}
            </a>
            <a href="#capabilities" onClick={() => setMobileMenuOpen(false)} className="aura-nav-link" style={{ fontSize: '16px' }}>
              {locale === 'en' ? 'Capabilities' : 'Yetenekler'}
            </a>
            <a href="#benchmarks" onClick={() => setMobileMenuOpen(false)} className="aura-nav-link" style={{ fontSize: '16px' }}>
              {locale === 'en' ? 'Benchmarks' : 'Performans'}
            </a>
            <a href="#docs" onClick={() => setMobileMenuOpen(false)} className="aura-nav-link" style={{ fontSize: '16px' }}>
              {locale === 'en' ? 'Documentation' : 'Belgeler'}
            </a>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main style={{ flex: 1 }}>
        {/* Hero Section */}
        <section className="aura-hero">
          <div className="aura-container">
            {/* Eyebrow Badge */}
            <div className="aura-hero-badge-wrap">
              <div className="aura-badge">
                <span className="aura-badge-dot" />
                <EditableText contentKey="hero.badge">
                  {locale === 'en'
                    ? 'Global GPU Mesh v4.8 Released'
                    : 'Küresel GPU Ağı v4.8 Yayında'}
                </EditableText>
              </div>
            </div>

            {/* Hero Title */}
            <EditableText
              contentKey="hero.title"
              as="h1"
              className="aura-hero-title"
            >
              {locale === 'en'
                ? 'Predictable Distributed Inference at Global Scale'
                : 'Küresel Ölçekte Öngörülebilir Dağıtık Yapay Zeka Çıkarımı'}
            </EditableText>

            {/* Hero Subtitle */}
            <EditableText
              contentKey="hero.subtitle"
              as="p"
              allowLineBreaks={true}
              className="aura-hero-desc"
            >
              {locale === 'en'
                ? 'Deploy fine-tuned foundation models across 38 edge clusters with sub-12ms time-to-first-token, deterministic cold-start SLAs, and continuous copy management via CopyPatch.'
                : 'CopyPatch ile entegre metin yönetimi, 12ms altı ilk token yanıt süresi ve 38 uç sunucu kümesinde ince ayarlı yapay zeka modelleri çalıştırın.'}
            </EditableText>

            {/* Hero Actions (Button-in-Button Architecture) */}
            <div className="aura-hero-actions">
              <button
                type="button"
                className="aura-btn aura-btn-primary"
              >
                <span>{primaryCtaText}</span>
                <div className="aura-btn-icon-circle">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                </div>
              </button>

              <button
                type="button"
                className="aura-btn aura-btn-secondary"
              >
                <EditableText contentKey="hero.secondary_cta">
                  {locale === 'en' ? 'View Live Telemetry' : 'Canlı Telemetriyi İncele'}
                </EditableText>
                <span className="aura-kbd">⌘B</span>
              </button>
            </div>

            {/* Quick Specs */}
            <div className="aura-hero-specs">
              <div className="aura-hero-spec-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                <span>Sub-12ms TTFT (p99)</span>
              </div>
              <div className="aura-hero-spec-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                <span>0ms SSR Hydration Mismatch</span>
              </div>
              <div className="aura-hero-spec-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                <span>38 Edge GPU Regions</span>
              </div>
              <div className="aura-hero-spec-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                <span>CopyPatch Inline Editing</span>
              </div>
            </div>
          </div>
        </section>

        {/* Live Telemetry Showcase (Double-Bezel Architecture) */}
        <section id="network" className="aura-telemetry-section">
          <div className="aura-container">
            <div className="aura-double-bezel">
              <div className="aura-telemetry-frame">
                <div className="aura-telemetry-header">
                  <div className="aura-telemetry-cluster">
                    <span className="aura-badge-dot" />
                    <EditableText contentKey="telemetry.cluster.title">
                      {locale === 'en' ? 'Global Edge Cluster Telemetry' : 'Küresel Uç Küme Telemetrisi'}
                    </EditableText>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--accent-cyan-text)' }}>
                    anycast-mesh://active-48
                  </div>
                </div>

                <div className="aura-telemetry-grid">
                  <div className="aura-telemetry-stat">
                    <EditableText contentKey="telemetry.stat1.val" as="div" className="aura-telemetry-val">
                      11.4ms
                    </EditableText>
                    <EditableText contentKey="telemetry.stat1.label" as="div" className="aura-telemetry-label">
                      {locale === 'en' ? 'TTFT Latency (p99)' : 'İlk Token Gecikmesi (p99)'}
                    </EditableText>
                  </div>

                  <div className="aura-telemetry-stat">
                    <EditableText contentKey="telemetry.stat2.val" as="div" className="aura-telemetry-val">
                      38 Regions
                    </EditableText>
                    <EditableText contentKey="telemetry.stat2.label" as="div" className="aura-telemetry-label">
                      {locale === 'en' ? 'Active Anycast Mesh' : 'Aktif Anycast Ağı'}
                    </EditableText>
                  </div>

                  <div className="aura-telemetry-stat">
                    <EditableText contentKey="telemetry.stat3.val" as="div" className="aura-telemetry-val">
                      99.999%
                    </EditableText>
                    <EditableText contentKey="telemetry.stat3.label" as="div" className="aura-telemetry-label">
                      {locale === 'en' ? 'Execution Reliability' : 'Çalışma Güvenilirliği'}
                    </EditableText>
                  </div>

                  <div className="aura-telemetry-stat">
                    <EditableText contentKey="telemetry.stat4.val" as="div" className="aura-telemetry-val">
                      14.2k tok/s
                    </EditableText>
                    <EditableText contentKey="telemetry.stat4.label" as="div" className="aura-telemetry-label">
                      {locale === 'en' ? 'Sustained Throughput' : 'Sürekli Çıktı Hızı'}
                    </EditableText>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Capabilities Section */}
        <section id="capabilities" className="aura-section">
          <div className="aura-container">
            <div className="aura-section-header">
              <EditableText contentKey="capabilities.tag" as="span" className="aura-section-tag">
                {locale === 'en' ? 'EDGE RUNTIME' : 'UÇ ÇALIŞMA ZAMANI'}
              </EditableText>
              <EditableText contentKey="capabilities.title" as="h2" className="aura-section-title">
                {locale === 'en'
                  ? 'Zero-Cold-Start Hardware Virtualization'
                  : 'Sıfır Soğuk Başlatmalı Donanım Sanallaştırma'}
              </EditableText>
              <EditableText contentKey="capabilities.desc" as="p" className="aura-section-desc">
                {locale === 'en'
                  ? 'Instantaneous container synthesis and model weights streaming over a 100 Gbps dedicated fiber backbone.'
                  : '100 Gbps fiber omurga üzerinden anlık konteyner sentezi ve model ağırlık akışı.'}
              </EditableText>
            </div>

            <div className="aura-capabilities-grid">
              {/* Card 1 */}
              <div className="aura-card">
                <div className="aura-card-inner">
                  <div className="aura-card-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
                    </svg>
                  </div>
                  <EditableText contentKey="card1.title" as="h3" className="aura-card-title">
                    {locale === 'en' ? 'Sub-Millisecond Anycast Routing' : 'Milisaniye Altı Anycast Yönlendirme'}
                  </EditableText>
                  <EditableText contentKey="card1.desc" as="p" className="aura-card-desc">
                    {locale === 'en'
                      ? 'Intelligent geo-anycast proxies forward user prompts to the nearest warm tensor core in under 1.2ms.'
                      : "Akıllı coğrafi anycast proxy'ler istemleri 1.2ms altında en yakın sıcak tensör çekirdeğine iletir."}
                  </EditableText>
                </div>
              </div>

              {/* Card 2 */}
              <div className="aura-card">
                <div className="aura-card-inner">
                  <div className="aura-card-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                      <line x1="6" y1="6" x2="6.01" y2="6" />
                      <line x1="6" y1="18" x2="6.01" y2="18" />
                    </svg>
                  </div>
                  <EditableText contentKey="card2.title" as="h3" className="aura-card-title">
                    {locale === 'en' ? 'Dynamic KV Cache Compression' : 'Dinamik KV Önbellek Sıkıştırması'}
                  </EditableText>
                  <EditableText contentKey="card2.desc" as="p" className="aura-card-desc">
                    {locale === 'en'
                      ? 'Adaptive 4-bit quant memory pooling delivers 3.8x throughput across 128k context windows.'
                      : 'Uyarlanabilir 4-bit bellek havuzu, 128k bağlam pencerelerinde 3.8 kat yüksek verim sağlar.'}
                  </EditableText>
                </div>
              </div>

              {/* Card 3 */}
              <div className="aura-card">
                <div className="aura-card-inner">
                  <div className="aura-card-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                      <line x1="12" y1="22.08" x2="12" y2="12" />
                    </svg>
                  </div>
                  <EditableText contentKey="card3.title" as="h3" className="aura-card-title">
                    {locale === 'en' ? 'Next.js App Router Snapshot SSR' : 'Next.js App Router Anlık Görüntü SSR'}
                  </EditableText>
                  <EditableText contentKey="card3.desc" as="p" className="aura-card-desc">
                    {locale === 'en'
                      ? 'Pre-renders a snapshot directly from the embedded backend for 0ms hydration mismatch and perfect SEO.'
                      : '0ms hidrasyon uyumsuzluğu ve tam SEO için gömülü backend’den anlık görüntüyü doğrudan oluşturur.'}
                  </EditableText>
                </div>
              </div>

              {/* Card 4 */}
              <div className="aura-card">
                <div className="aura-card-inner">
                  <div className="aura-card-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </div>
                  <EditableText contentKey="card4.title" as="h3" className="aura-card-title">
                    {locale === 'en' ? 'Live CopyPatch Editing' : 'Canlı CopyPatch Düzenleme'}
                  </EditableText>
                  <EditableText contentKey="card4.desc" as="p" className="aura-card-desc">
                    {locale === 'en'
                      ? 'Append ?copypatch=1 to dynamically inspect and edit all production copy without code changes.'
                      : 'Tüm üretim metinlerini kod değişikliği olmadan doğrudan tarayıcıda düzenlemek için ?copypatch=1 ekleyin.'}
                  </EditableText>
                </div>
              </div>
            </div>

            {/* RSC Showcase Banner (Double-Bezel Architecture) */}
            <div className="aura-rsc-shell" id="benchmarks">
              <div className="aura-rsc-card">
                <div>
                  <span className="aura-section-tag">
                    <EditableText contentKey="rsc.badge">
                      {locale === 'en' ? 'NEXT.JS APP ROUTER + COPYPATCH' : 'NEXT.JS APP ROUTER + COPYPATCH'}
                    </EditableText>
                  </span>
                  <EditableText contentKey="rsc.title" as="h3" style={{ fontSize: '24px', fontWeight: 700, marginBottom: '12px', color: '#ffffff' }}>
                    {locale === 'en'
                      ? 'Zero-Flicker Server Side Rendering'
                      : 'Titreşimsiz Sunucu Taraflı Oluşturma'}
                  </EditableText>
                  <EditableText contentKey="rsc.desc" as="p" style={{ fontSize: '14.5px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {locale === 'en'
                      ? 'Next.js Server Components fetch published snapshot directly from CopyPatch storage during SSR, preventing flash-of-fallback-text and enabling instantaneous visual editing in dev or staging.'
                      : 'Next.js Sunucu Bileşenleri, SSR sırasında yayınlanan içeriği doğrudan CopyPatch depolamasından çekerek metin sıçramasını önler ve anında görsel düzenleme sağlar.'}
                  </EditableText>
                </div>

                <div className="aura-rsc-code">
                  <div style={{ color: '#64748b', marginBottom: '8px' }}>// app/page.tsx (Server Component)</div>
                  <div><span style={{ color: '#06b6d4' }}>import</span> &#123; readPublishedSnapshot &#125; <span style={{ color: '#06b6d4' }}>from</span> <span style={{ color: '#a7f3d0' }}>&apos;@copypatch/next/server&apos;</span>;</div>
                  <div style={{ marginTop: '8px' }}><span style={{ color: '#06b6d4' }}>export default async function</span> <span style={{ color: '#93c5fd' }}>Page</span>() &#123;</div>
                  <div style={{ paddingLeft: '16px' }}>
                    <span style={{ color: '#06b6d4' }}>const</span> snapshot = <span style={{ color: '#06b6d4' }}>await</span> readPublishedSnapshot(backend, <span style={{ color: '#a7f3d0' }}>&apos;en&apos;</span>);
                  </div>
                  <div style={{ paddingLeft: '16px' }}>
                    <span style={{ color: '#06b6d4' }}>return</span> &lt;<span style={{ color: '#f43f5e' }}>NextCopyPatchProvider</span> initialSnapshot=&#123;snapshot&#125;&gt;...&lt;/<span style={{ color: '#f43f5e' }}>NextCopyPatchProvider</span>&gt;;
                  </div>
                  <div>&#125;</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Banner Section */}
        <section id="docs" className="aura-cta-section">
          <div className="aura-container">
            <div className="aura-cta-shell">
              <div className="aura-cta-card">
                <EditableText contentKey="cta.title" as="h2" className="aura-cta-title">
                  {locale === 'en'
                    ? 'Ready for deterministic sub-12ms inference?'
                    : 'Öngörülebilir 12ms altı yapay zeka çıkarımına hazır mısınız?'}
                </EditableText>
                <EditableText contentKey="cta.desc" as="p" className="aura-cta-desc">
                  {locale === 'en'
                    ? 'Deploy your custom weights to 38 edge regions in under 3 minutes. Zero credit card required for developer tier.'
                    : 'Özel model ağırlıklarınızı 3 dakikada 38 uç bölgeye dağıtın. Geliştirici paketi için kredi kartı gerekmez.'}
                </EditableText>
                <div className="aura-cta-actions">
                  <button
                    type="button"
                    className="aura-btn aura-btn-primary"
                  >
                    <span>{bannerCtaText}</span>
                    <div className="aura-btn-icon-circle">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="aura-btn aura-btn-secondary"
                  >
                    <EditableText contentKey="cta.secondary">
                      {locale === 'en' ? 'Read Technical Whitepaper' : 'Teknik Dokümanı Oku'}
                    </EditableText>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="aura-footer">
        <div className="aura-container">
          <div className="aura-footer-inner">
            <div className="aura-footer-brand">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="aura-logo-icon" style={{ width: '22px', height: '22px' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="9" />
                  </svg>
                </div>
                <span style={{ fontWeight: 700, fontSize: '15px' }}>Aura Engine</span>
              </div>
              <EditableText contentKey="footer.tagline" as="p" className="aura-footer-tagline">
                {locale === 'en'
                  ? 'The high-throughput distributed runtime for mission-critical AI workloads.'
                  : 'Kritik yapay zeka iş yükleri için yüksek verimli dağıtık çalışma ortamı.'}
              </EditableText>
            </div>

            <div className="aura-footer-status">
              <span className="aura-badge-dot" />
              <EditableText contentKey="footer.status">
                {locale === 'en' ? '38 / 38 Edge Clusters Healthy' : '38 / 38 Uç Küme Sağlıklı'}
              </EditableText>
            </div>
          </div>

          <div className="aura-footer-bottom">
            <EditableText contentKey="footer.copyright" as="p">
              {locale === 'en'
                ? '© 2026 Aura Engine Inc. Infrastructure for next-generation intelligence.'
                : '© 2026 Aura Engine Inc. Yeni nesil yapay zeka altyapısı.'}
            </EditableText>
            <div style={{ display: 'flex', gap: '16px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-disabled)' }}>
                Powered by Next.js + CopyPatch
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function AuraApp({ initialSnapshot }: AuraAppProps) {
  const [locale, setLocale] = useState<'en' | 'tr'>('en');

  return (
    <NextCopyPatchProvider
      locale={locale}
      apiBase="/__copypatch/api/v2"
      initialSnapshot={initialSnapshot}
    >
      <AuraLandingPage locale={locale} setLocale={setLocale} />
    </NextCopyPatchProvider>
  );
}
