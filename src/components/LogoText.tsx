interface LogoTextProps {
  /** Tailwind classes controlling the base LedgerX text styling (size/weight/color). */
  className?: string;
  /** Override classes for the superscript "beta" tag. */
  betaClassName?: string;
}

/**
 * "LedgerX" wordmark with a subtle "beta" superscript — same visual trick
 * Google used on gmail/maps in their beta years. Use this wherever the brand
 * wordmark is rendered so the beta tag stays in sync across the app.
 */
export function LogoText({ className = '', betaClassName = '' }: LogoTextProps) {
  return (
    <span className={className}>
      LedgerX
      <sup
        className={`ml-0.5 text-[0.5em] font-semibold tracking-wide uppercase align-super ${betaClassName}`}
      >
        beta
      </sup>
    </span>
  );
}
