// Dry run for the we-fly.cloud mirror: uploads one local .igc via the same
// uploadToWeFly() used by cli/telegram.ts, without touching Telegram or git.
//
//   npm run wefly:dry-run -- igc/<file>.igc

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { uploadToWeFly } from './telegram';

dotenv.config();

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: npm run wefly:dry-run -- <path-to-igc>');
    process.exit(1);
  }

  const apiKey = process.env.WE_FLY_CLOUD;
  if (!apiKey) throw new Error('Missing required env var: WE_FLY_CLOUD');

  const name = path.basename(filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  console.log(`[we-fly] Uploading ${name} (${content.length} bytes)...`);

  const result = await uploadToWeFly(apiKey, name, content);
  console.log(`[we-fly] ${result.isNew ? 'Uploaded' : 'Already present'}: ${result.fileName} (hash=${result.hash})`);
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
