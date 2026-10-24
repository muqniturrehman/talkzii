// Deterministic secrets for tests (never used outside Vitest).
process.env.INTERNAL_API_SECRET = 'test-internal-secret-0123456789abcdef';
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
process.env.META_APP_ID = '1234567890';
process.env.META_APP_SECRET = 'meta-app-secret-for-tests';
process.env.META_WEBHOOK_VERIFY_TOKEN = 'verify-me';
process.env.LOG_LEVEL = 'silent';
