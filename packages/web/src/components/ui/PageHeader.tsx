import type React from 'react';

interface PageHeaderProps {
  icon: React.ElementType;
  title: string;
  subtitle?: string | React.ReactNode;
  children?: React.ReactNode;
}

export function PageHeader({ icon: Icon, title, subtitle, children }: PageHeaderProps) {
  const heading = (
    <h1 className='font-display text-3xl md:text-4xl text-accent tracking-wider flex items-center gap-2'>
      <Icon size={28} weight='duotone' className='shrink-0 relative top-1' />
      {title}
    </h1>
  );

  if (children) {
    return (
      <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 md:mb-8 shrink-0'>
        <div>
          {heading}
          {subtitle && <p className='font-mono text-xs text-muted mt-2'>{subtitle}</p>}
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className='mb-6 md:mb-8 shrink-0'>
      {heading}
      {subtitle && <p className='font-mono text-xs text-muted mt-2'>{subtitle}</p>}
    </div>
  );
}
