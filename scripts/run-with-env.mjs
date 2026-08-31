import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';

const [, , envFileArgument, commandArgument, ...commandArguments] = process.argv;

if (!envFileArgument || !commandArgument) {
  console.error('Usage: node scripts/run-with-env.mjs <env-file> <node-script> [...args]');
  process.exit(1);
}

const envFile = resolve(envFileArgument);
const command = resolve(commandArgument);

if (!existsSync(envFile)) {
  console.error(`Missing staging environment file: ${envFile}`);
  console.error('Copy the matching .env.staging.example file and fill in staging-only values.');
  process.exit(1);
}

if (!existsSync(command)) {
  console.error(`Command script not found: ${command}`);
  process.exit(1);
}

const stagingEnvironment = dotenv.parse(readFileSync(envFile));
const child = spawn(process.execPath, [command, ...commandArguments], {
  cwd: process.cwd(),
  env: { ...process.env, ...stagingEnvironment },
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
