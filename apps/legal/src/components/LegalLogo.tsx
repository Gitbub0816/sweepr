interface LegalLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const heights: Record<NonNullable<LegalLogoProps["size"]>, string> = {
  sm: "28px",
  md: "40px",
  lg: "56px",
  xl: "80px",
};

export function LegalLogo({ className, size = "sm" }: LegalLogoProps) {
  return (
    <img
      src="/brand/sweepr-logo.png"
      alt="Sweepr"
      style={{ height: heights[size], width: "auto", objectFit: "contain" }}
      className={className}
      draggable={false}
    />
  );
}
