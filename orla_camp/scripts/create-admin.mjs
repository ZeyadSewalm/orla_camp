#!/usr/bin/env node
/**
 * Creates (or repairs) the default admin account.
 *
 *   npm run create-admin -- admin@orladent.com 'a-strong-password'
 *
 * WHY IT LOOKS LIKE THIS
 * ----------------------
 * There is no login route in this project to fix, and no bcrypt comparison to
 * correct. Authentication is Supabase Auth (GoTrue). Passwords are hashed with
 * bcrypt INSIDE Supabase, in `auth.users.encrypted_password`, in a schema the
 * application is not allowed to read or write. So:
 *
 *   - The app can never hash a password itself and compare it. If it tried,
 *     the hashes would never match, because it cannot see the stored one.
 *   - Inserting a row into `public.profiles` does NOT create an account.
 *     `profiles` is only the descriptive half; the credential half lives in
 *     `auth.users`. A profiles row with no auth user behind it is exactly what
 *     produces "Invalid login credentials" with a password you know is right.
 *
 * The supported way to create an account server-side is the Admin API below,
 * with the service-role key. `email_confirm: true` matters: without it the new
 * user sits unconfirmed and cannot log in.
 *
 * Safe to run more than once. If the user already exists it resets the
 * password and re-confirms the email instead of failing.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// ---- load .env.local / .env without adding a dependency ----
for (const file of ['.env.local', '.env']) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const value = match[2].replace(/^["']|["']$/g, '');
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const email = (process.argv[2] || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.argv[3] || process.env.ADMIN_PASSWORD || '';

function fail(message) {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

if (!url || !serviceKey) {
  fail(
    'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.\n' +
      '    Supabase dashboard → Project Settings → API. Use the service_role key,\n' +
      '    not the anon key — creating users requires it. Never ship it to the browser.'
  );
}
if (!email || !password) {
  fail("Usage: npm run create-admin -- admin@orladent.com 'a-strong-password'");
}
if (password.length < 8) {
  fail('Choose a password of at least 8 characters.');
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

/** Finds an auth user by email, paging through the admin list. */
async function findUser(target) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`Could not list users: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

const existing = await findUser(email);
let userId;

if (existing) {
  console.log(`  · ${email} already exists — resetting password and confirming the email.`);
  const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true
  });
  if (error) fail(`Could not update the user: ${error.message}`);
  userId = data.user.id;
} else {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    // Without this the account is created unconfirmed and every login attempt
    // is rejected — with a message that reads like a wrong password.
    email_confirm: true,
    user_metadata: { full_name: 'OrlaDent Admin', region: 'egypt' }
  });
  if (error) fail(`Could not create the user: ${error.message}`);
  userId = data.user.id;
  console.log(`  · Created auth user ${email}`);
}

// The on_auth_user_created trigger writes the profiles row. Upsert anyway so
// this also repairs accounts created before the trigger existed.
const { error: profileError } = await supabase
  .from('profiles')
  .upsert(
    { id: userId, email, full_name: 'OrlaDent Admin', role: 'admin', has_access: true },
    { onConflict: 'id' }
  );

if (profileError) fail(`Auth user is fine, but the profile failed: ${profileError.message}`);

console.log(`
  ✓ Admin ready.

    email: ${email}
    role:  admin (full access)

    Log in at /login — Arabic — or /en/login.
    Change this password after the first login.
`);
