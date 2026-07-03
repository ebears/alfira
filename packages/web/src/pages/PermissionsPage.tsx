import { useEffect, useState } from 'react';
import { fetchPermissions, type PermissionsResponse, updatePermission } from '../api/api';
import { ErrorBanner } from '../components/ui/ErrorBanner';

export default function PermissionsPage() {
  const [data, setData] = useState<PermissionsResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const result = await fetchPermissions();
        setData(result);
        setMapping(result.mapping);
      } catch {
        setError('Could not load permissions.');
      }
    }
    load();
  }, []);

  function toggleRole(action: string, roleId: string) {
    setMapping((prev) => {
      const current = new Set(prev[action] ?? []);
      if (current.has(roleId)) {
        current.delete(roleId);
      } else {
        current.add(roleId);
      }
      return { ...prev, [action]: [...current] };
    });
  }

  async function handleSave() {
    if (!data) return;
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      // Save each action's role assignments
      const actions = data.categories.flatMap((c) => c.actions);
      await Promise.all(actions.map((action) => updatePermission(action, mapping[action] ?? [])));
      setSuccessMsg('Permissions saved.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save permissions.');
    } finally {
      setSaving(false);
    }
  }

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

  const { roles, categories, labels } = data;

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

      <div className="space-y-6">
        {categories.map((category) => (
          <section key={category.label}>
            <h2 className="font-mono text-xs text-muted uppercase tracking-wider mb-3">
              {category.label}
            </h2>
            <div className="bg-elevated border border-border rounded-xl p-5 space-y-4">
              {category.actions.map((action) => (
                <div key={action} className="space-y-2">
                  <h3 className="text-sm text-fg font-medium">{labels[action] ?? action}</h3>
                  {roles.length === 0 ? (
                    <p className="text-xs text-muted italic">No roles available.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {roles.map((role) => {
                        const isSelected = (mapping[action] ?? []).includes(role.id);
                        return (
                          <label
                            key={role.id}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-colors text-sm ${
                              isSelected
                                ? 'border-accent bg-accent/5'
                                : 'border-border hover:border-muted'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleRole(action, role.id)}
                              className="accent-accent"
                            />
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{
                                backgroundColor: role.color
                                  ? `#${role.color.toString(16).padStart(6, '0')}`
                                  : 'var(--color-muted)',
                              }}
                            />
                            <span>{role.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Save */}
      <div className="flex gap-3 pt-6 justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={`font-body text-sm px-4 py-1.5 rounded transition-colors ${
            !saving
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
