/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

interface LegalLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const heights: Record<NonNullable<LegalLogoProps["size"]>, string> = {
  sm: "40px",
  md: "56px",
  lg: "80px",
  xl: "112px",
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
