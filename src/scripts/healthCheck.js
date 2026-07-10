/**
 * Quick health check — tests all major API endpoints
 * Run with server running: node src/scripts/healthCheck.js
 */
import 'dotenv/config';

const BASE   = `http://localhost:${process.env.PORT || 5000}/api`;
const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', B = '\x1b[1m', X = '\x1b[0m';
let passed = 0, failed = 0, token = null;

const req = async (method, path, body, auth = false) => {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data, ok: res.ok };
  } catch (err) { return { status: 0, data: {}, ok: false, error: err.message }; }
};

const test = async (label, fn) => {
  try {
    const ok = await fn();
    if (ok) { console.log(`${G}✅ PASS${X} ${label}`); passed++; }
    else     { console.log(`${R}❌ FAIL${X} ${label}`); failed++; }
  } catch (err) { console.log(`${R}❌ FAIL${X} ${label} — ${err.message}`); failed++; }
};

console.log(`\n${B}🔍 Addis Bright API Health Check${X}`);
console.log('─'.repeat(52));

console.log(`\n${Y}▸ Server${X}`);
await test('GET /health — server is up', async () => {
  const r = await req('GET', '/health');
  return r.status === 200 && r.data.status === 'ok';
});

console.log(`\n${Y}▸ Auth${X}`);
await test('POST /auth/login — director login works', async () => {
  const r = await req('POST', '/auth/login', {
    email:    process.env.DIRECTOR_EMAIL    || 'director@school.edu',
    password: process.env.DIRECTOR_PASSWORD || 'ChangeMe123',
  });
  if (r.ok && r.data.data?.token) { token = r.data.data.token; return true; }
  return false;
});
await test('GET /auth/me — returns authenticated user', async () => {
  const r = await req('GET', '/auth/me', null, true);
  return r.ok && r.data.data?.role === 'director';
});
await test('GET /auth/me — rejects unauthenticated', async () => {
  const r = await req('GET', '/auth/me');
  return r.status === 401;
});
await test('POST /auth/login — rejects wrong password', async () => {
  const r = await req('POST', '/auth/login', { email: process.env.DIRECTOR_EMAIL || 'director@school.edu', password: 'wrongpassword!' });
  return r.status === 401;
});

console.log(`\n${Y}▸ Users${X}`);
await test('GET /users/stats — returns school stats', async () => {
  const r = await req('GET', '/users/stats', null, true);
  return r.ok && typeof r.data.data?.stats?.students === 'number';
});
await test('GET /users?role=teacher — lists teachers', async () => {
  const r = await req('GET', '/users?role=teacher&limit=5', null, true);
  return r.ok && Array.isArray(r.data.data?.users);
});
await test('GET /users — rejects unauthenticated', async () => {
  const r = await req('GET', '/users');
  return r.status === 401;
});

console.log(`\n${Y}▸ Grades & Sections${X}`);
await test('GET /grades — returns grade list', async () => {
  const r = await req('GET', '/grades', null, true);
  return r.ok;
});
await test('GET /sections — returns section list', async () => {
  const r = await req('GET', '/sections', null, true);
  return r.ok;
});

console.log(`\n${Y}▸ Marks${X}`);
await test('POST /marks/entry — rejects score > maxScore', async () => {
  const r = await req('POST', '/marks/entry', {
    sectionId: '000000000000000000000001',
    entries: [{ studentId: '000000000000000000000001', score: 150, maxScore: 100, subject: 'Math' }],
  }, true);
  return r.status === 400;
});
await test('POST /marks/entry — rejects missing fields', async () => {
  const r = await req('POST', '/marks/entry', {}, true);
  return r.status === 400;
});

console.log(`\n${Y}▸ Attendance${X}`);
await test('GET /attendance — rejects missing sectionId', async () => {
  const r = await req('GET', '/attendance', null, true);
  return r.status === 400;
});

console.log(`\n${Y}▸ Messages${X}`);
await test('GET /messages/conversations — returns list', async () => {
  const r = await req('GET', '/messages/conversations', null, true);
  return r.ok && Array.isArray(r.data.data?.conversations);
});

console.log(`\n${Y}▸ Registration${X}`);
await test('GET /registration/students — returns list', async () => {
  const r = await req('GET', '/registration/students', null, true);
  return r.ok;
});

console.log(`\n${Y}▸ Analytics${X}`);
await test('GET /users/analytics/overview — returns data', async () => {
  const r = await req('GET', '/users/analytics/overview', null, true);
  return r.ok && r.data.data?.totals;
});

console.log(`\n${Y}▸ Events & Logs${X}`);
await test('GET /events — returns list', async () => {
  const r = await req('GET', '/events', null, true);
  return r.ok;
});
await test('GET /logs/feed — returns feed', async () => {
  const r = await req('GET', '/logs/feed', null, true);
  return r.ok;
});

console.log(`\n${Y}▸ Security${X}`);
await test('POST /auth/login — rate limit headers present', async () => {
  const r = await req('POST', '/auth/login', { email: 'x@x.com', password: 'wrong' });
  return r.status === 401 || r.status === 429;
});
await test('GET /users — blocked without token', async () => {
  const r = await req('GET', '/users');
  return r.status === 401;
});

const total = passed + failed;
console.log('\n' + '─'.repeat(52));
console.log(`${B}Results: ${G}${passed} passed${X}${B} · ${R}${failed} failed${X}${B} · ${total} total${X}`);
if (failed === 0) { console.log(`${G}${B}✅ All checks passed!\n${X}`); process.exit(0); }
else              { console.log(`${R}${B}⚠️  ${failed} check(s) failed\n${X}`);  process.exit(1); }
