import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0A0A0F' }}>
        <svg width={128} height={128} viewBox="0 0 40 40">
          <path d="M20 3C10.6 3 3 10.1 3 18.9c0 4.6 2.1 8.8 5.5 11.7L7 37l7.1-3.4c1.9.6 3.9.9 5.9.9 9.4 0 17-7.1 17-15.8S29.4 3 20 3Z" fill="#8B5CF6" />
          <path d="M13.5 13.5h13l-9.8 11h10" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    size,
  );
}
