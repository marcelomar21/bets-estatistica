'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        console.error('[login] Supabase auth error:', authError.message, authError.status);

        const errorMessages: Record<string, string> = {
          'Invalid login credentials': 'Email ou senha inválidos.',
          'Email not confirmed': 'Email ainda não confirmado. Verifique sua caixa de entrada.',
          'Too many requests': 'Muitas tentativas. Aguarde alguns minutos.',
        };

        setError(
          errorMessages[authError.message]
            || `Erro de autenticação: ${authError.message}`
        );
        setLoading(false);
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      console.error('[login] Unexpected error:', err);
      setError('Erro de conexão. Verifique sua internet e tente novamente.');
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`,
      });

      if (resetError) {
        console.error('[reset] Supabase error:', resetError.message);
        setError(`Erro ao enviar email: ${resetError.message}`);
        setLoading(false);
        return;
      }

      setSuccess('Email de recuperação enviado! Verifique sua caixa de entrada.');
      setLoading(false);
    } catch (err) {
      console.error('[reset] Unexpected error:', err);
      setError('Erro de conexão. Tente novamente.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">
          Admin Panel
        </h1>
        <p className="text-sm text-center text-gray-500 mb-8">
          {mode === 'login' ? 'Faça login para continuar' : 'Recuperar senha'}
        </p>

        <form onSubmit={mode === 'login' ? handleLogin : handleResetPassword} className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md">
              {success}
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-3 pr-10 py-2 text-gray-900 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
              placeholder="admin@example.com"
            />
          </div>

          {mode === 'login' && (
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Senha
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-3 pr-10 py-2 text-gray-900 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
                placeholder="••••••••"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading
              ? (mode === 'login' ? 'Entrando...' : 'Enviando...')
              : (mode === 'login' ? 'Entrar' : 'Enviar email de recuperação')
            }
          </button>
        </form>

        <div className="mt-4 text-center">
          {mode === 'login' ? (
            <button
              type="button"
              onClick={() => { setMode('reset'); setError(''); setSuccess(''); }}
              className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
            >
              Esqueci minha senha
            </button>
          ) : (
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
              className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
            >
              Voltar ao login
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
