import { DiscIcon } from '@phosphor-icons/react';
import { useState } from 'react';

interface ArtworkImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  /** Additional classes applied directly to the <img>, e.g. "scale-[1.33]" */
  imageClassName?: string;
}

export function ArtworkImage({
  src,
  alt = '',
  className = '',
  imageClassName = '',
}: ArtworkImageProps) {
  const [loaded, setLoaded] = useState(false);

  if (!src) return null;

  return (
    <div className={`relative ${className}`}>
      {!loaded && (
        <div className="absolute inset-0 bg-elevated flex items-center justify-center">
          <DiscIcon
            size={20}
            weight="duotone"
            className="text-faint animate-[spin_3s_linear_infinite]"
          />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'} ${imageClassName}`}
      />
    </div>
  );
}
