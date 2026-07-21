import {
  GlobeIcon,
  MegaphoneIcon,
  MusicNotesIcon,
  QuestionIcon,
  TimerIcon,
} from '@phosphor-icons/react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';

import {
  fetchGeneralSettings,
  fetchSetupChannels,
  fetchSetupRoles,
  type GeneralSettings,
  type SetupChannel,
  type SetupRole,
  updateGeneralSettings,
} from '../../api/api';
import { SourceIcon } from '../SourceIcons';
import { Button } from '../ui/Button';
import Checkbox from '../ui/Checkbox';
import { ErrorBanner } from '../ui/ErrorBanner';
import SettingsToggle from './SettingsToggle';

export default function AdminSection() {
  const [saved, setSaved] = useState<GeneralSettings | null>(null);
  const [adminRoleIds, setAdminRoleIds] = useState('');
  const [timeoutMinutes, setTimeoutMinutes] = useState(5);
  const [afkNotificationChannelId, setAfkNotificationChannelId] = useState<string | null>(null);
  const [requestNotificationChannelId, setRequestNotificationChannelId] = useState<string | null>(
    null
  );
  const [notifyOnApproved, setNotifyOnApproved] = useState(true);
  const [notifyOnDenied, setNotifyOnDenied] = useState(true);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [enabledSources, setEnabledSources] = useState('youtube,soundcloud');
  const [availableSources, setAvailableSources] = useState<
    { key: string; displayName: string; requiresCredentials: boolean; helpText: string | null }[]
  >([]);

  const selectedSourceKeySet = new Set(
    enabledSources
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );

  const [roles, setRoles] = useState<SetupRole[]>([]);
  const [channels, setChannels] = useState<SetupChannel[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const settings = await fetchGeneralSettings();
        if (cancelled) {
          return;
        }
        setSaved(settings);
        setAdminRoleIds(settings.adminRoleIds);
        setTimeoutMinutes(settings.voiceIdleTimeoutMinutes);
        setAfkNotificationChannelId(settings.afkNotificationChannelId);
        setRequestNotificationChannelId(settings.requestNotificationChannelId);
        setNotifyOnApproved(settings.notifyOnApproved);
        setNotifyOnDenied(settings.notifyOnDenied);
        setPublicUrl(settings.publicUrl);
        setEnabledSources(settings.enabledSources);
        setAvailableSources(settings.availableSources);

        // Load roles and channels for the pickers.
        if (settings.guildId) {
          const [rolesRes, channelsRes] = await Promise.all([
            fetchSetupRoles(settings.guildId),
            fetchSetupChannels(settings.guildId),
          ]);
          if (cancelled) {
            return;
          }
          setRoles(rolesRes.roles);
          setChannels(channelsRes.channels);
        }
      } catch {
        if (cancelled) {
          return;
        }
        setError('Could not load settings.');
      } finally {
        if (!cancelled) {
          setLoaded(true);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasChanges = saved
    ? adminRoleIds !== saved.adminRoleIds ||
      timeoutMinutes !== saved.voiceIdleTimeoutMinutes ||
      afkNotificationChannelId !== saved.afkNotificationChannelId ||
      requestNotificationChannelId !== saved.requestNotificationChannelId ||
      notifyOnApproved !== saved.notifyOnApproved ||
      notifyOnDenied !== saved.notifyOnDenied ||
      publicUrl !== saved.publicUrl ||
      enabledSources !== saved.enabledSources
    : false;

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await updateGeneralSettings({
        adminRoleIds,
        voiceIdleTimeoutMinutes: timeoutMinutes,
        afkNotificationChannelId,
        requestNotificationChannelId,
        notifyOnApproved,
        notifyOnDenied,
        publicUrl,
        enabledSources,
      });
      setSaved(updated);
      setSuccessMsg('Settings saved.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }, [
    adminRoleIds,
    afkNotificationChannelId,
    enabledSources,
    notifyOnApproved,
    notifyOnDenied,
    publicUrl,
    requestNotificationChannelId,
    timeoutMinutes,
  ]);

  const handleAfkChannelChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) =>
      setAfkNotificationChannelId(e.target.value || null),
    []
  );

  const handleRequestChannelChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) =>
      setRequestNotificationChannelId(e.target.value || null),
    []
  );

  const handleTimeoutChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setTimeoutMinutes(Number(e.target.value)),
    []
  );

  const handlePublicUrlChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setPublicUrl(e.target.value.trim() || null),
    []
  );

  const rangeStyle = useMemo(
    () =>
      ({
        '--range-pct': `${((timeoutMinutes - 1) / (120 - 1)) * 100}%`,
      }) as React.CSSProperties,
    [timeoutMinutes]
  );

  const toggleRole = useCallback(
    (id: string) => {
      const current = adminRoleIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const set = new Set(current);
      if (set.has(id)) {
        if (set.size === 1) {
          return;
        } // Last one — can't remove.
        set.delete(id);
      } else {
        set.add(id);
      }
      setAdminRoleIds([...set].join(','));
    },
    [adminRoleIds]
  );

  const toggleSource = useCallback(
    (key: string) => {
      const current = new Set(
        enabledSources
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      );
      if (current.size === 1 && current.has(key)) {
        return;
      } // Last one — can't disable.
      if (current.has(key)) {
        current.delete(key);
      } else {
        current.add(key);
      }
      setEnabledSources([...current].join(','));
    },
    [enabledSources]
  );

  const selectedRoleIdSet = new Set(
    adminRoleIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );

  if (!loaded) {
    return null;
  }

  return (
    <div className='space-y-6'>
      {error && <ErrorBanner message={error} />}

      {successMsg && (
        <div className='p-3 rounded-lg bg-accent/10 border border-accent/20 text-accent text-sm'>
          {successMsg}
        </div>
      )}

      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
        {/* Admin Roles */}
        <div className='md:col-span-2 lg:col-span-1 space-y-2'>
          <h3 className='font-mono text-[11px] text-muted uppercase tracking-wider'>Admin Roles</h3>
          <p className='text-xs text-muted'>
            Users with these roles can manage songs, control playback, and access admin settings.
          </p>
          {roles.length === 0 ? (
            <p className='text-xs text-muted italic'>No roles loaded.</p>
          ) : (
            <div className='space-y-1.5 max-h-48 lg:max-h-72 overflow-y-auto'>
              {roles.map((r) => (
                <RoleItem
                  key={r.id}
                  role={r}
                  selected={selectedRoleIdSet.has(r.id)}
                  isLastSelected={selectedRoleIdSet.size === 1 && selectedRoleIdSet.has(r.id)}
                  onToggle={toggleRole}
                />
              ))}
            </div>
          )}
        </div>

        {/* Music Sources */}
        <div className='md:col-span-2 lg:col-span-1 space-y-2 border-t border-muted/10 pt-5 lg:border-t-0 lg:pt-0'>
          <div className='flex items-center gap-2'>
            <MusicNotesIcon size={14} weight='duotone' className='text-muted' />
            <h3 className='font-mono text-[11px] text-muted uppercase tracking-wider'>
              Music Sources
            </h3>
          </div>
          <p className='text-xs text-muted'>
            Choose which music platforms Alfira can play from. At least one must be enabled.
          </p>
          {availableSources.length === 0 ? (
            <p className='text-xs text-muted italic'>No sources available.</p>
          ) : (
            <div className='space-y-1.5'>
              {availableSources.map((source) => (
                <SourceItem
                  key={source.key}
                  source={source}
                  selected={selectedSourceKeySet.has(source.key)}
                  isLastSelected={
                    selectedSourceKeySet.size === 1 && selectedSourceKeySet.has(source.key)
                  }
                  onToggle={toggleSource}
                />
              ))}
            </div>
          )}
        </div>

        {/* AFK Notification Channel */}
        <div className='space-y-2 border-t border-muted/10 pt-5'>
          <div className='flex items-center gap-2'>
            <MegaphoneIcon size={14} weight='duotone' className='text-muted' />
            <h3 className='font-mono text-[11px] text-muted uppercase tracking-wider'>
              AFK Notification Channel
            </h3>
          </div>
          <p className='text-xs text-muted'>
            Alfira posts a message here when it leaves a voice channel due to inactivity.
          </p>
          {channels.length > 0 ? (
            <select
              value={afkNotificationChannelId ?? ''}
              onChange={handleAfkChannelChange}
              className='w-full px-3 py-2 rounded-lg bg-base border border-border text-fg text-sm focus:outline-none focus:border-accent transition-colors cursor-pointer'
            >
              <option value=''>— Disabled —</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  # {c.name}
                </option>
              ))}
            </select>
          ) : (
            <p className='text-xs text-muted italic'>No channels loaded.</p>
          )}
        </div>

        {/* Request Notification Channel */}
        <div className='space-y-2 border-t border-muted/10 pt-5'>
          <div className='flex items-center gap-2'>
            <MegaphoneIcon size={14} weight='duotone' className='text-muted' />
            <h3 className='font-mono text-[11px] text-muted uppercase tracking-wider'>
              Song Request Notifications
            </h3>
          </div>
          <p className='text-xs text-muted'>
            Alfira posts here when new song requests are submitted.
          </p>
          {channels.length > 0 ? (
            <select
              value={requestNotificationChannelId ?? ''}
              onChange={handleRequestChannelChange}
              className='w-full px-3 py-2 rounded-lg bg-base border border-border text-fg text-sm focus:outline-none focus:border-accent transition-colors cursor-pointer'
            >
              <option value=''>— Disabled —</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  # {c.name}
                </option>
              ))}
            </select>
          ) : (
            <p className='text-xs text-muted italic'>No channels loaded.</p>
          )}

          <div className='mt-3 space-y-3'>
            <SettingsToggle
              label='Notify on approved'
              description='Post a message when a request is approved. Requesters can also opt into a personal DM.'
              checked={notifyOnApproved}
              onChange={setNotifyOnApproved}
            />
            <SettingsToggle
              label='Notify on denied'
              description='Post a message when a request is denied.'
              checked={notifyOnDenied}
              onChange={setNotifyOnDenied}
            />
          </div>
        </div>

        {/* Idle Timeout */}
        <div className='space-y-2 border-t border-muted/10 pt-5'>
          <div className='flex items-center gap-2'>
            <TimerIcon size={14} weight='duotone' className='text-muted' />
            <h3 className='font-mono text-[11px] text-muted uppercase tracking-wider'>
              Idle Timeout
            </h3>
          </div>
          <p className='text-xs text-muted'>
            Alfira leaves the voice channel after this many minutes of inactivity (no music
            playing).
          </p>
          <div className='flex items-center gap-4 mt-4'>
            <input
              type='range'
              min={1}
              max={120}
              value={timeoutMinutes}
              onChange={handleTimeoutChange}
              className='flex-1 range-input range-input-h'
              style={rangeStyle}
            />
            <span className='font-mono text-sm text-fg w-20 text-right whitespace-nowrap'>
              {timeoutMinutes} min
            </span>
          </div>
        </div>

        {/* Public URL */}
        <div className='space-y-2 border-t border-muted/10 pt-5'>
          <div className='flex items-center gap-2'>
            <GlobeIcon size={14} weight='duotone' className='text-muted' />
            <h3 className='font-mono text-[11px] text-muted uppercase tracking-wider'>
              Public URL
            </h3>
          </div>
          <p className='text-xs text-muted'>
            The external URL where this Alfira instance is reachable. Used for OAuth redirects and
            other features.
          </p>
          <input
            type='text'
            value={publicUrl ?? ''}
            onChange={handlePublicUrlChange}
            placeholder='https://music.yourserver.com'
            className='input'
          />
        </div>

        {/* Save */}
        <div className='md:col-span-2 flex gap-3 pt-5 border-t border-muted/10 justify-end'>
          <Button variant='primary' onClick={handleSave} disabled={!hasChanges || saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Memoized sub-components — extracted from inline map callbacks
// ---------------------------------------------------------------------------

const RoleItem = memo(function RoleItem({
  role,
  selected,
  isLastSelected,
  onToggle,
}: {
  role: SetupRole;
  selected: boolean;
  isLastSelected: boolean;
  onToggle: (id: string) => void;
}) {
  const dotStyle = useMemo(
    () => ({
      backgroundColor: role.color
        ? `#${role.color.toString(16).padStart(6, '0')}`
        : 'var(--color-muted)',
    }),
    [role.color]
  );
  const handleToggle = useCallback(() => onToggle(role.id), [onToggle, role.id]);

  return (
    <label
      className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
        selected ? 'border-accent bg-accent/5' : 'border-border hover:border-muted'
      }`}
    >
      <Checkbox checked={selected} onChange={handleToggle} />
      <span className='w-2.5 h-2.5 rounded-full shrink-0' style={dotStyle} />
      <span className='text-sm text-fg'>{role.name}</span>
      {isLastSelected && (
        <span className='text-xs text-muted ml-auto'>(must keep at least one)</span>
      )}
    </label>
  );
});

const SourceItem = memo(function SourceItem({
  source,
  selected,
  isLastSelected,
  onToggle,
}: {
  source: {
    key: string;
    displayName: string;
    requiresCredentials: boolean;
    helpText: string | null;
  };
  selected: boolean;
  isLastSelected: boolean;
  onToggle: (key: string) => void;
}) {
  const handleToggle = useCallback(() => onToggle(source.key), [onToggle, source.key]);

  return (
    <>
      <label
        className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
          selected ? 'border-accent bg-accent/5' : 'border-border hover:border-muted'
        }`}
      >
        <Checkbox checked={selected} onChange={handleToggle} />
        <SourceIcon sourceKey={source.key} className='shrink-0' />
        <span className='text-sm text-fg'>{source.displayName}</span>
        {source.helpText && (
          <span className='relative group'>
            <QuestionIcon size={14} weight='duotone' className='text-muted cursor-help' />
            <span className='glass-tooltip absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2'>
              {source.helpText}
            </span>
          </span>
        )}
        {isLastSelected && (
          <span className='text-xs text-muted ml-auto'>(must keep at least one)</span>
        )}
      </label>
      {source.requiresCredentials && selected && (
        <p className='text-xs text-warning ml-9'>
          This source requires credentials to be configured via environment variables before it can
          play music.
        </p>
      )}
    </>
  );
});
