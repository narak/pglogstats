// One-shot Google Drive -> repo sync (npm run sync:drive).
//
// Downloads every .igc in GDRIVE_FOLDER_ID into ./igc, skipping files whose
// content is already identical. GitHub (the committed igc/ folder) is the
// source of truth for the build; this is only a manual importer to pull logs
// out of Drive when you want to. Requires read access for the service account:
//   GDRIVE_SERVICE_ACCOUNT  service-account key JSON (Drive read-only is enough)
//   GDRIVE_FOLDER_ID        the Drive folder to pull from
//
// After running, commit the new files in ./igc and push to trigger a build.

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { listDriveSources } from './drive';

dotenv.config();

const IGC_DIR = path.resolve('igc');

/** Sanitize a Drive file name into a safe, .igc-suffixed basename. */
function safeIgcName(raw: string): string {
  const base = path.basename(raw.trim());
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '');
  const name = cleaned || 'flight';
  return /\.igc$/i.test(name) ? name : `${name}.igc`;
}

async function main(): Promise<void> {
  const folderId = process.env.GDRIVE_FOLDER_ID;
  if (!folderId) throw new Error('Missing Drive folder env var. Set GDRIVE_FOLDER_ID.');

  fs.mkdirSync(IGC_DIR, { recursive: true });
  const sources = await listDriveSources(folderId);
  console.log(`Drive returned ${sources.length} .igc file(s).`);

  let wrote = 0;
  let unchanged = 0;
  for (const source of sources) {
    const name = safeIgcName(source.name);
    const dest = path.join(IGC_DIR, name);
    const content = await source.read();
    if (fs.existsSync(dest) && fs.readFileSync(dest, 'utf8') === content) {
      unchanged += 1;
      continue;
    }
    fs.writeFileSync(dest, content);
    wrote += 1;
    console.log(`  wrote igc/${name}`);
  }

  console.log(
    `Done. wrote=${wrote} unchanged=${unchanged} total=${sources.length}. ` +
      `Commit igc/ and push to trigger a build.`,
  );
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
