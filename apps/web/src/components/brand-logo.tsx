import Image from 'next/image';
import Link from 'next/link';

type BrandLogoProps = {
  href?: string;
  className?: string;
};

export function BrandLogo({ href, className = '' }: BrandLogoProps) {
  const content = (
    <span className={`dl-brand-logo ${className}`.trim()}>
      <Image
        src="/delayance-logo.png"
        alt=""
        width={32}
        height={32}
        className="dl-brand-logo-image"
        aria-hidden="true"
      />
      <span>Delayance</span>
    </span>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}
