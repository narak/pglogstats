// Google Drive integration (requirements §3.1). Service-account auth, recursive
// .igc listing, streamed download. Ported from the original igccli analyzer.

import { google } from 'googleapis';

export interface IgcSource {
  /** Stable identifier for logging. */
  name: string;
  /** Lazily read the file contents. */
  read(): Promise<string>;
}

function maskEmail(value: string | undefined): string {
  if (!value || !value.includes('@')) return 'unknown';
  const [name, domain] = value.split('@');
  if (!name || !domain) return 'unknown';
  const visible = name.slice(0, 3);
  return `${visible}${'*'.repeat(Math.max(0, name.length - 3))}@${domain}`;
}

function formatDriveError(err: unknown): string {
  if (!(err instanceof Error)) return 'non-Error rejection';
  const e = err as Error & {
    code?: string;
    status?: number;
    response?: { status?: number };
    config?: { url?: string; method?: string };
  };
  const status = e.status ?? e.response?.status;
  const code = e.code ?? 'n/a';
  const method = e.config?.method?.toUpperCase() ?? 'n/a';
  const url = e.config?.url ?? 'n/a';
  return `message="${e.message}" code=${code} status=${status ?? 'n/a'} method=${method} url=${url}`;
}

function getDriveClient() {
  const raw = process.env.GDRIVE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error(
      'Missing service account JSON env var. Set GDRIVE_SERVICE_ACCOUNT.',
    );
  }
  const credentials = JSON.parse(raw) as Record<string, unknown>;
  // Force the current Google OAuth token endpoint in CI. Some older keys still
  // carry oauth2/v4/token, which has shown flaky stream-closure behavior.
  credentials.token_uri = 'https://oauth2.googleapis.com/token';
  console.log(
    `[drive] Initializing auth (project_id=${String(credentials.project_id ?? 'unknown')}, client_email=${maskEmail(typeof credentials.client_email === 'string' ? credentials.client_email : undefined)})`,
  );
  console.log(`[drive] Using token_uri=${String(credentials.token_uri)}`);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  console.log('[drive] Drive client created with readonly scope');
  return google.drive({ version: 'v3', auth });
}

type DriveClient = ReturnType<typeof getDriveClient>;

function isRetryableGoogleError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return (
    message.includes('premature close') ||
    message.includes('econnreset') ||
    message.includes('socket hang up') ||
    message.includes('etimedout') ||
    message.includes('503') ||
    message.includes('502') ||
    message.includes('429')
  );
}

async function retryGoogleCall<T>(
  label: string,
  fn: () => Promise<T>,
  maxAttempts = 4,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const startedAt = Date.now();
    try {
      const result = await fn();
      if (attempt > 1) {
        console.log(
          `[drive] Call "${label}" succeeded on attempt ${attempt}/${maxAttempts} (${Date.now() - startedAt}ms)`,
        );
      }
      return result;
    } catch (err) {
      lastErr = err;
      const retryable = isRetryableGoogleError(err);
      const durationMs = Date.now() - startedAt;
      console.warn(
        `[drive] Call "${label}" failed on attempt ${attempt}/${maxAttempts} after ${durationMs}ms (${retryable ? 'retryable' : 'non-retryable'}): ${formatDriveError(err)}`,
      );
      if (!isRetryableGoogleError(err) || attempt >= maxAttempts) {
        throw err;
      }
      const backoffMs = 500 * 2 ** (attempt - 1);
      console.warn(
        `[drive] Retrying "${label}" in ${backoffMs}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  throw lastErr;
}

async function listIgc(
  drive: DriveClient,
  folderId: string,
  acc: { id: string; name: string }[] = [],
): Promise<{ id: string; name: string }[]> {
  let pageToken: string | undefined;
  let pages = 0;
  do {
    pages += 1;
    console.log(
      `[drive] Listing folder ${folderId} page=${pages} token=${pageToken ?? 'none'}`,
    );
    const res = await retryGoogleCall(`files.list folder=${folderId}`, () =>
      drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken,files(id,name,mimeType)',
        pageSize: 1000,
        pageToken,
      }),
    );
    for (const item of res.data.files ?? []) {
      if (!item.id || !item.name) continue;
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        await listIgc(drive, item.id, acc);
      } else if (item.name.toLowerCase().endsWith('.igc')) {
        acc.push({ id: item.id, name: item.name });
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  console.log(`[drive] Folder ${folderId} listing complete: ${acc.length} .igc files`);
  return acc;
}

export async function listDriveSources(folderId: string): Promise<IgcSource[]> {
  const drive = getDriveClient();
  console.log(`[drive] Starting recursive .igc discovery in folder ${folderId}`);
  const files = await listIgc(drive, folderId);
  console.log(`[drive] Prepared ${files.length} Drive source(s) for ingestion`);
  return files.map((f) => ({
    name: f.name,
    read: async () => {
      const res = await retryGoogleCall(`files.get file=${f.id}`, () =>
        drive.files.get(
          { fileId: f.id, alt: 'media' },
          { responseType: 'text' },
        ),
      );
      return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    },
  }));
}
