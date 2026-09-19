import { google } from "googleapis";

// Thin, read-only wrapper around the Google Sheets API for the completion
// poller. This is deliberately separate from anything BraveEve/NCCN use --
// the dashboard only ever reads these sheets, never writes to them.

let authClientPromise = null;

function getAuth() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;

  if (keyJson) {
    const credentials = JSON.parse(keyJson);
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
  }

  return new google.auth.GoogleAuth({
    keyFile: keyFile || "./service-account.json",
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

async function getClient() {
  if (!authClientPromise) {
    const auth = getAuth();
    authClientPromise = auth.getClient().then((authClient) => google.sheets({ version: "v4", auth: authClient }));
  }
  return authClientPromise;
}

/**
 * Returns every data row (header excluded) of the given sheet/tab as plain
 * arrays of cell strings. Returns [] rather than throwing if the sheet ID
 * isn't configured, so a missing/misconfigured source doesn't crash the
 * whole poll cycle -- the caller logs and moves on to the other source.
 */
export async function fetchSheetRows(spreadsheetId, tabName, range = "A2:Z") {
  if (!spreadsheetId) return [];
  const sheets = await getClient();
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!${range}`,
  });
  return resp.data.values || [];
}
