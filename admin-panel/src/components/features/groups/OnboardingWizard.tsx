'use client';

import { useState, useEffect } from 'react';
import type { OnboardingStep } from '@/types/database';

interface Bot {
  id: string;
  bot_username: string;
  status: string;
  group_id?: string | null;
}

interface OnboardingResult {
  group: { id: string; name: string; status: string; checkout_url: string };
  checkout_url: string;
  admin_email: string;
  temp_password: string;
  bot_username: string;
}

interface OnboardingError {
  code: string;
  message: string;
  step?: OnboardingStep;
  group_id?: string;
}

interface IncompleteGroup {
  id: string;
  name: string;
  status: string;
  mp_plan_id: string | null;
  render_service_id: string | null;
  telegram_group_id: number | null;
  bot_username?: string;
}

type WizardState = 'loading' | 'form' | 'processing' | 'success' | 'error';

const STEPS: { key: OnboardingStep; label: string }[] = [
  { key: 'creating', label: 'Criando Grupo' },
  { key: 'validating_bot', label: 'Validando Bot' },
  { key: 'configuring_mp', label: 'Config. Mercado Pago' },
  { key: 'deploying_bot', label: 'Deploy Bot' },
  { key: 'creating_admin', label: 'Criando Admin' },
  { key: 'creating_telegram_group', label: 'Criando Grupo Telegram' },
  { key: 'finalizing', label: 'Concluído' },
];

async function callStep(stepPayload: Record<string, unknown>): Promise<{ success: boolean; data?: Record<string, unknown>; error?: OnboardingError }> {
  const response = await fetch('/api/groups/onboarding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(stepPayload),
  });
  return response.json();
}

function determineResumeStep(group: IncompleteGroup): OnboardingStep {
  // Bot is already validated in step 1 (creating reserves it), so we start from validating_bot
  if (!group.mp_plan_id) return 'validating_bot';
  if (!group.render_service_id) return 'deploying_bot';
  if (!group.telegram_group_id) return 'creating_admin';
  return 'finalizing';
}

