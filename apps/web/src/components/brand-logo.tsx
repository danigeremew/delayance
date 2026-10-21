import Image from 'next/image';
import Link from 'next/link';

type BrandLogoProps = {
  href?: string;
  className?: string;
  showName?: boolean;
};

export function BrandLogo({ href, className = '', showName = true }: BrandLogoProps) {
  const content = (
    <span className={`dl-brand-logo ${className}`.trim()}>
      <Image
        src="/delayance-logo.png"
        alt={showName ? '' : 'Delayance'}
        width={32}
        height={32}
        className="dl-brand-logo-image"
        aria-hidden={showName ? true : undefined}
      />
      {showName ? <span>Delayance</span> : null}
    </span>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}
