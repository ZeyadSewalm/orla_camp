#!/usr/bin/env node
/**
 * Tells you WHY a login is failing, instead of leaving you with
 * "Invalid login credentials".
 *
 *   npm run check-auth -- someone@example.com
 *
 * It checks, in order:
 *   1. the environment variables the app runs on
 *   2. whether an auth user with that email exists at all
 *   3. whether its email is confirmed (unconfirmed users cannot log in)
 *   4. whether it has a matching profiles row and what role it carries
 *   5. orphans in both directions (auth user with no profile, profile with
 *      no auth user — the second one is a login that can never work)
 */
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

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
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = (process.argv[2] || '').trim().toLowerCase();

console.log('\n  Environment');
console.log(`   NEXT_PUBLIC_SUPABASE_URL       ${url ?? '— MISSING'}`);
console.log(`   NEXT_PUBLIC_SUPABASE_ANON_KEY  ${anon ? `set (${anon.length} chars)` : '— MISSING'}`);
console.log(`   SUPABASE_SERVICE_ROLE_KEY      ${serviceKey ? `set (${serviceKey.length} chars)` : '— MISSING'}`);

if (!url || !serviceKey) {
  console.error('\n  ✗ Cannot continue without the URL and the service-role key.\n');
  process.exit(1);
}

// A very common and very confusing mistake: the anon key belongs to a
// different project than the URL, so every login is checked against an empty
// user table. Both keys carry the project ref in their JWT payload.
const ref = url.match(/https:\/\/([^.]+)\./)?.[1];
for (const [name, key] of [['anon', anon], ['service_role', serviceKey]]) {
  if (!key) continue;
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString('utf8'));
    if (payload.ref && ref && payload.ref !== ref) {
      console.log(`\n  ✗ The ${name} key belongs to project "${payload.ref}" but the URL points at "${ref}".`);
      console.log('    Copy both from the SAME project: Settings → API.');
    }
  } catch {
    console.log(`\n  ✗ The ${name} key is not a readable JWT — it was probably truncated when pasted.`);
  }
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const { data: list, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
if (error) {
  console.error(`\n  ✗ Could not reach Supabase: ${error.message}\n`);
  process.exit(1);
}

console.log(`\n  Auth users: ${list.users.length}`);

const { data: profiles } = await supabase.from('profiles').select('id,email,role,has_access');
console.log(`  Profile rows: ${profiles?.length ?? 0}`);

const authIds = new Set(list.users.map((u) => u.id));
const orphanProfiles = (profiles ?? []).filter((p) => !authIds.has(p.id));
if (orphanProfiles.length) {
  console.log(`\n  ✗ ${orphanProfiles.length} profile row(s) have no auth user behind them:`);
  orphanProfiles.forEach((p) => console.log(`      ${p.email}`));
  console.log('    These can never log in — a profile is not an account.');
  console.log("    Fix: npm run create-admin -- <email> '<password>'");
}

if (email) {
  const user = list.users.find((u) => u.email?.toLowerCase() === email);
  console.log(`\n  Checking ${email}`);
  if (!user) {
    console.log('   ✗ No auth user with this email. That is your "Invalid login credentials".');
    const near = list.users.map((u) => u.email).filter((e) => e && e.toLowerCase().includes(email.split('@')[0]));
    if (near.length) console.log(`     Close matches that DO exist: ${near.join(', ')}`);
    console.log("     Fix: npm run create-admin -- <email> '<password>'");
  } else {
    console.log(`   · id            ${user.id}`);
    console.log(`   · confirmed     ${user.email_confirmed_at ? 'yes' : 'NO — this blocks login'}`);
    console.log(`   · last sign-in  ${user.last_sign_in_at ?? 'never'}`);
    const profile = (profiles ?? []).find((p) => p.id === user.id);
    console.log(`   · profile       ${profile ? `role=${profile.role} has_access=${profile.has_access}` : 'MISSING'}`);
    if (!user.email_confirmed_at || !profile) {
      console.log("     Fix both: npm run create-admin -- <email> '<password>'");
    }
  }
}

console.log('');
