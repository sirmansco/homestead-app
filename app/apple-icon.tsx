import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#4A5340',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="144" height="124" viewBox="-13 -14 30 26" fill="none">
          <ellipse cx="1" cy="1" rx="9.5" ry="6.5" fill="#EDE5D6"/>
          <circle cx="-7" cy="-4" r="4.6" fill="#EDE5D6"/>
          <path d="M -9.5,-8 Q -12,-12 -8.5,-12.5 Q -5.5,-12.5 -6.8,-9.2" stroke="#EDE5D6" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
          <circle cx="-8.2" cy="-4.8" r="0.8" fill="#3A3F3D"/>
          <path d="M -3.1,-4.2 L 1.2,-2.8 L -2.6,-1.6 Z" fill="#D9A441"/>
          <path d="M 9,0 L 15,-3.5 L 13,2.8 Z" fill="#EDE5D6" opacity="0.85"/>
        </svg>
      </div>
    ),
    { ...size }
  );
}
