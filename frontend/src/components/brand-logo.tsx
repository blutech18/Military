import Image from "next/image";

interface BrandLogoProps {
  size?: number;
  className?: string;
  priority?: boolean;
}

export function BrandLogo({ size = 40, className, priority = false }: Readonly<BrandLogoProps>) {
  return (
    <Image
      src="/logo.png"
      alt="ArmoryDB logo"
      width={size}
      height={size}
      priority={priority}
      className={className}
    />
  );
}
