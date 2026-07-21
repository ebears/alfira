import { ShieldCheckIcon, TrashIcon } from '@phosphor-icons/react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';

import { fetchPermissions, type PermissionsResponse, updatePermission } from '../api/api';
import ConfirmModal from '../components/ConfirmModal';
import EmptyState from '../components/EmptyState';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import Checkbox from '../components/ui/Checkbox';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { PageHeader } from '../components/ui/PageHeader';
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
    let cancelled = false;
    async function load() {
      try {
        const result = await fetchPermissions();
        if (cancelled) {
          return;
        }
        setData(result);
        setMapping(result.mapping);
        setSavedMapping(result.mapping);
      } catch {
        if (cancelled) {
          return;
        }
        setError('Could not load permissions.');
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Has changes? (strip empty arrays before comparing — toggling on then off
  // shouldn't count as a change)
  const hasChanges = useMemo(() => {
    const normalize = (m: Record<string, string[]>) => {
      const out: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(m)) {
        if (v.length > 0) {
          out[k] = v;
        }
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
    if (!data) {
      return [];
    }
    return data.roles.filter((r) => managedRoleIds.has(r.id));
  }, [data, managedRoleIds]);

  const unmanagedRoles = useMemo(() => {
    if (!data) {
      return [];
    }
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
    if (!roleToRemove) {
      return;
    }
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
      if (next.has(roleId)) {
        next.delete(roleId);
      } else {
        next.add(roleId);
      }
      return next;
    });
  }, []);

  const handleCancelRemove = useCallback(() => {
    setRoleToRemove(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!data) {
      return;
    }
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      await Promise.all(
        ALL_ACTIONS.map((action) => updatePermission(action, mapping[action] ?? []))
      );
      setSavedMapping({ ...mapping });
      setSuccessMsg('Permissions saved.');
      setTimeout(() => {
        setSuccessMsg(null);
      }, 3000);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Failed to save permissions.');
    } finally {
      setSaving(false);
    }
  }, [data, mapping]);

  // Loading state ---------------------------------------------------------
  // Loading state — deferred 200ms to avoid flash on fast loads
  const [showLoading, setShowLoading] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setShowLoading(true);
    }, 200);
    return () => {
      clearTimeout(t);
    };
  }, []);

  if (!data) {
    return (
      <div className='h-full overflow-y-auto p-4 md:p-8'>
        <PageHeader icon={ShieldCheckIcon} title='Permissions' />
        {error ? (
          <ErrorBanner message={error} />
        ) : (
          showLoading && <p className='text-muted text-sm'>Loading…</p>
        )}
      </div>
    );
  }

  // Render ----------------------------------------------------------------
  return (
    <div className='h-full overflow-y-auto p-4 md:p-8'>
      <PageHeader
        icon={ShieldCheckIcon}
        title='Permissions'
        subtitle='Grant specific abilities to non-admin roles. Super-admins always have full access.'
      />

      {error && <ErrorBanner message={error} className='mb-4' />}

      {successMsg && (
        <div className='bg-accent/10 border-accent/20 text-accent mb-4 rounded-lg border p-3 text-sm'>
          {successMsg}
        </div>
      )}

      {/* Add role combobox */}
      <div className='mb-6'>
        <RoleComboBox roles={unmanagedRoles} onSelect={addRole} placeholder='Add a role…' />
      </div>

      {/* Managed role cards */}
      {managedRoles.length === 0 ? (
        <EmptyState
          title='No Managed Roles'
          message='Add a role above to start configuring granular permissions'
        />
      ) : (
        <div className='space-y-4'>
          {managedRoles.map((role) => (
            <ManagedRoleCard
              key={role.id}
              role={role}
              mapping={mapping}
              labels={data.labels}
              isExpanded={expandedRoles.has(role.id)}
              toggleExpanded={toggleExpanded}
              togglePermission={togglePermission}
              confirmRemoveRole={confirmRemoveRole}
            />
          ))}
        </div>
      )}

      {/* Save */}
      <div className='flex justify-end gap-3 pt-5'>
        <Button variant='primary' onClick={handleSave} disabled={!hasChanges || saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>

      {/* Confirm remove */}
      {roleToRemove && (
        <ConfirmModal
          title='Remove Role'
          message={
            <>
              This will clear all permissions for{' '}
              <span className='text-fg font-medium'>
                {data.roles.find((r) => r.id === roleToRemove)?.name ?? roleToRemove}
              </span>
              .
            </>
          }
          confirmLabel='Remove'
          onConfirm={removeRole}
          onCancel={handleCancelRemove}
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

const ManagedRoleCard = memo(function ManagedRoleCard({
  role,
  mapping,
  labels,
  isExpanded,
  toggleExpanded,
  togglePermission,
  confirmRemoveRole,
}: {
  role: { id: string; name: string; color: number };
  mapping: Record<string, string[]>;
  labels: Record<string, string>;
  isExpanded: boolean;
  toggleExpanded: (id: string) => void;
  togglePermission: (roleId: string, action: string) => void;
  confirmRemoveRole: (id: string) => void;
}) {
  const handleToggleExpand = useCallback(() => {
    toggleExpanded(role.id);
  }, [toggleExpanded, role.id]);
  const handleTogglePermission = useCallback(
    (action: string) => {
      togglePermission(role.id, action);
    },
    [togglePermission, role.id]
  );
  const handleRemove = useCallback(() => {
    confirmRemoveRole(role.id);
  }, [confirmRemoveRole, role.id]);

  return (
    <RoleCard
      role={role}
      mapping={mapping}
      labels={labels}
      isExpanded={isExpanded}
      onToggleExpand={handleToggleExpand}
      onTogglePermission={handleTogglePermission}
      onRemove={handleRemove}
    />
  );
});

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

  const dotStyle = useMemo(
    () => ({
      backgroundColor: role.color
        ? `#${role.color.toString(16).padStart(6, '0')}`
        : 'var(--color-muted)',
    }),
    [role.color]
  );

  const handleRemoveClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRemove();
    },
    [onRemove]
  );

  return (
    <Card hoverable className='overflow-hidden rounded-xl'>
      {/* Header row — clickable to toggle expand */}
      <button
        type='button'
        className='flex w-full cursor-pointer items-center gap-3 px-5 py-3'
        onClick={onToggleExpand}
      >
        <span className='h-3 w-3 shrink-0 rounded-full' style={dotStyle} />
        <span className='text-fg text-sm font-medium'>{role.name}</span>

        {/* Category badges */}
        <div className='ml-auto flex items-center gap-4'>
          {summaries.map((cat) => (
            <span
              key={cat.key}
              className={`flex items-center gap-1.5 font-mono text-xs ${cat.summary.granted > 0 ? 'text-accent' : 'text-muted'}`}
            >
              <span className='text-sm'>{cat.icon}</span>
              <span>
                {cat.summary.granted}/{cat.summary.total}
              </span>
            </span>
          ))}
        </div>

        {/* Remove */}
        <Button
          variant='danger'
          size='icon'
          onClick={handleRemoveClick}
          title={`Remove ${role.name}`}
          aria-label={`Remove ${role.name}`}
          className='shrink-0'
        >
          <TrashIcon size={16} weight='duotone' />
        </Button>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className='border-border border-t px-5 py-4'>
          <div className='grid grid-cols-1 gap-5 md:grid-cols-3'>
            {summaries.map((cat) => (
              <CategorySection
                key={cat.key}
                cat={cat}
                mapping={mapping}
                roleId={role.id}
                labels={labels}
                onTogglePermission={onTogglePermission}
              />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

const CategorySection = memo(function CategorySection({
  cat,
  mapping,
  roleId,
  labels,
  onTogglePermission,
}: {
  cat: {
    key: string;
    icon: string;
    actions: readonly string[];
    summary: { granted: number; total: number };
  };
  mapping: Record<string, string[]>;
  roleId: string;
  labels: Record<string, string>;
  onTogglePermission: (action: string) => void;
}) {
  return (
    <div>
      <h4 className='text-muted mb-2.5 font-mono text-xs tracking-wider uppercase'>
        <span className='mr-1.5 text-sm'>{cat.icon}</span>
        {cat.key}
      </h4>
      <div className='space-y-2'>
        {cat.actions.map((action) => {
          const checked = (mapping[action] ?? []).includes(roleId);
          return (
            <PermissionCheckbox
              key={action}
              action={action}
              checked={checked}
              label={labels[action] ?? action}
              onToggle={onTogglePermission}
            />
          );
        })}
      </div>
    </div>
  );
});

const PermissionCheckbox = memo(function PermissionCheckbox({
  action,
  checked,
  label,
  onToggle,
}: {
  action: string;
  checked: boolean;
  label: string;
  onToggle: (action: string) => void;
}) {
  const handleChange = useCallback(() => {
    onToggle(action);
  }, [onToggle, action]);

  return (
    <label className='text-fg group flex cursor-pointer items-center gap-2.5 text-sm'>
      <Checkbox checked={checked} onChange={handleChange} />
      <span className='group-hover:text-fg transition-colors'>{label}</span>
    </label>
  );
});