export function OnboardingWizard() {
  const [wizardState, setWizardState] = useState<WizardState>('loading');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [botId, setBotId] = useState('');
  const [price, setPrice] = useState('');
  const [bots, setBots] = useState<Bot[]>([]);
  const [loadingBots, setLoadingBots] = useState(true);
  const [currentStep, setCurrentStep] = useState<OnboardingStep | null>(null);
  const [result, setResult] = useState<OnboardingResult | null>(null);
  const [error, setError] = useState<OnboardingError | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  // Accumulated data from step responses
  const [groupId, setGroupId] = useState<string | null>(null);
  const [botUsername, setBotUsername] = useState<string>('');
  const [checkoutUrl, setCheckoutUrl] = useState<string>('');
  const [adminEmail, setAdminEmail] = useState<string>('');
  const [tempPassword, setTempPassword] = useState<string>('');

  // Incomplete onboarding detection
  const [incompleteGroup, setIncompleteGroup] = useState<IncompleteGroup | null>(null);
  const [resumeMode, setResumeMode] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);

  // Check for incomplete onboardings on mount
  useEffect(() => {
    async function checkIncomplete() {
      try {
        const res = await fetch('/api/groups');
        const json = await res.json();
        if (!json.success) {
          setWizardState('form');
          return;
        }

        const groups = Array.isArray(json.data) ? json.data : [];
        const incomplete = groups.find(
          (g: { status: string }) => g.status === 'failed' || g.status === 'creating',
        );

        if (incomplete) {
          // Fetch full details for resume
          const detailRes = await fetch(`/api/groups/${incomplete.id}`);
          const detailJson = await detailRes.json();

          if (detailJson.success) {
            const group = detailJson.data;
            // Also fetch associated bot
            const botsRes = await fetch('/api/bots');
            const botsJson = await botsRes.json();
            const associatedBot = botsJson.success
              ? botsJson.data.find((b: Bot) => b.group_id === group.id)
              : null;

            setIncompleteGroup({
              ...group,
              bot_username: associatedBot?.bot_username,
            });
          }
        }
      } catch {
        // Silent fail — show normal form
      }
      setWizardState('form');
    }
    checkIncomplete();
  }, []);

  useEffect(() => {
    async function loadBots() {
      try {
        const response = await fetch('/api/bots');
        const data = await response.json();
        if (data.success) {
          setBots(data.data.filter((b: Bot) => b.status === 'available'));
        }
      } catch {
        // Silent fail - empty bots list will show message
      } finally {
        setLoadingBots(false);
      }
    }
    loadBots();
  }, []);

  function validateForm(): boolean {
    const errors: Record<string, string> = {};
    if (!resumeMode) {
      if (!name || name.trim().length < 2) {
        errors.name = 'Nome deve ter pelo menos 2 caracteres';
      }
      if (!botId) {
        errors.bot_id = 'Selecione um bot';
      }
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Email inválido';
    }
    const parsedPrice = parseFloat(price);
    if (!price || isNaN(parsedPrice) || parsedPrice < 1) {
      errors.price = 'Preço deve ser pelo menos R$ 1,00';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function runSteps(startIndex: number, currentGroupId: string | null) {
    const parsedPrice = parseFloat(price);
    let gId = currentGroupId;
    // Local accumulators (React state setters are async, can't read mid-loop)
    let localBotUsername = botUsername;
    let localCheckoutUrl = checkoutUrl;
    let localAdminEmail = adminEmail;
    let localTempPassword = tempPassword;

    for (let i = startIndex; i < STEPS.length; i++) {
      const stepKey = STEPS[i].key;
      setCurrentStep(stepKey);

      let payload: Record<string, unknown>;
      switch (stepKey) {
        case 'creating':
          payload = { step: 'creating', name: name.trim(), email: email.trim(), bot_id: botId, price: parsedPrice };
          break;
        case 'validating_bot':
          payload = { step: 'validating_bot', group_id: gId };
          break;
        case 'configuring_mp':
          payload = { step: 'configuring_mp', group_id: gId, price: parsedPrice };
          break;
        case 'deploying_bot':
          payload = { step: 'deploying_bot', group_id: gId };
          break;
        case 'creating_admin':
          payload = { step: 'creating_admin', group_id: gId, email: email.trim() };
          break;
        case 'creating_telegram_group':
          payload = { step: 'creating_telegram_group', group_id: gId };
          break;
        case 'finalizing':
          payload = { step: 'finalizing', group_id: gId };
          break;
      }

      const res = await callStep(payload);

      if (!res.success) {
        setWizardState('error');
        setError({ ...res.error!, group_id: gId || res.error?.group_id });
        return;
      }

      // Accumulate data from step responses
      if (stepKey === 'creating' && res.data) {
        gId = res.data.group_id as string;
        setGroupId(gId);
        localBotUsername = res.data.bot_username as string;
        setBotUsername(localBotUsername);
      }
      if (stepKey === 'validating_bot' && res.data) {
        localBotUsername = res.data.bot_username as string;
        setBotUsername(localBotUsername);
      }
      if (stepKey === 'configuring_mp' && res.data) {
        localCheckoutUrl = res.data.checkout_url as string;
        setCheckoutUrl(localCheckoutUrl);
      }
      if (stepKey === 'creating_admin' && res.data) {
        localAdminEmail = res.data.admin_email as string;
        setAdminEmail(localAdminEmail);
        if (res.data.temp_password) {
          localTempPassword = res.data.temp_password as string;
          setTempPassword(localTempPassword);
        }
      }
      if (stepKey === 'finalizing' && res.data) {
        const group = res.data.group as OnboardingResult['group'];
        setResult({
          group,
          checkout_url: localCheckoutUrl || group.checkout_url,
          admin_email: localAdminEmail || email.trim(),
          temp_password: localTempPassword,
          bot_username: localBotUsername,
        });
        setWizardState('success');
        return;
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateForm()) return;

    setWizardState('processing');
    setError(null);

    try {
      if (resumeMode && incompleteGroup) {
        // Resume from the appropriate step
        const resumeStep = determineResumeStep(incompleteGroup);
        const stepIndex = STEPS.findIndex((s) => s.key === resumeStep);
        setGroupId(incompleteGroup.id);
        setCurrentStep(resumeStep);
        await runSteps(stepIndex, incompleteGroup.id);
      } else {
        setCurrentStep('creating');
        await runSteps(0, null);
      }
    } catch {
      setWizardState('error');
      setError({ code: 'NETWORK_ERROR', message: 'Erro de conexão. Tente novamente.' });
    }
  }

  async function handleRetry() {
    if (!error?.step || !groupId) {
      // Reset to form for full retry
      setWizardState('form');
      setError(null);
      return;
    }

    const failedStepIndex = STEPS.findIndex((s) => s.key === error.step);
    if (failedStepIndex === -1) {
      setWizardState('form');
      setError(null);
      return;
    }

    setWizardState('processing');
    setCurrentStep(error.step);
    setError(null);

    try {
      await runSteps(failedStepIndex, groupId);
    } catch {
      setWizardState('error');
      setError({ code: 'NETWORK_ERROR', message: 'Erro de conexão. Tente novamente.' });
    }
  }

  async function handleCleanup(targetGroupId: string) {
    setCleaningUp(true);
    try {
      const res = await fetch('/api/groups/onboarding/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: targetGroupId }),
      });
      const json = await res.json();
      if (json.success) {
        setIncompleteGroup(null);
        setResumeMode(false);
        setGroupId(null);
        setError(null);
        setCurrentStep(null);
        setWizardState('form');

        // Reload bots (the cleaned-up bot is now available again)
        const botsRes = await fetch('/api/bots');
        const botsJson = await botsRes.json();
        if (botsJson.success) {
          setBots(botsJson.data.filter((b: Bot) => b.status === 'available'));
        }
      }
    } catch {
      // Silent fail
    } finally {
      setCleaningUp(false);
    }
  }

  async function handleStartOver() {
    const targetId = groupId || error?.group_id;
    if (targetId) {
      await handleCleanup(targetId);
    } else {
      setWizardState('form');
      setError(null);
    }
  }

  function handleResumeClick() {
    if (!incompleteGroup) return;
    setResumeMode(true);
    setName(incompleteGroup.name);
    setGroupId(incompleteGroup.id);
    if (incompleteGroup.bot_username) {
      setBotUsername(incompleteGroup.bot_username);
    }
  }

  function getStepStatus(stepKey: OnboardingStep): 'pending' | 'active' | 'done' | 'error' {
    if (!currentStep) return 'pending';
    const currentIndex = STEPS.findIndex((s) => s.key === currentStep);
    const stepIndex = STEPS.findIndex((s) => s.key === stepKey);

    if (wizardState === 'error' && stepKey === currentStep) return 'error';
    if (wizardState === 'success') return 'done';
    if (stepIndex < currentIndex) return 'done';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
  }

  async function copyCredentials() {
    if (!result) return;
    const text = `Email: ${result.admin_email}\nSenha: ${result.temp_password}\nBot: @${result.bot_username}\nCheckout: ${result.checkout_url}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // LOADING STATE
  if (wizardState === 'loading') {
    return (
      <div className="flex justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  // FORM STATE
  if (wizardState === 'form') {
    return (
      <div className="space-y-4">
        {/* Incomplete onboarding banner */}
        {incompleteGroup && !resumeMode && (
          <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 space-y-3">
            <div className="flex items-start gap-2">
              <svg className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-yellow-800">
                  Onboarding incompleto encontrado
                </p>
                <p className="mt-1 text-sm text-yellow-700">
                  O grupo <strong>&ldquo;{incompleteGroup.name}&rdquo;</strong>
                  {incompleteGroup.bot_username && <> (bot: @{incompleteGroup.bot_username})</>}
                  {' '}tem status <strong>&ldquo;{incompleteGroup.status}&rdquo;</strong>.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleResumeClick}
                className="rounded-md bg-yellow-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-yellow-700"
              >
                Retomar Onboarding
              </button>
              <button
                type="button"
                onClick={() => handleCleanup(incompleteGroup.id)}
                disabled={cleaningUp}
                className="rounded-md border border-yellow-400 bg-white px-3 py-1.5 text-sm font-medium text-yellow-700 hover:bg-yellow-50 disabled:opacity-50"
              >
                {cleaningUp ? 'Limpando...' : 'Descartar e Começar do Zero'}
              </button>
            </div>
          </div>
        )}

        {/* Resume mode header */}
        {resumeMode && incompleteGroup && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm text-blue-800">
              Retomando onboarding de <strong>&ldquo;{incompleteGroup.name}&rdquo;</strong>.
              Confirme o email e preço abaixo para continuar.
            </p>
            <button
              type="button"
              onClick={() => {
                setResumeMode(false);
                setName('');
                setGroupId(null);
              }}
              className="mt-2 text-xs text-blue-600 hover:text-blue-800 underline"
            >
              Cancelar e voltar
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!resumeMode && (
            <>
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Nome do Influencer / Grupo
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Ex: Canal do João"
                />
                {formErrors.name && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.name}</p>
                )}
              </div>

              <div>
                <label htmlFor="bot" className="block text-sm font-medium text-gray-700 mb-1">
                  Bot do Telegram
                </label>
                {loadingBots ? (
                  <p className="text-sm text-gray-500">Carregando bots...</p>
                ) : bots.length === 0 ? (
                  <p className="text-sm text-yellow-600">
                    Nenhum bot disponível. Adicione um bot no Pool de Bots primeiro.
                  </p>
                ) : (
                  <select
                    id="bot"
                    value={botId}
                    onChange={(e) => setBotId(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Selecione um bot</option>
                    {bots.map((bot) => (
                      <option key={bot.id} value={bot.id}>
                        @{bot.bot_username}
                      </option>
                    ))}
                  </select>
                )}
                {formErrors.bot_id && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.bot_id}</p>
                )}
              </div>
            </>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email do Influencer
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="influencer@email.com"
            />
            {formErrors.email && (
              <p className="mt-1 text-sm text-red-600">{formErrors.email}</p>
            )}
          </div>

          <div>
            <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-1">
              Preço da Assinatura (R$)
            </label>
            <input
              id="price"
              type="number"
              min="1"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Ex: 29.90"
            />
            {formErrors.price && (
              <p className="mt-1 text-sm text-red-600">{formErrors.price}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={!resumeMode && (loadingBots || bots.length === 0)}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {resumeMode ? 'Retomar Onboarding' : 'Iniciar Onboarding'}
          </button>
        </form>
      </div>
    );
  }

  // PROCESSING / ERROR / SUCCESS STATES - Show stepper
  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div className="space-y-3">
        {STEPS.map((step) => {
          const status = getStepStatus(step.key);
          return (
            <div key={step.key} className="flex items-center gap-3">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                  status === 'done'
                    ? 'bg-green-100 text-green-700'
                    : status === 'active'
                      ? 'bg-blue-100 text-blue-700'
                      : status === 'error'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-400'
                }`}
              >
                {status === 'done' ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : status === 'active' ? (
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : status === 'error' ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <span className="h-2 w-2 rounded-full bg-gray-300" />
                )}
              </div>
              <span
                className={`text-sm ${
                  status === 'done'
                    ? 'text-green-700'
                    : status === 'active'
                      ? 'font-medium text-blue-700'
                      : status === 'error'
                        ? 'font-medium text-red-700'
                        : 'text-gray-400'
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Error state */}
      {wizardState === 'error' && error && (
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">{error.message}</p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleRetry}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Tentar Novamente
            </button>
            <button
              onClick={handleStartOver}
              disabled={cleaningUp}
              className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {cleaningUp ? 'Limpando...' : 'Recomeçar do Zero'}
            </button>
          </div>
        </div>
      )}

      {/* Success state */}
      {wizardState === 'success' && result && (
        <div className="rounded-md bg-green-50 p-4 space-y-3">
          <h3 className="text-sm font-medium text-green-800">Onboarding Concluído!</h3>
          <div className="space-y-2 text-sm text-green-700">
            <p>
              <span className="font-medium">Grupo:</span> {result.group.name}
            </p>
            <p>
              <span className="font-medium">Bot:</span> @{result.bot_username}
            </p>
            <p>
              <span className="font-medium">Email:</span> {result.admin_email}
            </p>
            <p>
              <span className="font-medium">Senha temporária:</span> {result.temp_password}
            </p>
            <p>
              <span className="font-medium">Checkout:</span>{' '}
              <a href={result.checkout_url} target="_blank" rel="noopener noreferrer" className="underline">
                {result.checkout_url}
              </a>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={copyCredentials}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              {copied ? 'Copiado!' : 'Copiar Credenciais'}
            </button>
            <a
              href="/groups"
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Ir para Grupos
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
