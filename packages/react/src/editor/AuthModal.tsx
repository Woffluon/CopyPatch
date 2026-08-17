import React, { useState, useEffect } from 'react';
import { SessionAuthResponse, ApiErrorResponse } from '@copypatch/core';
import { CopyPatchStore } from '../store/store.js';

export interface AuthModalProps {
  apiBase: string;
  store: CopyPatchStore;
  onSuccess: (csrfToken: string) => void;
  onCancel: () => void;
}

export function AuthModal({ apiBase, store, onSuccess, onCancel }: AuthModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  // Close modal on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${apiBase}/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: window.location.origin,
        },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const data: ApiErrorResponse = await res.json().catch(() => ({}));
        setError(data.error?.message || 'Authentication failed. Please verify your passphrase.');
        setIsLoading(false);
        return;
      }

      const data: SessionAuthResponse = await res.json();
      if (data.authenticated && data.csrfToken) {
        onSuccess(data.csrfToken);
      } else {
        setError('Unexpected authentication response from server.');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Network error communicating with CopyPatch backend.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(3, 3, 5, 0.75)',
        backdropFilter: 'blur(16px) saturate(180%)',
        WebkitBackdropFilter: 'blur(16px) saturate(180%)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="copypatch-login-title"
    >
      {/* Outer Shell / Double-Bezel Architecture */}
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          padding: '6px',
          borderRadius: '24px',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow:
            '0 32px 64px -16px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.2)',
        }}
      >
        {/* Inner Core */}
        <div
          style={{
            backgroundColor: '#0e0e13',
            color: '#f4f4f5',
            borderRadius: '18px',
            padding: '28px 24px',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.08)',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.4)',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </div>
            <div>
              <h2
                id="copypatch-login-title"
                style={{
                  margin: 0,
                  fontSize: '17px',
                  fontWeight: 650,
                  letterSpacing: '-0.02em',
                  color: '#ffffff',
                }}
              >
                CopyPatch Editor
              </h2>
              <span style={{ fontSize: '11px', color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                Authentication Required
              </span>
            </div>
          </div>

          <p style={{ margin: '0 0 20px 0', fontSize: '13.5px', color: '#a1a1aa', lineHeight: 1.55 }}>
            Enter your configured editor passphrase to unlock direct inline editing on this website.
          </p>

          {error && (
            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#fca5a5',
                padding: '10px 14px',
                borderRadius: '10px',
                fontSize: '13px',
                marginBottom: '18px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                lineHeight: 1.4,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: '2px' }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '22px' }}>
              <label
                htmlFor="copypatch-password"
                style={{
                  display: 'block',
                  fontSize: '12.5px',
                  color: '#d4d4d8',
                  marginBottom: '8px',
                  fontWeight: 550,
                }}
              >
                Passphrase
              </label>
              <div
                style={{
                  position: 'relative',
                  borderRadius: '10px',
                  transition: 'all 200ms ease',
                  border: inputFocused
                    ? '1px solid #3b82f6'
                    : '1px solid rgba(255, 255, 255, 0.14)',
                  boxShadow: inputFocused ? '0 0 0 3px rgba(59, 130, 246, 0.25)' : 'none',
                }}
              >
                <input
                  id="copypatch-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  autoFocus
                  required
                  disabled={isLoading}
                  placeholder="Enter administrator passphrase..."
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '9px',
                    border: 'none',
                    backgroundColor: 'rgba(255, 255, 255, 0.04)',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', alignItems: 'center' }}>
              <button
                type="button"
                onClick={onCancel}
                disabled={isLoading}
                style={{
                  padding: '9px 16px',
                  borderRadius: '9999px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  color: '#d4d4d8',
                  fontSize: '13px',
                  cursor: 'pointer',
                  fontWeight: 500,
                  transition: 'all 150ms ease',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading || !password}
                style={{
                  padding: '9px 20px',
                  borderRadius: '9999px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  fontSize: '13px',
                  cursor: isLoading || !password ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.25)',
                  opacity: isLoading || !password ? 0.6 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 150ms cubic-bezier(0.32, 0.72, 0, 1)',
                }}
              >
                {isLoading ? (
                  <span>Unlocking...</span>
                ) : (
                  <>
                    <span>Unlock Editor</span>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
