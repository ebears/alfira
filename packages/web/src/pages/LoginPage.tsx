import { DiscordLogoIcon } from '@phosphor-icons/react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // If already authenticated, go straight to songs.
  useEffect(() => {
    if (!loading && user) navigate('/songs', { replace: true });
  }, [user, loading, navigate]);

  if (loading) return null;

  return (
    <div className='min-h-screen bg-elevated flex items-center justify-center relative overflow-hidden'>
      {/* Background texture */}
      <div
        className='absolute inset-0 opacity-[0.03]'
        style={{
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
        }}
      />

      {/* Card */}
      <div className='relative z-10 w-full max-w-sm mx-4 animate-fade-up'>
        <div className='p-6 md:p-8 glass-modal'>
          {/* Logo */}
          <div className='mb-6 md:mb-8 text-center'>
            <h1 className='font-display text-5xl md:text-6xl text-accent tracking-widest'>
              alfira
            </h1>
            <p className='font-mono text-xs text-muted mt-2 tracking-widest uppercase'>music bot</p>
          </div>

          {/* Description */}
          <p className='font-body text-sm text-muted text-center mb-6 md:mb-8 leading-relaxed'>
            Log in with your Discord account to access the music library and controls.
          </p>

          {/* Login button */}
          <a
            href='/auth/login'
            className='btn-discord flex items-center justify-center gap-3 w-full'
          >
            <DiscordLogoIcon size={18} weight='duotone' />
            Login with Discord
          </a>
        </div>

        <p className='text-center font-mono text-[10px] text-faint mt-6 tracking-widest uppercase'>
          access is restricted to server members
        </p>
      </div>
    </div>
  );
}
