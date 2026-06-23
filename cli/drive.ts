// Google Drive integration (requirements §3.1). Service-account auth, recursive
// .igc listing, streamed download. Ported from the original igccli analyzer.

import { google } from 'googleapis';

export interface IgcSource {
  /** Stable identifier for logging. */
  name: string;
  /** Lazily read the file contents. */
  read(): Promise<string>;
}

function getDriveClient() {
  const raw =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? process.env.GDRIVE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error(
      'Missing service account JSON env var. Set GOOGLE_SERVICE_ACCOUNT_JSON or GDRIVE_SERVICE_ACCOUNT.',
    );
  }
  const credentials = JSON.parse(raw);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return google.drive({ version: 'v3', auth });
}

type DriveClient = ReturnType<typeof getDriveClient>;

async function listIgc(
  drive: DriveClient,
  folderId: string,
  acc: { id: string; name: string }[] = [],
): Promise<{ id: string; name: string }[]> {
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken,files(id,name,mimeType)',
      pageSize: 1000,
      pageToken,
    });
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
  return acc;
}

export async function listDriveSources(folderId: string): Promise<IgcSource[]> {
  const drive = getDriveClient();
  const files = await listIgc(drive, folderId);
  return files.map((f) => ({
    name: f.name,
    read: async () => {
      const res = await drive.files.get(
        { fileId: f.id, alt: 'media' },
        { responseType: 'text' },
      );
      return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    },
  }));
}
