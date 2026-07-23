import { DiscordLogoIcon } from '@phosphor-icons/react';
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';

import { SpringUp } from '../components/ui/SpringUp';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // If already authenticated, go straight to songs.
  useEffect(() => {
    if (!loading && user) {
      void navigate('/songs', { replace: true });
    }
  }, [user, loading, navigate]);

  const bgStyle = useMemo(
    () => ({
      backgroundImage: `repeating-linear-gradient(
          0deg,
          transparent,
          transparent 40px,
          #c8f135 40px,
          #c8f135 41px
        ),
        repeating-linear-gradient(
          90deg,
          transparent,
          transparent 40px,
          #c8f135 40px,
          #c8f135 41px
        )`,
    }),
    []
  );

  if (loading) {
    return null;
  }

  return (
    <div className='bg-elevated relative flex min-h-screen items-center justify-center overflow-hidden'>
      {/* Background texture */}
      <div className='absolute inset-0 opacity-[0.03]' style={bgStyle} />

      {/* Card */}
      <SpringUp className='relative z-10 mx-4 w-full max-w-sm'>
        <div className='glass-modal p-6 md:p-8'>
          {/* Logo */}
          <div className='mb-6 text-center md:mb-8'>
            <h1 className='font-display text-accent text-5xl tracking-widest md:text-6xl'>
              alfira
            </h1>
            <p className='text-muted mt-2 font-mono text-xs tracking-widest uppercase'>music bot</p>
          </div>

          {/* Description */}
          <p className='font-body text-muted mb-6 text-center text-sm leading-relaxed md:mb-8'>
            Log in with your Discord account to access the music library and controls.
          </p>

          {/* Login button */}
          <a
            href='/auth/login'
            className='btn-discord flex w-full items-center justify-center gap-3'
          >
            <DiscordLogoIcon size={18} weight='duotone' />
            Login with Discord
          </a>
        </div>

        <p className='text-faint mt-6 text-center font-mono text-[10px] tracking-widest uppercase'>
          access is restricted to server members
        </p>
      </SpringUp>
    </div>
  );
}
