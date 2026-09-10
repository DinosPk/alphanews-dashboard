// Εγγραφή στο Google Sheets μέσω service account.
//
// Χρησιμοποιούμε απευθείας το REST API (sheets.googleapis.com/v4) με JWT από
// το google-auth-library — δεν χρειάζεται το βαρύ πακέτο `googleapis`.
//
// Προϋπόθεση: το Sheet πρέπει να είναι μοιρασμένο (Editor) στο client_email
// του service account, και να είναι ενεργοποιημένο το Google Sheets API.

import { JWT } from "google-auth-library";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

/**
 * Τα credentials του service account. Δέχεται είτε ολόκληρο το JSON σε μία
 * μεταβλητή, είτε email + private key ξεχωριστά. Αν δεν υπάρχουν δικά του,
 * πέφτει πίσω στο service account του GA4 (μπορεί να είναι το ίδιο).
 */
function serviceAccount(): ServiceAccount {
  const json =
    process.env.GOOGLE_SHEETS_CREDENTIALS_JSON || process.env.GA4_CREDENTIALS_JSON;
  if (json) {
    const parsed = JSON.parse(json) as ServiceAccount;
    return { client_email: parsed.client_email, private_key: parsed.private_key };
  }

  const email = process.env.GOOGLE_SHEETS_CLIENT_EMAIL || process.env.GA4_CLIENT_EMAIL;
  const key = process.env.GOOGLE_SHEETS_PRIVATE_KEY || process.env.GA4_PRIVATE_KEY;
  if (!email || !key) {
    throw new Error(
      "Λείπουν credentials για το Google Sheets. Όρισε GOOGLE_SHEETS_CLIENT_EMAIL + " +
        "GOOGLE_SHEETS_PRIVATE_KEY (ή GOOGLE_SHEETS_CREDENTIALS_JSON)."
    );
  }
  // Στα env vars τα newlines αποθηκεύονται ως \n — τα μετατρέπουμε πίσω.
  return { client_email: email, private_key: key.replace(/\\n/g, "\n") };
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const sa = serviceAccount();
  const jwt = new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: SCOPES,
  });
  const { token } = await jwt.getAccessToken();
  if (!token) throw new Error("Απέτυχε η έκδοση access token για το Sheets API");
  cachedToken = { value: token, expiresAt: Date.now() + 50 * 60_000 };
  return token;
}

function spreadsheetId(): string {
  const id = process.env.SHEETS_SPREADSHEET_ID;
  if (!id) {
    throw new Error(
      "Λείπει το SHEETS_SPREADSHEET_ID. Είναι το μακρύ κομμάτι του URL του Sheet: " +
        "https://docs.google.com/spreadsheets/d/<ΑΥΤΟ_ΕΔΩ>/edit"
    );
  }
  return id;
}

async function sheetsFetch(
  path: string,
  init: RequestInit & { query?: Record<string, string> } = {}
): Promise<unknown> {
  const token = await accessToken();
  const qs = init.query ? `?${new URLSearchParams(init.query)}` : "";
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId()}${path}${qs}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string>),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 400);
    throw new Error(`Sheets API ${res.status} ${res.statusText}: ${detail}`);
  }
  return res.status === 204 ? null : await res.json();
}

/** Δημιουργεί το tab αν δεν υπάρχει· επιστρέφει το sheetId του. */
export async function ensureTab(title: string): Promise<number> {
  const meta = (await sheetsFetch("", {
    method: "GET",
    query: { fields: "sheets.properties(sheetId,title)" },
  })) as { sheets?: { properties: { sheetId: number; title: string } }[] };

  const existing = meta.sheets?.find((s) => s.properties.title === title);
  if (existing) return existing.properties.sheetId;

  const created = (await sheetsFetch(":batchUpdate", {
    method: "POST",
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title } } }],
    }),
  })) as { replies?: { addSheet?: { properties: { sheetId: number } } }[] };

  const sheetId = created.replies?.[0]?.addSheet?.properties.sheetId;
  if (sheetId === undefined) throw new Error(`Δεν δημιουργήθηκε το tab «${title}»`);
  return sheetId;
}

/** Διαβάζει όλα τα κελιά ενός tab ως πίνακα από strings. */
export async function readTab(title: string): Promise<string[][]> {
  const data = (await sheetsFetch(`/values/${encodeURIComponent(title)}`, {
    method: "GET",
    query: { majorDimension: "ROWS", valueRenderOption: "UNFORMATTED_VALUE" },
  })) as { values?: unknown[][] };

  return (data.values ?? []).map((row) => row.map((cell) => String(cell ?? "")));
}

/** Γράφει έναν πίνακα ξεκινώντας από το A1 και καθαρίζει ό,τι περίσσευε. */
export async function writeTab(title: string, rows: (string | number)[][]): Promise<void> {
  await sheetsFetch(`/values/${encodeURIComponent(title)}:clear`, { method: "POST", body: "{}" });
  if (rows.length === 0) return;
  await sheetsFetch(`/values/${encodeURIComponent(`${title}!A1`)}`, {
    method: "PUT",
    query: { valueInputOption: "RAW" },
    body: JSON.stringify({ values: rows }),
  });
}

/** Προσθέτει γραμμές στο τέλος ενός tab. */
export async function appendRows(title: string, rows: (string | number)[][]): Promise<void> {
  if (rows.length === 0) return;
  await sheetsFetch(`/values/${encodeURIComponent(`${title}!A1`)}:append`, {
    method: "POST",
    query: { valueInputOption: "RAW", insertDataOption: "INSERT_ROWS" },
    body: JSON.stringify({ values: rows }),
  });
}

/** Έντονη γραμματοσειρά στην πρώτη γραμμή + πάγωμα κεφαλίδας/πρώτης στήλης. */
export async function styleHeader(sheetId: number, freezeColumns: number): Promise<void> {
  await sheetsFetch(":batchUpdate", {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          updateSheetProperties: {
            properties: {
              sheetId,
              gridProperties: { frozenRowCount: 1, frozenColumnCount: freezeColumns },
            },
            fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
          },
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: "userEnteredFormat.textFormat.bold",
          },
        },
      ],
    }),
  });
}
