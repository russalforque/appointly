import type { SVGProps } from 'react'

// lucide-react 1.x dropped brand marks, so these three are drawn here: simplified, single-colour,
// inheriting currentColor like the lucide icons they sit beside.

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

const base = (size: number) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true })

export function FacebookIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H7.9v3h2.6V21h3z" />
    </svg>
  )
}

export function InstagramIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg {...base(size)} fill="none" stroke="currentColor" strokeWidth={1.9} {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function TikTokIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M16.6 3h-3.1v12.2a2.7 2.7 0 1 1-2.7-2.7c.3 0 .6 0 .8.1V9.5a5.9 5.9 0 1 0 5 5.8V9.1a7.6 7.6 0 0 0 4.4 1.4V7.4a4.4 4.4 0 0 1-4.4-4.4z" />
    </svg>
  )
}
