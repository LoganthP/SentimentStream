export default function Logo({ className = "h-9 w-9" }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="10" fill="#221B4B" className="dark:fill-[#2d255e]" />
      <path d="M5 21c3-6 6-6 9 0s6 6 9 0" stroke="var(--color-pos)" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M5 14c3-6 6-6 9 0s6 6 9 0" stroke="var(--color-neg)" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="26.5" cy="9" r="2.4" fill="var(--color-sun)" />
    </svg>
  );
}
