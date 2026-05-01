import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
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
          borderRadius: 6,
        }}
      >
        {/* Lantern / flame glyph */}
        <svg width="20" height="22" viewBox="0 0 20 22" fill="none">
          {/* body */}
          <rect x="4" y="7" width="12" height="11" rx="2" fill="#FBF7F0" opacity="0.9" />
          {/* flame */}
          <ellipse cx="10" cy="13" rx="3" ry="3.5" fill="#B05A3A" />
          <path d="M10 9.5 Q12 11.5 10 15 Q8 11.5 10 9.5Z" fill="#4A5340" opacity="0.5" />
          {/* handle top */}
          <path d="M7 7V5M13 7V5" stroke="#FBF7F0" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
          <path d="M7 5h6" stroke="#FBF7F0" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
          {/* base */}
          <path d="M4 18h12" stroke="#FBF7F0" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
