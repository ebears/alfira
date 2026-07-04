import { TrashIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchPermissions, type PermissionsResponse, updatePermission } from '../api/api';
import ConfirmModal from '../components/ConfirmModal';
import { Button } from '../components/ui/Button';
import Checkbox from '../components/ui/Checkbox';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import RoleComboBox from '../components/ui/RoleComboBox';

// ---------------------------------------------------------------------------
// Static config — mirrors shared/types.ts PERMISSION_CATEGORIES
// ---------------------------------------------------------------------------
const CATEGORY_META = {
  Library: {
    icon: '▣',
    actions: ['songs.edit', 'songs.delete', 'songs.import', 'requests.autoapprove'] as const,
  },
  Playback: {
    icon: '▶',
    actions: ['queue.quickadd', 'queue.manage', 'queue.override'] as const,
  },
  Management: {
    icon: '⚙',
    actions: ['tags.manage', 'audio.manage'] as const,
  },
} as const;

type CategoryKey = keyof typeof CATEGORY_META;

const ALL_CATEGORIES: { key: CategoryKey; icon: string; actions: readonly string[] }[] = [
  { key: 'Library', icon: CATEGORY_META.Library.icon, actions: CATEGORY_META.Library.actions },
  { key: 'Playback', icon: CATEGORY_META.Playback.icon, actions: CATEGORY_META.Playback.actions },
  {
    key: 'Management',
    icon: CATEGORY_META.Management.icon,
    actions: CATEGORY_META.Management.actions,
  },
];

