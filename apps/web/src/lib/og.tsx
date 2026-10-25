import { ImageResponse } from 'next/og';

export const OG_SIZE = { width: 1200, height: 630 };

/** Brand mark as plain SVG paths (satori renders inline SVG). */
function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#A78BFA" />
          <stop offset="0.5" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#6D28D9" />
        </linearGradient>
      </defs>
      <path d="M20 3C10.6 3 3 10.1 3 18.9c0 4.6 2.1 8.8 5.5 11.7L7 37l7.1-3.4c1.9.6 3.9.9 5.9.9 9.4 0 17-7.1 17-15.8S29.4 3 20 3Z" fill="url(#g)" />
      <path d="M13.5 13.5h13l-9.8 11h10" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Shared 1200×630 social card: dark surface, purple glow, brand mark and copy. */
export function brandCard({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: 'radial-gradient(circle at 78% 18%, rgba(139,92,246,0.45), rgba(10,10,15,0) 55%), #0A0A0F',
          color: '#FFFFFF',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <Mark size={64} />
          <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>Talkzi</span>
          <span style={{ marginLeft: 16, fontSize: 24, color: '#A78BFA' }}>{eyebrow}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <span style={{ fontSize: title.length > 48 ? 56 : 68, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2 }}>{title}</span>
          <span style={{ fontSize: 28, color: '#B4B4C7', lineHeight: 1.35 }}>{subtitle}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 22, color: '#B4B4C7' }}>
          <span>Official WhatsApp Business Cloud API</span>
          <span>Made in Pakistan · PKR & USD</span>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
