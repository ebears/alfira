import {
  GlobeIcon,
  MegaphoneIcon,
  MusicNotesIcon,
  QuestionIcon,
  TimerIcon,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
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
import { ErrorBanner } from '../ui/ErrorBanner';
import SettingsToggle from './SettingsToggle';

export default function AdminTab() {
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

  useEffect(() => {
    async function load() {
      try {
        const settings = await fetchGeneralSettings();
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
          setRoles(rolesRes.roles);
          setChannels(channelsRes.channels);
        }
      } catch {
        setError('Could not load settings.');
      }
    }
    load();
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

  async function handleSave() {
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
  }

  function toggleRole(id: string) {
    const current = adminRoleIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const set = new Set(current);
    if (set.has(id)) {
      if (set.size === 1) return; // Last one — can't remove.
      set.delete(id);
    } else {
      set.add(id);
    }
    setAdminRoleIds([...set].join(','));
  }

  function toggleSource(key: string) {
    const current = new Set(
      enabledSources
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );
    if (current.size === 1 && current.has(key)) return; // Last one — can't disable.
    if (current.has(key)) current.delete(key);
    else current.add(key);
    setEnabledSources([...current].join(','));
  }

  const selectedRoleIdSet = new Set(
    adminRoleIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );

  return (
    <div className="space-y-6">
      {error && <ErrorBanner message={error} />}

      {successMsg && (
        <div className="p-3 rounded-lg bg-accent/10 border border-accent/20 text-accent text-sm">
          {successMsg}
        </div>
      )}

      {/* Admin Roles */}
      <div className="space-y-2">
        <h3 className="font-mono text-[11px] text-muted uppercase tracking-wider">Admin Roles</h3>
        <p className="text-xs text-muted">
          Users with these roles can manage songs, control playback, and access admin settings.
        </p>
        {roles.length === 0 ? (
          <p className="text-xs text-muted italic">No roles loaded.</p>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {roles.map((r) => (
              <label
                key={r.id}
                className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                  selectedRoleIdSet.has(r.id)
                    ? 'border-accent bg-accent/5'
                    : 'border-border hover:border-muted'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedRoleIdSet.has(r.id)}
                  onChange={() => toggleRole(r.id)}
                  className="accent-accent"
                />
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: r.color
                      ? `#${r.color.toString(16).padStart(6, '0')}`
                      : 'var(--color-muted)',
                  }}
                />
                <span className="text-sm text-fg">{r.name}</span>
                {selectedRoleIdSet.size === 1 && selectedRoleIdSet.has(r.id) && (
                  <span className="text-xs text-muted ml-auto">(must keep at least one)</span>
                )}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-muted/20" />

      {/* Music Sources */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <MusicNotesIcon size={14} weight="duotone" className="text-muted" />
          <h3 className="font-mono text-[11px] text-muted uppercase tracking-wider">
            Music Sources
          </h3>
        </div>
        <p className="text-xs text-muted">
          Choose which music platforms Alfira can play from. At least one must be enabled.
        </p>
        {availableSources.length === 0 ? (
          <p className="text-xs text-muted italic">No sources available.</p>
        ) : (
          <div className="space-y-1.5">
            {availableSources.map((source) => (
              <>
                <label
                  key={source.key}
                  className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    selectedSourceKeySet.has(source.key)
                      ? 'border-accent bg-accent/5'
                      : 'border-border hover:border-muted'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedSourceKeySet.has(source.key)}
                    onChange={() => toggleSource(source.key)}
                    className="accent-accent"
                  />
                  <SourceIcon sourceKey={source.key} className="shrink-0" />
                  <span className="text-sm text-fg">{source.displayName}</span>
                  {source.helpText && (
                    <span className="relative group">
                      <QuestionIcon size={14} weight="duotone" className="text-muted cursor-help" />
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2 rounded-lg bg-elevated border border-border text-xs text-muted opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-10">
                        {source.helpText}
                      </span>
                    </span>
                  )}
                  {selectedSourceKeySet.size === 1 && selectedSourceKeySet.has(source.key) && (
                    <span className="text-xs text-muted ml-auto">(must keep at least one)</span>
                  )}
                </label>
                {source.requiresCredentials && selectedSourceKeySet.has(source.key) && (
                  <p className="text-xs text-warning ml-9">
                    This source requires credentials to be configured via environment variables
                    before it can play music.
                  </p>
                )}
              </>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-muted/20" />

      {/* AFK Notification Channel */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <MegaphoneIcon size={14} weight="duotone" className="text-muted" />
          <h3 className="font-mono text-[11px] text-muted uppercase tracking-wider">
            AFK Notification Channel
          </h3>
        </div>
        <p className="text-xs text-muted">
          Alfira posts a message here when it leaves a voice channel due to inactivity.
        </p>
        {channels.length > 0 ? (
          <select
            value={afkNotificationChannelId ?? ''}
            onChange={(e) => setAfkNotificationChannelId(e.target.value || null)}
            className="w-full px-3 py-2 rounded-lg bg-base border border-border text-fg text-sm focus:outline-none focus:border-accent transition-colors"
          >
            <option value="">— Disabled —</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                # {c.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-xs text-muted italic">No channels loaded.</p>
        )}
      </div>

      <div className="border-t border-muted/20" />

      {/* Request Notification Channel */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <MegaphoneIcon size={14} weight="duotone" className="text-muted" />
          <h3 className="font-mono text-[11px] text-muted uppercase tracking-wider">
            Song Request Notifications
          </h3>
        </div>
        <p className="text-xs text-muted">
          Alfira posts here when new song requests are submitted.
        </p>
        {channels.length > 0 ? (
          <select
            value={requestNotificationChannelId ?? ''}
            onChange={(e) => setRequestNotificationChannelId(e.target.value || null)}
            className="w-full px-3 py-2 rounded-lg bg-base border border-border text-fg text-sm focus:outline-none focus:border-accent transition-colors"
          >
            <option value="">— Disabled —</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                # {c.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-xs text-muted italic">No channels loaded.</p>
        )}

        <div className="mt-3 space-y-3">
          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-body text-sm font-medium text-fg flex items-center gap-1.5">
                Notify on approved
                <span className="relative group">
                  <QuestionIcon size={14} weight="duotone" className="text-muted cursor-help" />
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2 rounded-lg bg-elevated border border-border text-xs text-muted opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-10">
                    Requesters can also opt into a personal DM when they submit a request.
                  </span>
                </span>
              </p>
              <p className="font-mono text-[11px] text-muted mt-0.5">
                Post a message when a request is approved.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notifyOnApproved}
              onClick={() => setNotifyOnApproved(!notifyOnApproved)}
              className={`relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:ring-offset-2 focus:ring-offset-surface cursor-pointer ${
                notifyOnApproved ? 'bg-accent' : 'bg-elevated'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform duration-200 ${
                  notifyOnApproved ? 'translate-x-5 bg-elevated' : 'translate-x-0 bg-muted'
                }`}
              />
            </button>
          </div>
          <SettingsToggle
            label="Notify on denied"
            description="Post a message when a request is denied."
            checked={notifyOnDenied}
            onChange={setNotifyOnDenied}
          />
        </div>
      </div>

      <div className="border-t border-muted/20" />

      {/* Idle Timeout */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <TimerIcon size={14} weight="duotone" className="text-muted" />
          <h3 className="font-mono text-[11px] text-muted uppercase tracking-wider">
            Idle Timeout
          </h3>
        </div>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={1}
            max={120}
            value={timeoutMinutes}
            onChange={(e) => setTimeoutMinutes(Number(e.target.value))}
            className="flex-1 accent-accent"
          />
          <span className="font-mono text-sm text-fg w-20 text-right whitespace-nowrap">
            {timeoutMinutes} min
          </span>
        </div>
      </div>

      <div className="border-t border-muted/20" />

      {/* Public URL */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <GlobeIcon size={14} weight="duotone" className="text-muted" />
          <h3 className="font-mono text-[11px] text-muted uppercase tracking-wider">Public URL</h3>
        </div>
        <input
          type="text"
          value={publicUrl ?? ''}
          onChange={(e) => setPublicUrl(e.target.value.trim() || null)}
          placeholder="https://music.yourserver.com"
          className="w-full px-3 py-2 rounded-lg bg-base border border-border text-fg text-sm font-mono placeholder:text-muted/50 focus:outline-none focus:border-accent transition-colors"
        />
      </div>

      {/* Save */}
      <div className="flex gap-3 pt-1 justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className={`font-body text-sm px-4 py-1.5 rounded transition-colors ${
            hasChanges && !saving
              ? 'bg-accent text-elevated cursor-pointer'
              : 'bg-elevated text-muted cursor-not-allowed'
          }`}
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
