import {
  CaretLeftIcon,
  CheckIcon,
  GlobeIcon,
  MegaphoneIcon,
  MusicNotesIcon,
  QuestionIcon,
  ShieldCheckIcon,
  TimerIcon,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import {
  completeSetup,
  fetchSetupChannels,
  fetchSetupGuilds,
  fetchSetupRoles,
  fetchSetupStatus,
  logout,
  type SetupChannel,
  type SetupGuild,
  type SetupRole,
} from '../api/api';
import { SourceIcon } from '../components/SourceIcons';
import { Button } from '../components/ui/Button';
import Checkbox from '../components/ui/Checkbox';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from '../context/AuthContext';

type Step =
  | 'welcome'
  | 'guild'
  | 'sources'
  | 'roles'
  | 'channel'
  | 'timeout'
  | 'publicUrl'
  | 'confirm';

const STEP_ORDER: Step[] = [
  'welcome',
  'guild',
  'sources',
  'roles',
  'channel',
  'timeout',
  'publicUrl',
  'confirm',
];

function getRoleBgColor(color: number | null): string {
  return color ? `#${color.toString(16).padStart(6, '0')}` : 'var(--color-muted)';
}

function RoleColorDot({ color }: { color: number | null }) {
  const style = useMemo<React.CSSProperties>(
    () => ({ backgroundColor: getRoleBgColor(color) }),
    [color]
  );
  return <span className='h-3 w-3 shrink-0 rounded-full' style={style} />;
}

function SourceCheckbox({
  sourceKey,
  checked,
  onToggle,
}: {
  sourceKey: string;
  checked: boolean;
  onToggle: (key: string) => void;
}) {
  const handleChange = useCallback(() => {
    onToggle(sourceKey);
  }, [sourceKey, onToggle]);
  return <Checkbox checked={checked} onChange={handleChange} />;
}

function RoleCheckbox({
  roleId,
  checked,
  onToggle,
}: {
  roleId: string;
  checked: boolean;
  onToggle: (id: string) => void;
}) {
  const handleChange = useCallback(() => {
    onToggle(roleId);
  }, [roleId, onToggle]);
  return <Checkbox checked={checked} onChange={handleChange} />;
}

const AVAILABLE_SOURCES = [
  { key: 'youtube', displayName: 'YouTube', requiresCredentials: false, helpText: undefined },
  { key: 'soundcloud', displayName: 'SoundCloud', requiresCredentials: false, helpText: undefined },
  { key: 'spotify', displayName: 'Spotify', requiresCredentials: true, helpText: undefined },
  { key: 'applemusic', displayName: 'Apple Music', requiresCredentials: true, helpText: undefined },
  { key: 'tidal', displayName: 'Tidal', requiresCredentials: true, helpText: undefined },
  {
    key: 'googledrive',
    displayName: 'Google Drive',
    requiresCredentials: false,
    helpText: 'Paste a Google Drive share link to play audio files hosted on Google Drive.',
  },
];

export default function SetupWizard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('welcome');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [guilds, setGuilds] = useState<SetupGuild[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState<string>('');
  const [selectedSourceKeys, setSelectedSourceKeys] = useState<Set<string>>(
    new Set(['youtube', 'soundcloud'])
  );
  const [roles, setRoles] = useState<SetupRole[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set());
  const [channels, setChannels] = useState<SetupChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [timeoutMinutes, setTimeoutMinutes] = useState(5);
  const [publicUrl, setPublicUrl] = useState('');
  const [clientId, setClientId] = useState('');
  const [refreshingGuilds, setRefreshingGuilds] = useState(false);

  // Check setup status on mount
  useEffect(() => {
    async function check() {
      try {
        const status = await fetchSetupStatus();
        if (status.setupCompleted) {
          void navigate('/', { replace: true });
          return;
        }
        setClientId(status.clientId);
      } catch {
        // If we can't check status, proceed to wizard.
      }
      setLoading(false);
    }
    void check();
  }, [navigate]);

  // Auto-refresh guild list when on the guild step and no guilds are found.
  useEffect(() => {
    if (step !== 'guild' || guilds.length > 0) {
      return;
    }

    let cancelled = false;
    async function poll() {
      setRefreshingGuilds(true);
      try {
        const { guilds: list } = await fetchSetupGuilds();
        if (!cancelled) {
          setGuilds(list);
          if (list.length === 1) {
            setSelectedGuildId(list[0]?.id ?? '');
          }
        }
      } catch {
        // Silently retry on next interval.
      } finally {
        if (!cancelled) {
          setRefreshingGuilds(false);
        }
      }
    }

    void poll();
    const interval = setInterval(() => {
      void poll();
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [step, guilds.length]);

  const loadGuilds = useCallback(async () => {
    setError(null);
    try {
      const { guilds: list } = await fetchSetupGuilds();
      setGuilds(list);
      if (list.length === 1) {
        setSelectedGuildId(list[0]?.id ?? '');
      }
      setStep('guild');
    } catch {
      setError('Could not fetch server list. Is the bot connected to Discord?');
    }
  }, []);

  const loadRoles = useCallback(async () => {
    if (!selectedGuildId) {
      return;
    }
    setError(null);
    try {
      const { roles: list } = await fetchSetupRoles(selectedGuildId);
      setRoles(list);
      setStep('roles');
    } catch {
      setError('Could not fetch roles.');
    }
  }, [selectedGuildId]);

  const loadChannels = useCallback(async () => {
    if (!selectedGuildId) {
      return;
    }
    setError(null);
    try {
      const { channels: list } = await fetchSetupChannels(selectedGuildId);
      setChannels(list);
      setStep('channel');
    } catch {
      setError('Could not fetch channels.');
    }
  }, [selectedGuildId]);

  const handleSubmit = useCallback(async () => {
    if (!selectedGuildId || selectedRoleIds.size === 0) {
      return;
    }
    if (selectedSourceKeys.size === 0) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await completeSetup({
        guildId: selectedGuildId,
        adminRoleIds: [...selectedRoleIds].join(','),
        voiceIdleTimeoutMinutes: timeoutMinutes,
        afkNotificationChannelId: selectedChannelId || null,
        publicUrl: publicUrl.trim() || null,
        enabledSources: [...selectedSourceKeys].join(','),
      });
      // Clear the old session (still has isSetupAdmin in the JWT),
      // then redirect to /login for a fresh OAuth flow.
      await logout();
      window.location.href = '/login';
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Failed to save configuration.');
      setSaving(false);
      setStep('confirm');
    }
  }, [
    selectedGuildId,
    selectedRoleIds,
    selectedSourceKeys,
    timeoutMinutes,
    selectedChannelId,
    publicUrl,
  ]);

  const toggleRole = useCallback((id: string) => {
    setSelectedRoleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSource = useCallback((key: string) => {
    setSelectedSourceKeys((prev) => {
      const next = new Set(prev);
      // Prevent deselecting the last source.
      if (next.size === 1 && next.has(key)) {
        return prev;
      }
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleGoToStep = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const target = e.currentTarget.dataset.step as Step | undefined;
    if (target) {
      setStep(target);
    }
  }, []);

  const handleGuildSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedGuildId(e.currentTarget.dataset.guild ?? '');
  }, []);

  const handleChannelSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedChannelId(e.currentTarget.dataset.channel ?? '');
  }, []);

  const handleSkipChannel = useCallback(() => {
    setSelectedChannelId('');
    setStep('timeout');
  }, []);

  const handleTimeoutChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTimeoutMinutes(Number(e.target.value));
  }, []);

  const handlePublicUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPublicUrl(e.target.value);
  }, []);

  const timeoutRangeStyle = useMemo(
    () =>
      ({
        '--range-pct': `${((timeoutMinutes - 1) / (120 - 1)) * 100}%`,
      }) as React.CSSProperties,
    [timeoutMinutes]
  );

  const stepIndex = STEP_ORDER.indexOf(step);

  // Only the first user (setup admin) can access the wizard.
  if (!user?.isSetupAdmin && !loading) {
    return <Navigate to='/' replace />;
  }

  if (loading) {
    return (
      <div className='bg-elevated flex h-full items-center justify-center'>
        <Spinner size='lg' />
      </div>
    );
  }

  return (
    <div className='bg-surface flex min-h-full items-center justify-center p-4'>
      <div className='w-full max-w-lg'>
        {/* Progress dots */}
        <div className='mb-8 flex justify-center gap-2'>
          {STEP_ORDER.slice(1).map((s, i) => (
            <div
              key={s}
              className={`h-2 w-2 rounded-full transition-colors ${
                i < stepIndex - 1
                  ? 'bg-accent'
                  : i === stepIndex - 1
                    ? 'bg-accent/60'
                    : 'bg-muted/30'
              }`}
            />
          ))}
        </div>

        {error && <ErrorBanner message={error} className='mb-6' />}

        {/* Step content */}
        <div className='glass-modal p-6 md:p-8'>
          {step === 'welcome' && (
            <div className='space-y-6 text-center'>
              <div className='flex justify-center'>
                <div className='bg-accent/10 border-accent/30 flex h-16 w-16 items-center justify-center rounded-full border'>
                  <ShieldCheckIcon size={32} weight='duotone' className='text-accent' />
                </div>
              </div>
              <div>
                <h1 className='font-display text-fg mb-2 text-2xl tracking-wider'>
                  Welcome to Alfira
                </h1>
                <p className='text-muted text-sm leading-relaxed'>
                  Let&apos;s get your music bot configured. You&apos;ll pick your server, choose
                  admin roles, and set a few preferences.
                </p>
              </div>
              <Button variant='primary' onClick={loadGuilds}>
                Get Started
              </Button>
            </div>
          )}

          {step === 'guild' && (
            <div className='space-y-5'>
              <h2 className='font-display text-fg text-xl'>Choose a Server</h2>
              <p className='text-muted text-sm'>
                Select the Discord server Alfira will operate in.
              </p>
              {guilds.length === 0 ? (
                <div className='bg-warning/10 text-warning space-y-3 rounded-lg p-4 text-sm'>
                  <p>No servers found. Invite the bot to a Discord server first.</p>
                  {clientId && (
                    <a
                      href={`https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=3148800&scope=bot+applications.commands`}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='bg-accent text-elevated font-body inline-block rounded-lg px-4 py-2 text-sm transition-opacity hover:opacity-90'
                    >
                      Invite Alfira to a Server
                    </a>
                  )}
                  <p className='text-warning/70 text-xs'>Checking for servers every few seconds…</p>
                  {refreshingGuilds && <Spinner size='md' />}
                </div>
              ) : (
                <div className='space-y-2'>
                  {guilds.map((g) => (
                    <label
                      key={g.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                        selectedGuildId === g.id
                          ? 'border-accent bg-accent/5'
                          : 'border-border hover:border-muted'
                      }`}
                    >
                      <input
                        type='radio'
                        name='guild'
                        value={g.id}
                        checked={selectedGuildId === g.id}
                        onChange={handleGuildSelect}
                        data-guild={g.id}
                        className='accent-accent'
                      />
                      <span className='text-fg text-sm'>{g.name}</span>
                    </label>
                  ))}
                </div>
              )}
              <div className='flex justify-between pt-2'>
                <button
                  type='button'
                  onClick={handleGoToStep}
                  data-step='welcome'
                  className='text-muted hover:text-fg flex cursor-pointer items-center gap-1 text-sm transition-colors'
                >
                  <CaretLeftIcon size={14} />
                  Back
                </button>
                <Button
                  variant='primary'
                  onClick={handleGoToStep}
                  data-step='sources'
                  disabled={!selectedGuildId}
                >
                  Next
                </Button>
              </div>
            </div>
          )}

          {step === 'sources' && (
            <div className='space-y-5'>
              <div className='flex items-center gap-3'>
                <MusicNotesIcon size={24} weight='duotone' className='text-accent' />
                <h2 className='font-display text-fg text-xl'>Music Sources</h2>
              </div>
              <p className='text-muted text-sm'>
                Choose which music platforms Alfira can play from. At least one source must be
                enabled.
              </p>
              <div className='space-y-2'>
                {AVAILABLE_SOURCES.map((source) => (
                  <>
                    <label
                      key={source.key}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                        selectedSourceKeys.has(source.key)
                          ? 'border-accent bg-accent/5'
                          : 'border-border hover:border-muted'
                      }`}
                    >
                      <SourceCheckbox
                        sourceKey={source.key}
                        checked={selectedSourceKeys.has(source.key)}
                        onToggle={toggleSource}
                      />
                      <SourceIcon sourceKey={source.key} className='shrink-0' />
                      <span className='text-fg text-sm'>{source.displayName}</span>
                      {source.helpText && (
                        <span className='group relative'>
                          <QuestionIcon
                            size={14}
                            weight='duotone'
                            className='text-muted cursor-help'
                          />
                          <span className='glass-tooltip absolute bottom-full left-1/2 mb-2 w-56 -translate-x-1/2 p-2'>
                            {source.helpText}
                          </span>
                        </span>
                      )}
                      {selectedSourceKeys.size === 1 && selectedSourceKeys.has(source.key) && (
                        <span className='text-muted ml-auto text-xs'>(must keep at least one)</span>
                      )}
                    </label>
                    {source.requiresCredentials && selectedSourceKeys.has(source.key) && (
                      <p className='text-warning ml-9 text-xs'>
                        This source requires credentials to be configured via environment variables
                        before it can play music.
                      </p>
                    )}
                  </>
                ))}
              </div>
              {selectedSourceKeys.size === 0 && (
                <p className='text-danger text-xs'>Please enable at least one music source.</p>
              )}
              <div className='flex justify-between pt-2'>
                <button
                  type='button'
                  onClick={handleGoToStep}
                  data-step='guild'
                  className='text-muted hover:text-fg flex cursor-pointer items-center gap-1 text-sm transition-colors'
                >
                  <CaretLeftIcon size={14} />
                  Back
                </button>
                <Button
                  variant='primary'
                  onClick={loadRoles}
                  disabled={selectedSourceKeys.size === 0}
                >
                  Next
                </Button>
              </div>
            </div>
          )}

          {step === 'roles' && (
            <div className='space-y-5'>
              <h2 className='font-display text-fg text-xl'>Admin Roles</h2>
              <p className='text-muted text-sm'>
                Select which roles can manage Alfira (add songs, control playback, etc.).
              </p>
              {roles.length === 0 ? (
                <div className='bg-warning/10 text-warning rounded-lg p-4 text-sm'>
                  No roles found in this server. Create roles in Discord first.
                </div>
              ) : (
                <div className='max-h-64 space-y-2 overflow-y-auto'>
                  {roles.map((r) => (
                    <label
                      key={r.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                        selectedRoleIds.has(r.id)
                          ? 'border-accent bg-accent/5'
                          : 'border-border hover:border-muted'
                      }`}
                    >
                      <RoleCheckbox
                        roleId={r.id}
                        checked={selectedRoleIds.has(r.id)}
                        onToggle={toggleRole}
                      />
                      <RoleColorDot color={r.color} />
                      <span className='text-fg text-sm'>{r.name}</span>
                    </label>
                  ))}
                </div>
              )}
              <div className='flex justify-between pt-2'>
                <button
                  type='button'
                  onClick={handleGoToStep}
                  data-step='sources'
                  className='text-muted hover:text-fg flex cursor-pointer items-center gap-1 text-sm transition-colors'
                >
                  <CaretLeftIcon size={14} />
                  Back
                </button>
                <Button
                  variant='primary'
                  onClick={loadChannels}
                  disabled={selectedRoleIds.size === 0}
                >
                  Next
                </Button>
              </div>
            </div>
          )}

          {step === 'channel' && (
            <div className='space-y-5'>
              <div className='flex items-center gap-3'>
                <MegaphoneIcon size={24} weight='duotone' className='text-accent' />
                <h2 className='font-display text-fg text-xl'>Notification Channel</h2>
              </div>
              <p className='text-muted text-sm'>
                Alfira can post a message when it leaves a voice channel due to inactivity. Choose a
                text channel, or skip this step.
              </p>
              {channels.length === 0 ? (
                <p className='text-muted text-sm'>No text channels found.</p>
              ) : (
                <div className='max-h-64 space-y-2 overflow-y-auto'>
                  {channels.map((c) => (
                    <label
                      key={c.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                        selectedChannelId === c.id
                          ? 'border-accent bg-accent/5'
                          : 'border-border hover:border-muted'
                      }`}
                    >
                      <input
                        type='radio'
                        name='channel'
                        value={c.id}
                        checked={selectedChannelId === c.id}
                        onChange={handleChannelSelect}
                        data-channel={c.id}
                        className='accent-accent'
                      />
                      <span className='text-fg text-sm'># {c.name}</span>
                    </label>
                  ))}
                </div>
              )}
              <div className='flex justify-between pt-2'>
                <button
                  type='button'
                  onClick={handleGoToStep}
                  data-step='roles'
                  className='text-muted hover:text-fg flex cursor-pointer items-center gap-1 text-sm transition-colors'
                >
                  <CaretLeftIcon size={14} />
                  Back
                </button>
                <div className='flex gap-2'>
                  <Button variant='inherit' onClick={handleSkipChannel} surface='surface'>
                    Skip
                  </Button>
                  <Button variant='primary' onClick={handleGoToStep} data-step='timeout'>
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}

          {step === 'timeout' && (
            <div className='space-y-5'>
              <div className='flex items-center gap-3'>
                <TimerIcon size={24} weight='duotone' className='text-accent' />
                <h2 className='font-display text-fg text-xl'>Idle Timeout</h2>
              </div>
              <p className='text-muted text-sm'>
                How many minutes before Alfira automatically leaves when nobody is listening?
              </p>
              <div className='flex items-center gap-4'>
                <input
                  type='range'
                  min={1}
                  max={120}
                  value={timeoutMinutes}
                  onChange={handleTimeoutChange}
                  className='range-input range-input-h flex-1'
                  style={timeoutRangeStyle}
                />
                <span className='text-fg w-20 text-right font-mono text-lg whitespace-nowrap'>
                  {timeoutMinutes} min
                </span>
              </div>
              <div className='flex justify-between pt-2'>
                <button
                  type='button'
                  onClick={handleGoToStep}
                  data-step='channel'
                  className='text-muted hover:text-fg flex cursor-pointer items-center gap-1 text-sm transition-colors'
                >
                  <CaretLeftIcon size={14} />
                  Back
                </button>
                <Button variant='primary' onClick={handleGoToStep} data-step='publicUrl'>
                  Next
                </Button>
              </div>
            </div>
          )}

          {step === 'publicUrl' && (
            <div className='space-y-5'>
              <div className='flex items-center gap-3'>
                <GlobeIcon size={24} weight='duotone' className='text-accent' />
                <h2 className='font-display text-fg text-xl'>Public URL</h2>
              </div>
              <p className='text-muted text-sm'>
                Optional — the URL your users will use to access Alfira (e.g.,
                https://music.yourserver.com). This can be changed later in settings.
              </p>
              <input
                type='text'
                value={publicUrl}
                onChange={handlePublicUrlChange}
                placeholder='https://music.yourserver.com'
                className='input font-mono'
              />
              <div className='flex justify-between pt-2'>
                <button
                  type='button'
                  onClick={handleGoToStep}
                  data-step='timeout'
                  className='text-muted hover:text-fg flex cursor-pointer items-center gap-1 text-sm transition-colors'
                >
                  <CaretLeftIcon size={14} />
                  Back
                </button>
                <Button variant='primary' onClick={handleGoToStep} data-step='confirm'>
                  Review
                </Button>
              </div>
            </div>
          )}

          {step === 'confirm' && (
            <div className='space-y-5'>
              <h2 className='font-display text-fg text-center text-xl'>Ready to Go</h2>
              <p className='text-muted text-center text-sm'>
                Review your settings below, then finish setup.
              </p>

              <div className='bg-base space-y-3 rounded-lg p-4'>
                <div className='flex justify-between text-sm'>
                  <span className='text-muted'>Server</span>
                  <span className='text-fg'>
                    {guilds.find((g) => g.id === selectedGuildId)?.name ?? selectedGuildId}
                  </span>
                </div>
                <div className='flex justify-between text-sm'>
                  <span className='text-muted'>Music Sources</span>
                  <span className='text-fg'>
                    {[...selectedSourceKeys]
                      .map((k) => AVAILABLE_SOURCES.find((s) => s.key === k)?.displayName ?? k)
                      .join(', ')}
                  </span>
                </div>
                <div className='flex justify-between text-sm'>
                  <span className='text-muted'>Admin Roles</span>
                  <span className='text-fg'>
                    {[...selectedRoleIds]
                      .map((id) => roles.find((r) => r.id === id)?.name ?? id)
                      .join(', ')}
                  </span>
                </div>
                <div className='flex justify-between text-sm'>
                  <span className='text-muted'>Notifications</span>
                  <span className='text-fg'>
                    {selectedChannelId
                      ? `# ${channels.find((c) => c.id === selectedChannelId)?.name ?? selectedChannelId}`
                      : 'Disabled'}
                  </span>
                </div>
                <div className='flex justify-between text-sm'>
                  <span className='text-muted'>Idle Timeout</span>
                  <span className='text-fg'>{timeoutMinutes} minutes</span>
                </div>
                {publicUrl.trim() && (
                  <div className='flex justify-between text-sm'>
                    <span className='text-muted'>Public URL</span>
                    <span className='text-fg font-mono'>{publicUrl.trim()}</span>
                  </div>
                )}
              </div>

              <div className='flex justify-between pt-2'>
                <button
                  type='button'
                  onClick={handleGoToStep}
                  data-step='publicUrl'
                  className='text-muted hover:text-fg flex cursor-pointer items-center gap-1 text-sm transition-colors'
                >
                  <CaretLeftIcon size={14} />
                  Back
                </button>
                <Button variant='primary' onClick={handleSubmit} disabled={saving}>
                  <CheckIcon size={16} weight='bold' />
                  {saving ? 'Saving…' : 'Finish Setup'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
