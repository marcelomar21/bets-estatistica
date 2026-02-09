'use client';

import { useState, useEffect, useCallback } from 'react';
import type { MtprotoSession, SuperAdminBotConfig } from '@/types/database';

type SetupPhase = 'idle' | 'sending_code' | 'awaiting_code' | 'verifying';

export default function TelegramSettingsPage() {
  // MTProto Session state
  const [sessions, setSessions] = useState<MtprotoSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [setupPhase, setSetupPhase] = useState<SetupPhase>('idle');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [twoFaPassword, setTwoFaPassword] = useState('');
  const [needs2fa, setNeeds2fa] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Bot Super Admin state
  const [botConfig, setBotConfig] = useState<SuperAdminBotConfig | null>(null);
  const [loadingBot, setLoadingBot] = useState(true);
  const [botToken, setBotToken] = useState('');
  const [founderChatIds, setFounderChatIds] = useState('');
  const [savingBot, setSavingBot] = useState(false);
  const [botError, setBotError] = useState<string | null>(null);
  const [botSuccess, setBotSuccess] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Array<{ chatId: number; reachable: boolean; error?: string }> | null>(null);
  const [testing, setTesting] = useState(false);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/mtproto/sessions');
      const data = await res.json();
      if (data.success) setSessions(data.data);
    } catch {
      // Silent fail
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  const fetchBotConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/super-admin-bot');
      const data = await res.json();
      if (data.success && data.data) {
        setBotConfig(data.data);
        setFounderChatIds(data.data.founder_chat_ids.join(', '));
      }
    } catch {
      // Silent fail
    } finally {
      setLoadingBot(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    fetchBotConfig();
  }, [fetchSessions, fetchBotConfig]);

  // MTProto: Send code
  async function handleSendCode() {
    setSessionError(null);
    setSetupPhase('sending_code');
    try {
      const res = await fetch('/api/mtproto/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: phoneNumber }),
      });
      const data = await res.json();
      if (!data.success) {
        setSessionError(data.error.message);
        setSetupPhase('idle');
        return;
      }
      setSetupToken(data.data.setup_token);
      setSetupPhase('awaiting_code');
    } catch {
      setSessionError('Erro de conexão');
      setSetupPhase('idle');
    }
  }

  // MTProto: Verify code
  async function handleVerify() {
    setSessionError(null);
    setSetupPhase('verifying');
    try {
      const res = await fetch('/api/mtproto/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setup_token: setupToken,
          code: verifyCode,
          ...(needs2fa && twoFaPassword ? { password: twoFaPassword } : {}),
        }),
      });
      const data = await res.json();
      if (!data.success) {
        if (data.error.code === 'MTPROTO_2FA_REQUIRED') {
          setNeeds2fa(true);
          setSetupPhase('awaiting_code');
          setSessionError('Senha 2FA necessária');
          return;
        }
        setSessionError(data.error.message);
        setSetupPhase('awaiting_code');
        return;
      }
      // Success — reset and refresh
      setSetupPhase('idle');
      setPhoneNumber('');
      setVerifyCode('');
      setTwoFaPassword('');
      setNeeds2fa(false);
      setSetupToken('');
      fetchSessions();
    } catch {
      setSessionError('Erro de conexão');
      setSetupPhase('awaiting_code');
    }
  }

  // MTProto: Deactivate session
  async function handleDeactivateSession(id: string) {
    try {
      await fetch(`/api/mtproto/sessions/${id}`, { method: 'DELETE' });
      fetchSessions();
    } catch {
      // Silent fail
    }
  }

  // Bot Super Admin: Save config
  async function handleSaveBot(e: React.FormEvent) {
    e.preventDefault();
    setBotError(null);
    setBotSuccess(null);
    setSavingBot(true);

    const chatIds = founderChatIds.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n) && n > 0);
    if (chatIds.length === 0) {
      setBotError('Pelo menos um Founder Chat ID é necessário');
      setSavingBot(false);
      return;
    }

    try {
      const res = await fetch('/api/super-admin-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_token: botToken, founder_chat_ids: chatIds }),
      });
      const data = await res.json();
      if (!data.success) {
        setBotError(data.error.message);
      } else {
        setBotSuccess('Configuração salva com sucesso!');
        setBotToken('');
        fetchBotConfig();
      }
    } catch {
      setBotError('Erro de conexão');
    } finally {
      setSavingBot(false);
    }
  }

  // Bot Super Admin: Test reachability
  async function handleTest() {
    setTesting(true);
    setTestResults(null);
    try {
      const res = await fetch('/api/super-admin-bot/test', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setTestResults(data.data.results);
      } else {
        setBotError(data.error.message);
      }
    } catch {
      setBotError('Erro de conexão ao testar');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configurações Telegram</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure sessão MTProto e Bot Super Admin para automação do onboarding
        </p>
      </div>

      {/* Section 1: MTProto Session */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Sessão MTProto</h2>
        <p className="text-sm text-gray-500 mb-4">
          Sessão de conta do founder para criar supergrupos automaticamente no Telegram.
        </p>

        {/* Setup Wizard */}
        {setupPhase === 'idle' && (
          <div className="space-y-3">
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                Número do Telefone (formato internacional)
              </label>
              <div className="flex gap-2">
                <input
                  id="phone"
                  type="text"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+5511999999999"
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  onClick={handleSendCode}
                  disabled={!phoneNumber}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Enviar Código
                </button>
              </div>
            </div>
          </div>
        )}

        {setupPhase === 'sending_code' && (
          <p className="text-sm text-blue-600">Enviando código para {phoneNumber}...</p>
        )}

        {setupPhase === 'awaiting_code' && (
          <div className="space-y-3">
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">
                Código de Verificação
              </label>
              <input
                id="code"
                type="text"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                placeholder="12345"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            {needs2fa && (
              <div>
                <label htmlFor="twofa" className="block text-sm font-medium text-gray-700 mb-1">
                  Senha 2FA
                </label>
                <input
                  id="twofa"
                  type="password"
                  value={twoFaPassword}
                  onChange={(e) => setTwoFaPassword(e.target.value)}
                  placeholder="Senha do Two-Factor Authentication"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleVerify}
                disabled={!verifyCode}
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                Verificar
              </button>
              <button
                onClick={() => { setSetupPhase('idle'); setVerifyCode(''); setTwoFaPassword(''); setNeeds2fa(false); }}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {setupPhase === 'verifying' && (
          <p className="text-sm text-blue-600">Verificando código...</p>
        )}

        {sessionError && (
          <p className="mt-2 text-sm text-red-600">{sessionError}</p>
        )}

        {/* Sessions List */}
        <div className="mt-6">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Sessões Ativas</h3>
          {loadingSessions ? (
            <p className="text-sm text-gray-400">Carregando...</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhuma sessão configurada</p>
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-md border border-gray-200 p-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{s.label}</p>
                    <p className="text-xs text-gray-500">{s.phone_number}</p>
                    <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${
                      s.requires_reauth
                        ? 'bg-red-100 text-red-700'
                        : s.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                    }`}>
                      {s.requires_reauth ? 'Requer Re-auth' : s.is_active ? 'Ativa' : 'Inativa'}
                    </span>
                  </div>
                  {s.is_active && (
                    <button
                      onClick={() => handleDeactivateSession(s.id)}
                      className="text-sm text-red-600 hover:text-red-800"
                    >
                      Desativar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Section 2: Bot Super Admin */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Bot Super Admin</h2>
        <p className="text-sm text-gray-500 mb-4">
          Bot dedicado para notificar founders sobre novos grupos e eventos. Separado dos bots do pool.
        </p>

        {botConfig && (
          <div className="mb-4 rounded-md bg-green-50 p-3">
            <p className="text-sm text-green-700">
              Bot configurado: <strong>@{botConfig.bot_username}</strong> — {botConfig.founder_chat_ids.length} founder(s)
            </p>
          </div>
        )}

        <form onSubmit={handleSaveBot} className="space-y-3">
          <div>
            <label htmlFor="botToken" className="block text-sm font-medium text-gray-700 mb-1">
              Bot Token (do BotFather)
            </label>
            <input
              id="botToken"
              type="password"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder="123456789:ABCdefGhIJKlmNopQRStuvWXYZ"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="founderIds" className="block text-sm font-medium text-gray-700 mb-1">
              Founder Chat IDs (separados por vírgula)
            </label>
            <input
              id="founderIds"
              type="text"
              value={founderChatIds}
              onChange={(e) => setFounderChatIds(e.target.value)}
              placeholder="123456789, 987654321"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={savingBot || !botToken}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {savingBot ? 'Salvando...' : 'Salvar Configuração'}
            </button>
            {botConfig && (
              <button
                type="button"
                onClick={handleTest}
                disabled={testing}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {testing ? 'Testando...' : 'Testar Notificação'}
              </button>
            )}
          </div>
        </form>

        {botError && <p className="mt-2 text-sm text-red-600">{botError}</p>}
        {botSuccess && <p className="mt-2 text-sm text-green-600">{botSuccess}</p>}

        {testResults && (
          <div className="mt-4 space-y-2">
            <h3 className="text-sm font-medium text-gray-700">Resultado do Teste</h3>
            {testResults.map((r) => (
              <div key={r.chatId} className={`text-sm rounded-md p-2 ${r.reachable ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                Chat {r.chatId}: {r.reachable ? 'OK' : `Falha — ${r.error}`}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 3: Additional Invitees */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Convidados Adicionais</h2>
        <p className="text-sm text-gray-500">
          Configure convidados adicionais por grupo na página de edição de cada grupo.
        </p>
        <a
          href="/groups"
          className="mt-3 inline-block text-sm text-blue-600 hover:text-blue-800 underline"
        >
          Ir para Grupos
        </a>
      </div>
    </div>
  );
}
