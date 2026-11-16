/** Brand mark: a split-flap tile showing a falling price. */
export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={className}>
      <rect width="32" height="32" rx="7" fill="#ffd23f" />
      <rect x="7" y="5" width="18" height="22" rx="3" fill="#15181e" />
      <rect x="7" y="5" width="18" height="11" rx="3" fill="#262b34" />
      <rect x="7" y="13" width="18" height="3" fill="#262b34" />
      <path d="M11 12.5 16 19l5-6.5" fill="none" stroke="#ffd23f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="7" y="15.6" width="18" height="0.9" fill="#15181e" />
    </svg>
  );
}
