import { cn } from '@sweepr/utils'

interface SweeprLogoProps {
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  /** @deprecated unused — image scales naturally */
  showText?: boolean
}

const heights: Record<NonNullable<SweeprLogoProps['size']>, string> = {
  sm: 'h-7',
  md: 'h-10',
  lg: 'h-14',
  xl: 'h-20',
  '2xl': 'h-36',
}

export function SweeprLogo({ className, size = 'md' }: SweeprLogoProps) {
  return (
    <img
      src="/brand/sweepr-logo.png"
      alt="Sweepr"
      className={cn('w-auto object-contain', heights[size], className)}
      draggable={false}
    />
  )
}
