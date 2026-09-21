// Test environment: fake credentials, no network access required for unit tests.
process.env.NODE_ENV = "test";
process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY ??= "anon-key-for-tests-000000000000";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-key-for-tests-000000000";
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.TRACKING_SECRET ??= "tracking-secret-for-tests-000000";
process.env.IP_HASH_SALT ??= "ip-hash-salt-for-tests";
process.env.PUBLIC_URL ??= "https://sentledger.test";
process.env.WORKER_ENABLED = "false";
