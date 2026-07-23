// Telegram capture CLI (offline-friendly ingestion).
//
//   tsx cli/telegram.ts        poll the bot for new .igc documents
//
// Flow: read pending updates via getUpdates, accept .igc documents sent from
// the allowed chat only, download each into ./igc, then confirm the updates so
// they are not re-processed. The caller (GitHub Action) commits any new files
// in ./igc, which triggers the build. Dedup of flights happens downstream in
// cli/index.ts (by takeoff timestamp), so re-saving the same .igc is safe.
//
// Each newly-saved file is also mirrored to we-fly.cloud (best-effort) if
// WE_FLY_CLOUD is set. A mirror failure is logged but never blocks the local
// capture — the committed igc/ file is the source of truth for this repo.

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const IGC_DIR = path.resolve('igc');

interface TgDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
}
interface TgMessage {
  chat?: { id: number };
  date?: number;
  document?: TgDocument;
}
interface TgUpdate {
  update_id: number;
  message?: TgMessage;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function tgApi<T>(
  token: string,
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!json.ok) {
    throw new Error(`Telegram ${method} failed: ${json.description ?? res.status}`);
  }
  return json.result as T;
}

/** Sanitize an incoming file name into a safe, .igc-suffixed basename. */
function safeIgcName(raw: string | undefined, fallback: string): string {
  const base = path.basename((raw ?? '').trim());
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '');
  const name = cleaned || fallback;
  return /\.igc$/i.test(name) ? name : `${name}.igc`;
}

async function downloadIgc(token: string, doc: TgDocument): Promise<string> {
  const file = await tgApi<{ file_path: string }>(token, 'getFile', {
    file_id: doc.file_id,
  });
  const res = await fetch(
    `https://api.telegram.org/file/bot${token}/${file.file_path}`,
  );
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${doc.file_name}`);
  return await res.text();
}

export interface WeFlyUploadResult {
  hash: string;
  fileName: string;
  isNew: boolean;
}

/** Mirror a flight to we-fly.cloud. Throws on failure; caller decides how to handle. */
export async function uploadToWeFly(apiKey: string, name: string, content: string): Promise<WeFlyUploadResult> {
  const form = new FormData();
  form.append('file', new Blob([content], { type: 'application/octet-stream' }), name);

  const res = await fetch('https://we-fly.cloud/api/v1/flights/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'User-Agent': 'pglogstats-telegram-capture (github.com actions)',
    },
    body: form,
  });

  const json = (await res.json()) as
    | { data: WeFlyUploadResult }
    | { error: string; error_description?: string };

  if (!res.ok || !('data' in json)) {
    const err = json as { error?: string; error_description?: string };
    throw new Error(
      `${res.status} ${err.error ?? 'unknown_error'}${err.error_description ? `: ${err.error_description}` : ''}`,
    );
  }
  return json.data;
}

async function main(): Promise<void> {
  const token = requireEnv('TELEGRAM_BOT_TOKEN');
  const allowedChatId = requireEnv('TELEGRAM_CHAT_ID');
  const weFlyKey = process.env.WE_FLY_CLOUD;
  if (!weFlyKey) {
    console.log('[we-fly] WE_FLY_CLOUD not set; skipping we-fly.cloud mirror.');
  }

  const updates = await tgApi<TgUpdate[]>(token, 'getUpdates', {
    timeout: 0,
    allowed_updates: ['message'],
  });
  updates.sort((a, b) => a.update_id - b.update_id);
  console.log(`[telegram] Fetched ${updates.length} pending update(s).`);

  fs.mkdirSync(IGC_DIR, { recursive: true });

  const saved: string[] = [];
  // Advance the confirmation offset only past updates we fully handled, so a
  // transient download failure retries on the next poll instead of being lost.
  let confirmUpToId: number | null = null;

  for (const update of updates) {
    const msg = update.message;
    // Auth: only accept files from the configured chat. Anything else is
    // acknowledged (confirmed) and ignored.
    const fromAllowed = msg?.chat && String(msg.chat.id) === allowedChatId;
    const doc = msg?.document;
    const isIgc = doc && /\.igc$/i.test(doc.file_name ?? '');

    if (!fromAllowed || !doc || !isIgc) {
      if (msg && !fromAllowed) {
        console.warn(`[telegram] Ignoring message from unauthorized chat ${msg.chat?.id}.`);
      }
      confirmUpToId = update.update_id;
      continue;
    }

    try {
      const name = safeIgcName(doc.file_name, `flight-${msg?.date ?? doc.file_unique_id}`);
      const content = await downloadIgc(token, doc);
      fs.writeFileSync(path.join(IGC_DIR, name), content);
      saved.push(name);
      console.log(`[telegram] Saved igc/${name}`);
      confirmUpToId = update.update_id;

      if (weFlyKey) {
        try {
          const result = await uploadToWeFly(weFlyKey, name, content);
          console.log(
            `[we-fly] ${result.isNew ? 'Uploaded' : 'Already present'}: ${name} (hash=${result.hash})`,
          );
        } catch (err) {
          console.warn(`[we-fly] Mirror failed for ${name}: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      console.error(
        `[telegram] Failed to capture update ${update.update_id}: ${(err as Error).message}. Will retry next poll.`,
      );
      break;
    }
  }

  // Confirm handled updates so they are not returned again.
  if (confirmUpToId != null) {
    await tgApi(token, 'getUpdates', { offset: confirmUpToId + 1, timeout: 0 });
    console.log(`[telegram] Confirmed updates up to ${confirmUpToId}.`);
  }

  if (saved.length > 0) {
    const text = [
      `📥 Received ${saved.length} flight log(s): ${saved.join(', ')}`,
      `⏳ Build queued — the site will update shortly.`,
    ].join('\n');
    await tgApi(token, 'sendMessage', { chat_id: allowedChatId, text });
  }

  console.log(`[telegram] Done. new=${saved.length}.`);
}

// Only run when invoked directly (`tsx cli/telegram.ts`), not when other
// scripts (e.g. the we-fly dry-run) import uploadToWeFly from this module.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Fatal:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
