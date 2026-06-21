interface LegalLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizes = { sm: 28, md: 40, lg: 56, xl: 80 };

// Inlined copy of @sweepr/ui SweeprLogo (legal site is standalone, no @sweepr/ui dep)
export function LegalLogo({ className, size = "sm" }: LegalLogoProps) {
  const px = sizes[size];
  return (
    <span
      className={["inline-flex items-center gap-2", className].filter(Boolean).join(" ")}
    >
      <svg
        width={px * 2.8}
        height={px}
        viewBox="0 0 280 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Sweepr"
      >
        <defs>
          <linearGradient id="legal-sweepr-grad" x1="0" y1="0" x2="280" y2="100" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#2DD4BF" />
            <stop offset="60%" stopColor="#14B8A6" />
            <stop offset="100%" stopColor="#0D9488" />
          </linearGradient>
          <linearGradient id="legal-broom-grad" x1="200" y1="0" x2="280" y2="80" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#2DD4BF" />
            <stop offset="100%" stopColor="#0D9488" />
          </linearGradient>
        </defs>
        <text
          x="8"
          y="72"
          fontFamily="'Georgia', 'Times New Roman', serif"
          fontSize="72"
          fontWeight="700"
          fontStyle="italic"
          fill="url(#legal-sweepr-grad)"
          letterSpacing="-2"
        >
          Sweepr
        </text>
        <line x1="232" y1="68" x2="264" y2="18" stroke="url(#legal-broom-grad)" strokeWidth="6" strokeLinecap="round" />
        <ellipse cx="228" cy="73" rx="14" ry="7" transform="rotate(-55 228 73)" fill="url(#legal-broom-grad)" />
        <g fill="#F59E0B">
          <polygon points="256,8 258,14 264,14 259,18 261,24 256,20 251,24 253,18 248,14 254,14" transform="scale(0.7) translate(110,-2)" />
          <polygon points="270,22 271,26 275,26 272,28 273,32 270,30 267,32 268,28 265,26 269,26" transform="scale(0.5) translate(230,10)" />
          <circle cx="249" cy="30" r="2.5" opacity="0.7" />
          <circle cx="268" cy="15" r="1.8" opacity="0.5" />
        </g>
      </svg>
    </span>
  );
}
