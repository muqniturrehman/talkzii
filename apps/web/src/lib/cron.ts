import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { safeEqual } from '@/lib/crypto';
import { logger, type Logger } from '@/lib/logger';

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. We also accept
 * INTERNAL_API_SECRET for manual triggering. Without any secret configured,
 * cron endpoints only run outside production.
 */
export function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  const header = req.headers.get('authorization') ?? '';
  return safeEqual(header, `Bearer ${secret}`);
}

/** Wraps a cron job with auth, timing and structured logging. */
export function createCronHandler(name: string, job: (ctx: { log: Logger; startedAt: number }) => Promise<Record<string, unknown>>) {
  return async (req: NextRequest) => {
    if (!isAuthorizedCron(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const startedAt = Date.now();
    const log = logger.child({ cron: name });
    try {
      const result = await job({ log, startedAt });
      const durationMs = Date.now() - startedAt;
      log.info({ ...result, durationMs }, `cron ${name} finished`);
      return NextResponse.json({ ok: true, ...result, durationMs });
    } catch (error) {
      log.error({ err: error }, `cron ${name} failed`);
      return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'failed' }, { status: 500 });
    }
  };
}
