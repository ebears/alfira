import type React from 'react';

interface PageHeaderProps {
  icon: React.ElementType;
  title: string;
  subtitle?: string | React.ReactNode;
  children?: React.ReactNode;
}

export function PageHeader({ icon: Icon, title, subtitle, children }: PageHeaderProps) {
  const heading = (
    <h1 className='font-display text-accent flex items-center gap-2 text-3xl tracking-wider md:text-4xl'>
      <Icon size={28} weight='duotone' className='relative top-1 shrink-0' />
      {title}
    </h1>
  );

  if (children != null) {
    return (
      <div className='mb-6 flex shrink-0 flex-col justify-between gap-3 sm:flex-row sm:items-center md:mb-8'>
        <div>
          {heading}
          {subtitle != null && <p className='text-muted mt-2 font-mono text-xs'>{subtitle}</p>}
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className='mb-6 shrink-0 md:mb-8'>
      {heading}
      {subtitle != null && <p className='text-muted mt-2 font-mono text-xs'>{subtitle}</p>}
    </div>
  );
}
