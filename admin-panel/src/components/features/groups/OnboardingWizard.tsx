'use client';

import { useState, useEffect } from 'react';
import type { OnboardingStep } from '@/types/database';

interface Bot {
  id: string;
  bot_username: string;
  status: string;
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

type WizardState = 'form' | 'processing' | 'success' | 'error';

const STEPS: { key: OnboardingStep; label: string }[] = [
  { key: 'creating', label: 'Criando Grupo' },
  { key: 'validating_bot', label: 'Validando Bot' },
  { key: 'configuring_mp', label: 'Config. Mercado Pago' },
  { key: 'deploying_bot', label: 'Deploy Bot' },
  { key: 'creating_admin', label: 'Criando Admin' },
  { key: 'finalizing', label: 'Concluído' },
];

export function OnboardingWizard() {
  const [wizardState, setWizardState] = useState<WizardState>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [botId, setBotId] = useState('');
  const [bots, setBots] = useState<Bot[]>([]);
  const [loadingBots, setLoadingBots] = useState(true);
  const [currentStep, setCurrentStep] = useState<OnboardingStep | null>(null);
  const [result, setResult] = useState<OnboardingResult | null>(null);
  const [error, setError] = useState<OnboardingError | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

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
    if (!name || name.trim().length < 2) {
      errors.name = 'Nome deve ter pelo menos 2 caracteres';
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Email inválido';
    }
    if (!botId) {
      errors.bot_id = 'Selecione um bot';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateForm()) return;

    setWizardState('processing');
    setCurrentStep('creating');
    setError(null);

    try {
      const response = await fetch('/api/groups/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), bot_id: botId }),
      });

      const data = await response.json();

      if (!data.success) {
        setWizardState('error');
        setError(data.error);
        if (data.error?.step) {
          setCurrentStep(data.error.step);
        }
        return;
      }

      setCurrentStep('finalizing');
      setWizardState('success');
      setResult(data.data);
    } catch {
      setWizardState('error');
      setError({ code: 'NETWORK_ERROR', message: 'Erro de conexão. Tente novamente.' });
    }
  }

  async function handleRetry() {
    if (!error?.step || !error?.group_id) {
      // Reset to form for full retry
      setWizardState('form');
      setError(null);
      return;
    }

    setWizardState('processing');
    setCurrentStep(error.step);
    setError(null);

    try {
      const response = await fetch('/api/groups/onboarding/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: error.group_id, step: error.step }),
      });

      const data = await response.json();

      if (!data.success) {
        setWizardState('error');
        setError(data.error);
        if (data.error?.step) {
          setCurrentStep(data.error.step);
        }
        return;
      }

      setCurrentStep('finalizing');
      setWizardState('success');
      setResult(data.data);
    } catch {
      setWizardState('error');
      setError({ code: 'NETWORK_ERROR', message: 'Erro de conexão. Tente novamente.' });
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

  // FORM STATE
  if (wizardState === 'form') {
    return (
      <form onSubmit={handleSubmit} className="space-y-4">
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

        <button
          type="submit"
          disabled={loadingBots || bots.length === 0}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Iniciar Onboarding
        </button>
      </form>
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
          <button
            onClick={handleRetry}
            className="mt-3 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Tentar Novamente
          </button>
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
