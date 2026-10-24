import pino from 'pino';

/**
 * Structured JSON logs (Vercel → Log Drains). Secrets are redacted.
 * Pretty-print locally with:  pnpm dev | npx pino-pretty
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base: { app: 'talkzi', env: process.env.VERCEL_ENV ?? process.env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ level: label }) },
  redact: {
    paths: [
      'password',
      '*.password',
      'token',
      '*.token',
      '*.access_token',
      '*.accessToken',
      '*.secret',
      '*.apiKey',
      'headers.authorization',
      'headers.cookie',
      'req.headers.authorization',
      'req.headers.cookie',
    ],
    censor: '[redacted]',
  },
});

export type Logger = pino.Logger;
