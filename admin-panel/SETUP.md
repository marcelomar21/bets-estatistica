# Admin Panel - Setup Guide

## Variáveis de Ambiente

Copie o arquivo `.env.example` para `.env.local` e preencha as variáveis:

```bash
cp .env.example .env.local
```

Consulte o `.env.example` para ver as variáveis necessárias (`NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

## Configuração do Supabase Dashboard

Para atender ao requisito NFR-S4 (expiração de sessão em 24 horas):

1. Acesse **Supabase Dashboard > Authentication > Settings**
2. Na seção **Sessions**, configure o JWT expiry para `86400` segundos (24 horas)
3. Ative **Refresh Token Rotation** para maior segurança
