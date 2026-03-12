import Link from 'next/link';

type LogoProps = {
  className?: string;
  href?: string;
  label?: string;
  wordmarkClassName?: string;
};

export function Logo({
  className = 'flex items-center',
  href = '/',
  label = 'BeemSpec home',
  wordmarkClassName = 'font-mono font-medium text-[15px] tracking-[-0.01em]',
}: LogoProps) {
  return (
    <Link href={href} className={className}>
      <span className={wordmarkClassName}>
        beemspec<span className="-ml-[0.08em] text-primary">.</span>
      </span>
      <span className="sr-only">{label}</span>
    </Link>
  );
}
