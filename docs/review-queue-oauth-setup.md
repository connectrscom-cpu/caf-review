# Review Queue: OAuth2 setup (no service account key)

Use this when you **cannot create service account keys** (e.g. org policy, or you prefer not to use them). The backend will use a **Google user account** and a **refresh token** to read and write the Review Queue sheet.

---

## 1. Create OAuth 2.0 credentials

Follow these steps in order. You will: create/select a project, configure the consent screen (once), add the Sheets scope, then create the OAuth client and copy Client ID and Client secret.

---

### 1.1 Open Google Cloud Console and pick a project

1. Go to **[Google Cloud Console](https://console.cloud.google.com/)** and sign in.
2. At the top, click the **project dropdown** (it shows the current project name).
3. Either **select an existing project** or click **New Project**, give it a name (e.g. `CAF Backend`), and click **Create**. Then select that project.

---

### 1.2 Enable the Google Sheets API

1. In the left menu, go to **APIs & Services** → **Library** (or search "Library" in the top search bar).
2. Search for **Google Sheets API**.
3. Click **Google Sheets API** → **Enable** (if it says "Manage", the API is already enabled).

---

### 1.3 Configure the OAuth consent screen (first time only)

1. In the left menu, go to **APIs & Services** → **Credentials**.
2. In the top tabs, click **OAuth consent screen** (or use the left menu under "APIs & Services").
3. Choose **User type**:
   - **External** — any Google account can sign in (typical for personal/small use). Click **Create**.
   - **Internal** — only accounts in your Google Workspace org (if you have one).
4. **App information** (first page):
   - **App name:** e.g. `CAF Review Queue`.
   - **User support email:** pick your email from the dropdown.
   - **Developer contact:** your email.
   Click **Save and Continue**.
5. **Scopes** (second page):
   - Click **Add or remove scopes**.
   - In the filter box, type `spreadsheets`.
   - Open the **Google Sheets API** section and check: **`.../auth/spreadsheets`** — "See, edit, create, and delete all your Google Sheets spreadsheets".
   - Click **Update** at the bottom, then **Save and Continue**.
6. **Test users** (if the app is in "Testing" mode — usual for new apps):
   - Click **Add users** and add the **Google account** you will use to open the Review Queue sheet (your own email is fine).
   - Click **Save and Continue**.
7. **Summary:** click **Back to dashboard**. The consent screen is done.

---

### 1.4 Create the OAuth client ID

1. Go to **APIs & Services** → **Credentials**.
2. Click **+ Create credentials** at the top → **OAuth client ID**.
3. **Application type:** choose **Desktop app** (simplest; no redirect URL to configure).
4. **Name:** e.g. `CAF Backend` (any name is fine).
5. Click **Create**.
6. A popup shows your **Client ID** and **Client secret**.
   - Click **Copy** for each, or keep the popup open.
   - Paste them somewhere safe; you will put them in `.env` as:
     - `GOOGLE_CLIENT_ID` = Client ID
     - `GOOGLE_CLIENT_SECRET` = Client secret
7. Click **OK** to close the popup.

You can always see them again under **Credentials** → click the name of the OAuth 2.0 Client you just created (e.g. "CAF Backend") to see Client ID and "Client secret" (click the eye or copy icon to reveal/copy).

---

## 2. Get a refresh token (one-time)

You need to sign in once with the Google account that will access the sheet (that account must have **Editor** access to the Review Queue spreadsheet).

### Option A: OAuth 2.0 Playground (easiest)

1. Go to [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/).
2. Click the gear icon (top right) and check **Use your own OAuth credentials**.
3. Enter your **Client ID** and **Client secret**.
4. In the left list, find **Google Sheets API v4** and select **https://www.googleapis.com/auth/spreadsheets**.
5. Click **Authorize APIs**. Sign in with the Google account that has access to the Review Queue sheet.
6. Click **Exchange authorization code for tokens**.
7. Copy the **Refresh token** and put it in `.env` as `GOOGLE_REFRESH_TOKEN`.

### Option B: Small Node script

1. Install: `npm install googleapis open`.
2. Run a one-off script that opens the browser, you sign in, and the script prints the refresh token. Example (run once, then remove or keep for re-runs):

```js
const { google } = require("googleapis");
const open = require("open");
const http = require("http");

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "YOUR_CLIENT_ID";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "YOUR_CLIENT_SECRET";
const REDIRECT_URI = "http://localhost:3334/callback";

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
const url = oauth2.generateAuthUrl({
  access_type: "offline",
  scope: ["https://www.googleapis.com/auth/spreadsheets"],
  prompt: "consent",
});

const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith("/callback")) return res.end();
  const q = new URL(req.url, "http://localhost").searchParams;
  const code = q.get("code");
  res.end("Done. Check the terminal for the refresh token.");
  server.close();
  if (code) {
    const { credentials } = await oauth2.getToken(code);
    console.log("GOOGLE_REFRESH_TOKEN=" + credentials.refresh_token);
  }
});
server.listen(3334, () => {
  console.log("Open this URL and sign in:", url);
  open(url);
});
```

Use the same **Client ID** and **Client secret** in the script and in `.env`. After you get the refresh token, you only need the three env vars; no service account key.

---

## 3. Env and sheet access

In `.env` set (and leave service account vars empty or removed):

```env
GOOGLE_REVIEW_QUEUE_SPREADSHEET_ID=your_spreadsheet_id
GOOGLE_REVIEW_QUEUE_SHEET_NAME=Review Queue
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REFRESH_TOKEN=the_refresh_token_from_step_2
```

- The **Google account** you used to get the refresh token must have **Editor** access to the Review Queue spreadsheet (owner or shared with that account as Editor).
- The backend will use this refresh token to get access tokens and call the Sheets API; no service account or key file is used.

---

## Summary

| You provide              | Used for                          |
|--------------------------|------------------------------------|
| OAuth Client ID/Secret   | From Cloud Console (no SA key)    |
| Refresh token            | One-time consent with a Google user |
| Sheet                    | Shared with that Google user (Editor) |

If your org blocks service account key creation, this OAuth2 path is the supported alternative.
