import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();
const source = fs.readFileSync(new URL('../src/app/actions/loginOtp.js', import.meta.url), 'utf8');
const compiled = await swc.transform(source, {
  filename: 'loginOtp.js',
  jsc: { parser: { syntax: 'ecmascript' } },
  module: { type: 'commonjs' },
});

function setup(options = {}) {
  const calls = { filters: [], links: [], mail: [], authUsers: [] };
  const user = { user_id: 'employee-id', email: 'auth@example.com', emp_official_mail_id: 'employee@example.com', emp_name: 'Employee', role: 'employee', is_approved: true, ...options.user };
  const query = {
    select() { return this; },
    or(filter) { calls.filters.push(filter); return this; },
    async maybeSingle() {
      if (options.queryThrows) throw new Error('Network unavailable');
      return { data: options.missing ? null : user, error: options.queryError || null };
    },
  };
  const client = {
    from(table) { assert.equal(table, 'user_roles'); return query; },
    auth: { admin: {
      async getUserById(id) {
        calls.authUsers.push(id);
        return { data: { user: options.authMissing ? null : { id, email: 'auth@example.com' } }, error: null };
      },
      async generateLink(params) {
        calls.links.push(params);
        return {
          data: { user: { id: options.wrongIdentity ? 'different-user' : user.user_id }, properties: {
            email_otp: options.otp ?? '012345', hashed_token: 'must-stay-secret', action_link: 'must-stay-secret',
          } },
          error: options.linkError || null,
        };
      },
    } },
  };
  const loaded = { exports: {} };
  vm.runInNewContext(compiled.code, {
    module: loaded, exports: loaded.exports,
    require(name) {
      if (name === '@/utils/supabase/adminClient') return { getAdminClient: () => client };
      if (name === './adminMessageConfig') return { sendAdminAccountEmailOtp: async (...args) => {
        calls.mail.push(args);
        if (options.mailThrows) throw new Error('SMTP credentials must not leak');
        return { success: !options.mailFails };
      } };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { request: loaded.exports.requestEmailLoginOtp, calls };
}

test('official alias receives provider-issued OTP; canonical Auth email verifies it; tokens stay server-side', async () => {
  const { request, calls } = setup({ user: { emp_official_mail_id: 'official@example.com' } });
  const result = await request('  OFFICIAL@example.com  ');
  assert.equal(result.success, true);
  assert.equal(result.verificationEmail, 'auth@example.com');
  assert.equal(result.otpLength, 6);
  assert.equal(calls.mail[0][0], 'official@example.com');
  assert.equal(calls.mail[0][1], '012345');
  assert.equal(calls.mail[0][2], 'login_otp');
  assert.equal(calls.links[0].email, 'auth@example.com');
  assert.equal(calls.links[0].type, 'magiclink');
  assert.equal(JSON.stringify(result).includes('012345'), false);
  assert.equal(JSON.stringify(result).includes('must-stay-secret'), false);
});

test('fresh server instances can issue login codes without any process-local OTP state', async () => {
  for (let index = 0; index < 2; index++) {
    const { request, calls } = setup({ otp: '12345678' });
    const result = await request('employee@example.com');
    assert.equal(result.success, true);
    assert.equal(result.otpLength, 8);
    assert.equal(calls.mail[0][1], '12345678');
  }
});

test('invalid addresses do not perform account lookups or send emails', async () => {
  for (const email of [null, {}, '', 'a', 'a@', 'a @example.com']) {
    const { request, calls } = setup();
    assert.equal((await request(email)).success, false);
    assert.equal(calls.filters.length, 0);
    assert.equal(calls.mail.length, 0);
  }
});

test('email lookup escapes wildcards and PostgREST filter delimiters', async () => {
  const { request, calls } = setup();
  await request('a_b%test,other@example.com');
  assert.equal(calls.filters[0], 'email.ilike."a\\\\_b\\\\%test,other@example.com",emp_official_mail_id.ilike."a\\\\_b\\\\%test,other@example.com"');
  assert.equal(calls.mail.length, 0);
  assert.equal(calls.links.length, 0);
});

test('missing, ambiguous, unapproved or unlinked users cannot receive login tokens', async () => {
  for (const options of [{ missing: true }, { queryError: {} }, { user: { is_approved: false } }, { authMissing: true }]) {
    const { request, calls } = setup(options);
    assert.equal((await request('employee@example.com')).success, false);
    assert.equal(calls.links.length, 0);
    assert.equal(calls.mail.length, 0);
  }
});

test('existing admin approval exemption remains compatible', async () => {
  for (const role of ['admin', 'Admin']) {
    const { request } = setup({ user: { is_approved: false, role } });
    assert.equal((await request('employee@example.com')).success, true);
  }
});

test('provider errors, wrong identities and malformed codes never send an email', async () => {
  for (const options of [{ linkError: {} }, { wrongIdentity: true }, { otp: '1234' }, { otp: 'abcdef' }]) {
    const { request, calls } = setup(options);
    assert.equal((await request('employee@example.com')).success, false);
    assert.equal(calls.mail.length, 0);
  }
});

test('email failures and thrown network errors are recoverable and do not expose internals', async () => {
  for (const options of [{ mailFails: true }, { mailThrows: true }, { queryThrows: true }]) {
    const { request } = setup(options);
    const result = await request('employee@example.com');
    assert.equal(result.success, false);
    assert.equal(result.verificationEmail, undefined);
    assert.equal(JSON.stringify(result).includes('credentials'), false);
  }
});

// Exercise the actual login component's handlers with isolated hooks and mocked
// transport. No live employee accounts, credentials or email delivery are used.
const pageSource = fs.readFileSync(new URL('../src/app/login/page.js', import.meta.url), 'utf8');
const pageCompiled = await swc.transform(pageSource, {
  filename: 'page.js',
  jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } },
  module: { type: 'commonjs' },
});

function setupPage({ request, verify } = {}) {
  const slots = [];
  let cursor = 0;
  let now = 0;
  let tree;
  const calls = { request: [], verify: [] };
  const location = { href: '', search: '' };
  const element = (type, props) => ({ type, props });
  const react = {
    Suspense: 'suspense', useEffect() {},
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
  };
  const loaded = { exports: {} };
  vm.runInNewContext(pageCompiled.code, {
    module: loaded, exports: loaded.exports,
    Date: { now: () => now }, URLSearchParams, window: { location },
    console: { warn() {} },
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx: element, jsxs: element, Fragment: 'fragment' };
      if (name === 'next/navigation') return { useRouter: () => ({}), useSearchParams: () => null };
      if (name === '@/utils/supabase/client') return { createClient: () => ({ auth: { verifyOtp: async params => {
        calls.verify.push(params);
        return verify ? verify(params) : { data: { user: { id: 'employee-id' }, session: { access_token: 'test-session' } }, error: null };
      } } }) };
      if (name === '@/app/actions/loginOtp') return { requestEmailLoginOtp: async email => {
        calls.request.push(email);
        return request ? request(email) : { success: true, verificationEmail: 'auth@example.com', otpLength: 6, message: 'Code sent' };
      } };
      if (name === '@/app/actions/team' || name === '@/components/PremiumProgressLoader') return {};
      if (name === './login.module.css') return { default: {} };
      if (name === '../../../package.json') return { version: 'test' };
      if (name === 'lucide-react') return new Proxy({}, { get: () => 'icon' });
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  function render() {
    cursor = 0;
    tree = loaded.exports.default().props.children.type();
    return tree;
  }
  function nodes(node) {
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (!node || typeof node !== 'object') return [];
    return [node, ...nodes(node.props?.children ?? null)];
  }
  function text(node) {
    if (Array.isArray(node)) return node.map(text).join('');
    if (node && typeof node === 'object') return text(node.props?.children);
    return node == null || typeof node === 'boolean' ? '' : String(node);
  }
  const button = label => nodes(tree).find(node => node.type === 'button' && text(node).trim() === label);
  const input = placeholder => nodes(tree).find(node => node.type === 'input' && node.props.placeholder === placeholder);
  function enterEmail() {
    button('Email OTP').props.onClick(); render();
    input('e.g. employee@company.com').props.onChange({ target: { value: ' Employee@example.com ' } }); render();
  }
  async function send() {
    await button('Send Login OTP').props.onClick(); render();
  }
  render();
  return { calls, location, render, nodes, text: () => text(tree), button, input, enterEmail, send, advance: () => { now += 61_000; } };
}

test('login UI verifies with canonical email and native OTP, then redirects with a session', async () => {
  const page = setupPage();
  page.enterEmail(); await page.send();
  page.input('Enter 6-digit OTP').props.onPaste({ preventDefault() {}, clipboardData: { getData: () => '012 345' } });
  page.render();
  assert.equal(page.input('Enter 6-digit OTP').props.value, '012345');
  await page.button('Verify & Sign In').props.onClick();
  assert.equal(page.calls.verify[0].email, 'auth@example.com');
  assert.equal(page.calls.verify[0].token, '012345');
  assert.equal(page.calls.verify[0].type, 'email');
  assert.equal(page.location.href, '/dashboard');
});

test('duplicate sends and resends are blocked; resend clears previously entered code', async () => {
  let complete;
  const page = setupPage({ request: () => new Promise(resolve => { complete = resolve; }) });
  page.enterEmail();
  const send = page.button('Send Login OTP').props.onClick;
  const pending = send();
  await send();
  assert.equal(page.calls.request.length, 1);
  page.render();
  assert.equal(page.button('Sign in with Password instead').props.disabled, true);
  complete({ success: true, verificationEmail: 'auth@example.com', otpLength: 6 });
  await pending; page.render();
  await page.button('Resend in 60s').props.onClick();
  assert.equal(page.calls.request.length, 1);
  page.input('Enter 6-digit OTP').props.onChange({ target: { value: '111111' } }); page.render();
  page.advance();
  const resend = page.button('Resend in 60s').props.onClick(); page.render();
  assert.equal(page.input('Enter 6-digit OTP').props.value, '');
  assert.equal(page.button('Verifying Code...').props.disabled, true);
  complete({ success: true, verificationEmail: 'auth@example.com', otpLength: 6 });
  await resend;
});

test('invalid, expired or incomplete session responses do not redirect and allow retry', async () => {
  for (const response of [{ error: { code: 'otp_expired' } }, { data: { user: { id: 'employee-id' } } }]) {
    const page = setupPage({ verify: () => response });
    page.enterEmail(); await page.send();
    page.input('Enter 6-digit OTP').props.onChange({ target: { value: '123456' } }); page.render();
    await page.button('Verify & Sign In').props.onClick(); page.render();
    assert.equal(page.location.href, '');
    assert.equal(page.button('Verify & Sign In').props.disabled, false);
    assert.match(page.text(), response.error ? /invalid or expired/ : /Authentication failed/);
  }
});

test('request and verification network failures release loading state', async () => {
  const failedSend = setupPage({ request: () => { throw new Error('offline'); } });
  failedSend.enterEmail(); await failedSend.send();
  assert.match(failedSend.text(), /Could not send the login code/);
  assert.equal(failedSend.button('Sign in with Password instead').props.disabled, false);
  const failedVerify = setupPage({ verify: () => { throw new Error('offline'); } });
  failedVerify.enterEmail(); await failedVerify.send();
  failedVerify.input('Enter 6-digit OTP').props.onChange({ target: { value: '123456' } }); failedVerify.render();
  await failedVerify.button('Verify & Sign In').props.onClick(); failedVerify.render();
  assert.equal(failedVerify.button('Verify & Sign In').props.disabled, false);
  assert.equal(failedVerify.location.href, '');
});
