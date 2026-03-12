'use client';

import { useEffect, useState } from 'react';
import { SuperAdminGuard } from '@/components/guards/SuperAdminGuard';

interface AdminUser {
  id: string;
  email: string;
  role: 'super_admin' | 'group_admin';
  group_id: string | null;
  created_at: string;
  groups: { name: string } | null;
}

interface Group {
  id: string;
  name: string;
}

export default function AdminUsersPage() {
  return (
    <SuperAdminGuard>
      <AdminUsersContent />
    </SuperAdminGuard>
  );
}

function AdminUsersContent() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create modal state
  const [showCreate, setShowCreate] = useState(false);
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [createRole, setCreateRole] = useState<'super_admin' | 'group_admin'>('group_admin');
  const [createGroupId, setCreateGroupId] = useState('');
  const [creating, setCreating] = useState(false);

  // Success modal (shows password after create/reset)
  const [successModal, setSuccessModal] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Reset password modal
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetEmail, setResetEmail] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function fetchUsers() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin-users');
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Failed to fetch');
      setUsers(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  }

  async function fetchGroups() {
    try {
      const res = await fetch('/api/groups');
      const data = await res.json();
      if (data.success) setGroups(data.data);
    } catch {
      // Groups fetch is non-critical
    }
  }

  useEffect(() => {
    fetchUsers();
    fetchGroups();
  }, []);

  function generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let pwd = '';
    for (let i = 0; i < 10; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const payload: Record<string, string> = {
        email: createEmail,
        password: createPassword,
        role: createRole,
      };
      if (createRole === 'group_admin' && createGroupId) {
        payload.group_id = createGroupId;
      }
      const res = await fetch('/api/admin-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Erro ao criar');
      setShowCreate(false);
      setSuccessModal({ email: createEmail, password: createPassword });
      setCreateEmail('');
      setCreatePassword('');
      setCreateRole('group_admin');
      setCreateGroupId('');
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar usuário');
    } finally {
      setCreating(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetUserId) return;
    setResetting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin-users/${resetUserId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Erro ao redefinir senha');
      setResetUserId(null);
      setSuccessModal({ email: resetEmail, password: resetPassword });
      setResetEmail('');
      setResetPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao redefinir senha');
    } finally {
      setResetting(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin-users/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Erro ao remover');
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover usuário');
    } finally {
      setDeletingId(null);
    }
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function openResetModal(user: AdminUser) {
    setResetUserId(user.id);
    setResetEmail(user.email);
    setResetPassword(generatePassword());
    setShowResetPassword(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin Users</h1>
        <button
          onClick={() => {
            setCreatePassword(generatePassword());
            setShowCreatePassword(false);
            setShowCreate(true);
          }}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Criar Admin User
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <p className="text-gray-500">Carregando...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Grupo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Criado em</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    Nenhum admin user encontrado
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-4 py-3 text-sm">{user.email}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        user.role === 'super_admin'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {user.role === 'super_admin' ? 'Super Admin' : 'Group Admin'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {user.groups?.name || (user.group_id ? user.group_id.slice(0, 8) + '...' : '—')}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(user.created_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-3">
                        <button
                          onClick={() => openResetModal(user)}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800"
                        >
                          Redefinir Senha
                        </button>
                        {confirmDeleteId === user.id ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="text-xs text-gray-500">Confirmar?</span>
                            <button
                              onClick={() => { handleDelete(user.id); setConfirmDeleteId(null); }}
                              disabled={deletingId === user.id}
                              className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                            >
                              {deletingId === user.id ? 'Removendo...' : 'Sim'}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-xs font-medium text-gray-500 hover:text-gray-700"
                            >
                              Não
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(user.id)}
                            className="text-xs font-medium text-red-600 hover:text-red-800"
                          >
                            Remover
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-bold">Criar Admin User</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  required
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="email@exemplo.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Senha</label>
                <div className="relative mt-1">
                  <input
                    type={showCreatePassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 pr-20 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Mínimo 6 caracteres"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center gap-1 pr-2">
                    <button
                      type="button"
                      onClick={() => setShowCreatePassword(!showCreatePassword)}
                      className="text-xs text-gray-500 hover:text-gray-700"
                      title={showCreatePassword ? 'Ocultar' : 'Mostrar'}
                    >
                      {showCreatePassword ? '🙈' : '👁'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreatePassword(generatePassword())}
                      className="text-xs text-blue-600 hover:text-blue-800"
                      title="Gerar nova senha"
                    >
                      🔄
                    </button>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Role</label>
                <select
                  value={createRole}
                  onChange={(e) => setCreateRole(e.target.value as 'super_admin' | 'group_admin')}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="group_admin">Group Admin</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>
              {createRole === 'group_admin' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Grupo</label>
                  <select
                    required
                    value={createGroupId}
                    onChange={(e) => setCreateGroupId(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Selecione um grupo</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {creating ? 'Criando...' : 'Criar Usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-bold">Redefinir Senha</h2>
            <p className="mb-4 text-sm text-gray-600">{resetEmail}</p>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Nova Senha</label>
                <div className="relative mt-1">
                  <input
                    type={showResetPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 pr-20 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Mínimo 6 caracteres"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center gap-1 pr-2">
                    <button
                      type="button"
                      onClick={() => setShowResetPassword(!showResetPassword)}
                      className="text-xs text-gray-500 hover:text-gray-700"
                      title={showResetPassword ? 'Ocultar' : 'Mostrar'}
                    >
                      {showResetPassword ? '🙈' : '👁'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setResetPassword(generatePassword())}
                      className="text-xs text-blue-600 hover:text-blue-800"
                      title="Gerar nova senha"
                    >
                      🔄
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setResetUserId(null); setResetEmail(''); setResetPassword(''); }}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={resetting}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {resetting ? 'Redefinindo...' : 'Redefinir Senha'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Success Modal — shows credentials to copy */}
      {successModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-bold text-green-700">Credenciais</h2>
            <p className="mb-3 text-sm text-gray-600">
              Copie e envie para o usuário. A senha não poderá ser visualizada novamente.
            </p>
            <div className="space-y-3 rounded-md bg-gray-50 p-4">
              <div>
                <span className="text-xs font-medium text-gray-500">Email</span>
                <p className="font-mono text-sm">{successModal.email}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-gray-500">Senha</span>
                <p className="font-mono text-sm">{successModal.password}</p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => handleCopy(`Email: ${successModal.email}\nSenha: ${successModal.password}`)}
                className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
              >
                {copied ? 'Copiado!' : 'Copiar'}
              </button>
              <button
                onClick={() => { setSuccessModal(null); setCopied(false); }}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
