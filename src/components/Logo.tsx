import logo from '../assets/Logo.png'

export default function Logo({ className = 'h-8 w-8' }: { className?: string }) {
  return <img src={logo} alt="Appointly" className={`${className} shrink-0 rounded-lg`} />
}