const ALL_ACTIONS = ALL_CATEGORIES.flatMap((c) => c.actions);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function categorySummary(
  mapping: Record<string, string[]>,
  roleId: string,
  actions: readonly string[]
): { granted: number; total: number } {
  const granted = actions.filter((a) => (mapping[a] ?? []).includes(roleId)).length;
  return { granted, total: actions.length };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function PermissionsPage() {
  const [data, setData] = useState<PermissionsResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string[]>>({});
  const [savedMapping, setSavedMapping] = useState<Record<string, string[]>>({});
  const [explicitlyManaged, setExplicitlyManaged] = useState<Set<string>>(new Set());
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());
  const [roleToRemove, setRoleToRemove] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Load ------------------------------------------------------------------
  useEffect(() => {
    async function load() {
      try {
        const result = await fetchPermissions();
        setData(result);
        setMapping(result.mapping);
        setSavedMapping(result.mapping);
      } catch {
        setError('Could not load permissions.');
      }
    }
    load();
  }, []);

  // Has changes? (strip empty arrays before comparing — toggling on then off
  // shouldn't count as a change)
  const hasChanges = useMemo(() => {
    const normalize = (m: Record<string, string[]>) => {
      const out: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(m)) {
        if (v.length > 0) out[k] = v;
      }
      return JSON.stringify(out);
    };
    return normalize(mapping) !== normalize(savedMapping);
  }, [mapping, savedMapping]);

  // Derived state ---------------------------------------------------------
  const managedRoleIds = useMemo(() => {
    const fromMapping = new Set(Object.values(mapping).flat());
    return new Set([...fromMapping, ...explicitlyManaged]);
  }, [mapping, explicitlyManaged]);

  const managedRoles = useMemo(() => {
    if (!data) return [];
    return data.roles.filter((r) => managedRoleIds.has(r.id));
  }, [data, managedRoleIds]);

  const unmanagedRoles = useMemo(() => {
    if (!data) return [];
    return data.roles.filter((r) => !managedRoleIds.has(r.id));
  }, [data, managedRoleIds]);

  // Actions ---------------------------------------------------------------
  const togglePermission = useCallback((roleId: string, action: string) => {
    setMapping((prev) => {
      const current = new Set(prev[action] ?? []);
      if (current.has(roleId)) {
        current.delete(roleId);
      } else {
        current.add(roleId);
      }
      return { ...prev, [action]: [...current] };
    });
  }, []);

  const addRole = useCallback((role: { id: string; name: string; color: number }) => {
    setExplicitlyManaged((prev) => new Set(prev).add(role.id));
    setExpandedRoles((prev) => new Set(prev).add(role.id));
  }, []);

  const confirmRemoveRole = useCallback((roleId: string) => {
    setRoleToRemove(roleId);
  }, []);

  const removeRole = useCallback(() => {
    if (!roleToRemove) return;
    const roleId = roleToRemove;
    setRoleToRemove(null);

    setMapping((prev) => {
      const next: Record<string, string[]> = {};
      for (const action of Object.keys(prev)) {
        next[action] = (prev[action] ?? []).filter((id) => id !== roleId);
      }
      return next;
    });
    setExplicitlyManaged((prev) => {
      const next = new Set(prev);
      next.delete(roleId);
      return next;
    });
    setExpandedRoles((prev) => {
      const next = new Set(prev);
      next.delete(roleId);
      return next;
    });
  }, [roleToRemove]);

  const toggleExpanded = useCallback((roleId: string) => {
    setExpandedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!data) return;
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      await Promise.all(
        ALL_ACTIONS.map((action) => updatePermission(action, mapping[action] ?? []))
      );
      setSavedMapping({ ...mapping });
      setSuccessMsg('Permissions saved.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save permissions.');
    } finally {
      setSaving(false);
    }
  }, [data, mapping]);

  // Loading state ---------------------------------------------------------
  if (!data) {
    return (
      <div className="p-4 md:p-8">
        <div className="mb-6 md:mb-8">
          <h1 className="font-display text-3xl md:text-4xl text-fg tracking-wider">Permissions</h1>
        </div>
        {error ? <ErrorBanner message={error} /> : <p className="text-sm text-muted">Loading…</p>}
      </div>
    );
  }

  // Render ----------------------------------------------------------------
  return (
    <div className="p-4 md:p-8">
      {/* Page header */}
      <div className="mb-6 md:mb-8">
        <h1 className="font-display text-3xl md:text-4xl text-fg tracking-wider">Permissions</h1>
        <p className="font-mono text-xs text-muted mt-2">
          Grant specific abilities to non-admin roles. Super-admins always have full access.
        </p>
      </div>

      {error && <ErrorBanner message={error} className="mb-4" />}

      {successMsg && (
        <div className="mb-4 p-3 rounded-lg bg-accent/10 border border-accent/20 text-accent text-sm">
          {successMsg}
        </div>
      )}

      {/* Add role combobox */}
      <div className="mb-6">
        <RoleComboBox roles={unmanagedRoles} onSelect={addRole} placeholder="Add a role…" />
      </div>

      {/* Managed role cards */}
      {managedRoles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-muted mb-1">No managed roles yet</p>
          <p className="text-xs text-muted">
            Add a role above to start configuring granular permissions.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {managedRoles.map((role) => (
            <RoleCard
              key={role.id}
              role={role}
              mapping={mapping}
              labels={data.labels}
              isExpanded={expandedRoles.has(role.id)}
              onToggleExpand={() => toggleExpanded(role.id)}
              onTogglePermission={(action) => togglePermission(role.id, action)}
              onRemove={() => confirmRemoveRole(role.id)}
            />
          ))}
        </div>
      )}

      {/* Save */}
      <div className="flex gap-3 pt-5 justify-end">
        <Button variant="primary" onClick={handleSave} disabled={!hasChanges || saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>

      {/* Confirm remove */}
      {roleToRemove && (
        <ConfirmModal
          title="Remove Role"
          message={
            <>
              This will clear all permissions for{' '}
              <span className="text-fg font-medium">
                {data.roles.find((r) => r.id === roleToRemove)?.name ?? roleToRemove}
              </span>
              .
            </>
          }
          confirmLabel="Remove"
          onConfirm={removeRole}
          onCancel={() => setRoleToRemove(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RoleCard
// ---------------------------------------------------------------------------
interface RoleCardProps {
  role: { id: string; name: string; color: number };
  mapping: Record<string, string[]>;
  labels: Record<string, string>;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onTogglePermission: (action: string) => void;
  onRemove: () => void;
}

function RoleCard({
  role,
  mapping,
  labels,
  isExpanded,
  onToggleExpand,
  onTogglePermission,
  onRemove,
}: RoleCardProps) {
  const summaries = ALL_CATEGORIES.map((cat) => ({
    ...cat,
    summary: categorySummary(mapping, role.id, cat.actions),
  }));

  return (
    <div className="bg-elevated clay-resting rounded-xl overflow-hidden hover:clay-raised hover:-translate-y-px active:clay-flat active:translate-y-0 transition-all duration-100">
      {/* Header row — clickable to toggle expand */}
      <div
        className="flex items-center gap-3 px-5 py-3 cursor-pointer"
        onClick={onToggleExpand}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleExpand();
          }
        }}
        role="button"
        tabIndex={0}
      >
        {/* Role identity */}
        <span
          className="w-3 h-3 rounded-full shrink-0"
          style={{
            backgroundColor: role.color
              ? `#${role.color.toString(16).padStart(6, '0')}`
              : 'var(--color-muted)',
          }}
        />
        <span className="text-sm font-medium text-fg">{role.name}</span>

        {/* Category badges */}
        <div className="flex items-center gap-4 ml-auto">
          {summaries.map((cat) => (
            <span
              key={cat.key}
              className={`flex items-center gap-1.5 text-xs font-mono
                ${cat.summary.granted > 0 ? 'text-accent' : 'text-muted'}`}
            >
              <span className="text-sm">{cat.icon}</span>
              <span>
                {cat.summary.granted}/{cat.summary.total}
              </span>
            </span>
          ))}
        </div>

        {/* Remove */}
        <Button
          variant="danger"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title={`Remove ${role.name}`}
          aria-label={`Remove ${role.name}`}
          className="shrink-0"
        >
          <TrashIcon size={16} weight="duotone" />
        </Button>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-border px-5 py-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {summaries.map((cat) => (
              <div key={cat.key}>
                <h4 className="text-xs font-mono text-muted uppercase tracking-wider mb-2.5">
                  <span className="text-sm mr-1.5">{cat.icon}</span>
                  {cat.key}
                </h4>
                <div className="space-y-2">
                  {cat.actions.map((action) => {
                    const checked = (mapping[action] ?? []).includes(role.id);
                    return (
                      <label
                        key={action}
                        className="flex items-center gap-2.5 text-sm text-fg cursor-pointer group"
                      >
                        <Checkbox checked={checked} onChange={() => onTogglePermission(action)} />
                        <span className="group-hover:text-fg transition-colors">
                          {labels[action] ?? action}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
