#!/usr/bin/env node
/**
 * One-time OAuth setup for the dedicated OrlaDent Camp Google account.
 *
 * 1) Create a Google OAuth "Web application" client.
 * 2) Add http://localhost:53682/callback as an authorised redirect URI.
 * 3) Put GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET in .env.local.
 * 4) Run: npm run setup-drive
 *
 * The script uses the narrow drive.file scope and creates the root folder
 * itself, so the app only manages files/folders it created for OrlaDent Camp.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv(path.resolve('.env.local'));
loadDotEnv(path.resolve('.env'));

const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('Missing GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET in .env.local');
  process.exit(1);
}

const port = 53682;
const redirectUri = `http://localhost:${port}/callback`;
const scope = 'https://www.googleapis.com/auth/drive.file';
const state = randomUUID();

const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
auth.searchParams.set('client_id', clientId);
auth.searchParams.set('redirect_uri', redirectUri);
auth.searchParams.set('response_type', 'code');
auth.searchParams.set('scope', scope);
auth.searchParams.set('access_type', 'offline');
auth.searchParams.set('prompt', 'consent');
auth.searchParams.set('state', state);

async function exchange(code) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    })
  });
  if (!response.ok) throw new Error(`Token exchange failed: ${response.status} ${await response.text()}`);
  return response.json();
}

async function createFolder(accessToken, name, parentId) {
  const response = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {})
    })
  });
  if (!response.ok) throw new Error(`Folder create failed: ${response.status} ${await response.text()}`);
  return response.json();
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', redirectUri);
    if (url.pathname !== '/callback') {
      res.writeHead(404).end('Not found');
      return;
    }
    if (url.searchParams.get('state') !== state) throw new Error('OAuth state mismatch');
    const code = url.searchParams.get('code');
    if (!code) throw new Error(url.searchParams.get('error') || 'No OAuth code returned');

    const token = await exchange(code);
    if (!token.refresh_token) throw new Error('Google did not return a refresh token. Revoke the app grant and run again with consent.');
    const appFolder = await createFolder(token.access_token, 'OrlaDent Camp');
    const submissionsFolder = await createFolder(token.access_token, 'Student Submissions', appFolder.id);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h2>OrlaDent Camp Drive connected.</h2><p>You can close this tab and return to the terminal.</p>');

    console.log('\nDrive connected successfully. Add these to Vercel Environment Variables:\n');
    console.log(`GOOGLE_DRIVE_REFRESH_TOKEN=${token.refresh_token}`);
    console.log(`GOOGLE_DRIVE_SUBMISSIONS_FOLDER_ID=${submissionsFolder.id}`);
    console.log('\nKeep GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET too.');
    console.log('Do NOT commit any of these secrets to GitHub.\n');
    server.close();
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(error instanceof Error ? error.message : String(error));
    console.error(error);
    server.close();
    process.exitCode = 1;
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log('\nOpen this URL in your browser and sign in with the dedicated OrlaDent Camp Google account:\n');
  console.log(auth.toString());
  console.log(`\nWaiting for Google callback on ${redirectUri} ...\n`);
});
