#!/usr/bin/env node

import crypto from 'node:crypto';
import readline from 'node:readline';

const ITERATIONS = 100000;
const KEY_LENGTH_BYTES = 32; 
const MAX_PASSWORD_LENGTH = 256;

const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,64}$/;

function hashPassword(password, saltBuffer) {
  return crypto.pbkdf2Sync(password, saltBuffer, ITERATIONS, KEY_LENGTH_BYTES, 'sha256');
}

function prompt(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const [, , argUsername, argPassword, argTier, argRole] = process.argv;

  const rawUsername = argUsername || (await prompt('Username: '));
  const password = argPassword || (await prompt('Password: '));
  const tier = argTier || 'premium';
  const role = argRole || 'user';

  
  
  
  const username = String(rawUsername || '').trim().toLowerCase();

  if (!USERNAME_PATTERN.test(username)) {
    console.error('Username must be 3-64 characters: letters, digits, underscore, dot, or hyphen only.');
    process.exitCode = 1;
    return;
  }
  if (!password || password.length > MAX_PASSWORD_LENGTH) {
    console.error(`Password is required and must be at most ${MAX_PASSWORD_LENGTH} characters.`);
    process.exitCode = 1;
    return;
  }
  if (tier !== 'free' && tier !== 'premium') {
    console.error('tier must be "free" or "premium".');
    process.exitCode = 1;
    return;
  }
  if (role !== 'user' && role !== 'admin') {
    console.error('role must be "user" or "admin".');
    process.exitCode = 1;
    return;
  }

  const salt = crypto.randomBytes(16);
  const hash = hashPassword(password, salt);

  const record = {
    username,
    passwordHash: {
      algorithm: 'PBKDF2-SHA256',
      iterations: ITERATIONS,
      salt: salt.toString('base64'),
      hash: hash.toString('base64')
    },
    tier,
    role,
    status: 'active',
    telegramId: null,
    createdAt: new Date().toISOString()
  };

  const kvKey = 'user:' + username;
  const kvValue = JSON.stringify(record);

  console.log('\n── fpspatch-users record ─────────────────────────────────');
  console.log(JSON.stringify(record, null, 2));
  console.log('\n── Run this to write it to the live namespace ────────────');
  console.log(`wrangler kv key put --binding=USERS_KV "${kvKey}" '${kvValue}' --remote`);
  console.log('\n(Drop --remote to write to local dev storage instead, for use with `wrangler dev`.)\n');
}

main();
