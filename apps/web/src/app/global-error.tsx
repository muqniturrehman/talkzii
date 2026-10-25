'use client';

import * as React from 'react';

/**
 * Last-resort boundary when the root layout itself fails. It replaces the
 * whole document, so it renders its own <html> with inline styles.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0A0A0F', color: '#FFFFFF', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ textAlign: 'center', padding: 24, maxWidth: 440 }}>
          <p style={{ fontSize: 56, fontWeight: 700, margin: 0, color: '#A78BFA' }}>500</p>
          <h1 style={{ fontSize: 22, margin: '8px 0' }}>Talkzi couldn’t load</h1>
          <p style={{ color: '#B4B4C7', lineHeight: 1.5 }}>
            Please refresh the page. If the problem continues, contact support{error.digest ? ` with reference ${error.digest}` : ''}.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 16, padding: '10px 18px', borderRadius: 12, border: 0, background: '#8B5CF6', color: '#FFFFFF', fontWeight: 600, cursor: 'pointer' }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
