import React from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'w-8 h-8 rounded-lg',
  md: 'w-10 h-10 rounded-xl',
  lg: 'w-12 h-12 rounded-xl',
  xl: 'w-16 h-16 rounded-2xl',
};

export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 'sm', className = '' }) => {
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.sm;

  return (
    <div
      className={`relative shrink-0 flex items-center justify-center bg-gradient-to-br from-[#ff5e4d] via-[#e74c3c] to-[#c0392b] text-white shadow-md shadow-red-500/20 overflow-hidden ${sizeClass} ${className}`}
      aria-label="UK Expense Tracker Logo"
      role="img"
    >
      <svg
        className="w-[78%] h-[78%] text-white"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Baseline */}
        <path d="M3 20h18" strokeWidth="2.2" />
        {/* Rising Analytics Bars */}
        <path d="M6 20v-5" strokeWidth="2.5" />
        <path d="M11 20v-10" strokeWidth="2.5" />
        <path d="M16 20v-14" strokeWidth="2.5" />
        {/* Trend Accent */}
        <path d="M6 11l5-5 5 4" strokeWidth="1.6" strokeDasharray="1.5 1.5" />
      </svg>
      {/* British Pound (£) Accent Badge */}
      <div
        className="absolute top-[10%] right-[10%] bg-white text-[#e74c3c] font-black rounded-full flex items-center justify-center shadow-sm select-none"
        style={{
          width: size === 'sm' ? '11px' : size === 'md' ? '14px' : '16px',
          height: size === 'sm' ? '11px' : size === 'md' ? '14px' : '16px',
          fontSize: size === 'sm' ? '8px' : size === 'md' ? '9px' : '11px',
          lineHeight: 1,
        }}
      >
        £
      </div>
    </div>
  );
};
