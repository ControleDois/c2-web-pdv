import logoSrc from '../assets/logo.png'

interface LogoProps {
  className?: string
}

export function Logo({ className }: LogoProps) {
  return <img src={logoSrc} alt="Controle Dois" className={className} />
}
