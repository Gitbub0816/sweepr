/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { cn } from '@sweepr/utils'

interface SweeprLogoProps {
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  /** @deprecated unused — image scales naturally */
  showText?: boolean
}

const heights: Record<NonNullable<SweeprLogoProps['size']>, string> = {
  sm: 'h-10',
  md: 'h-14',
  lg: 'h-20',
  xl: 'h-28',
  '2xl': 'h-40',
}

export function SweeprLogo({ className, size = 'md' }: SweeprLogoProps) {
  return (
    <img
      src="/brand/sweepr-logo.png"
      alt="Sweepr"
      // Intrinsic size (3:2 aspect ratio) so the browser can reserve layout
      // space before the image loads — actual rendered size is still driven
      // by the height/width-auto classes below; this only prevents CLS.
      width={1536}
      height={1024}
      className={cn('w-auto object-contain', heights[size], className)}
      draggable={false}
    />
  )
}
