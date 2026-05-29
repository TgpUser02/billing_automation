# Connecting Google Drive

The app uploads downloaded bill PDFs and meter photos to a Google Drive folder automatically. This guide shows how to generate a Refresh Token on your Mac and paste it into your VPS `.env`.

---

## How the Auth Works

The app uses **OAuth 2.0 with a long-lived Refresh Token**. You authorize once on your local machine. The token is then pasted into the VPS `.env` file. It never expires unless you manually revoke it from your Google account.

```
Your Mac (one-time)          VPS .env (permanent)
────────────────────         ────────────────────
Run get_new_token.py   →     GOOGLE_DRIVE_REFRESH_TOKEN=...
Open browser → Allow         GOOGLE_DRIVE_CLIENT_ID=...
Token saved to .env          GOOGLE_DRIVE_CLIENT_SECRET=...
                             GOOGLE_DRIVE_FOLDER_ID=...
```

---

## Step 1 — Generate the Refresh Token (do this once on your Mac)

```bash
cd /path/to/billing_automation/backend
python3 get_new_token.py
```

The script will print a URL. Open it in Chrome, log in with the Google account whose Drive you want to use, and click **Allow**.

The script will automatically write the `GOOGLE_DRIVE_REFRESH_TOKEN` into your local `.env` file.

> **Important:** Use the Google account that owns (or has editor access to) the Drive folder where bills should be uploaded.

---

## Step 2 — Get Your Google Drive Folder ID

Open your target folder in Google Drive. The URL looks like:

```
https://drive.google.com/drive/folders/1A2B3C4D5E6F7G8H9IJKL
                                        ─────────────────────
                                        This is your FOLDER_ID
```

---

## Step 3 — Add All 4 Values to Your VPS `.env`

SSH into your VPS and edit `.env`:

```bash
nano .env
```

Add or update these four lines:

```env
GOOGLE_DRIVE_CLIENT_ID=57647831301-slmprltdearnsftettb4isjg2pnn0u3g.apps.googleusercontent.com
GOOGLE_DRIVE_CLIENT_SECRET=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
GOOGLE_DRIVE_REFRESH_TOKEN=<paste from your Mac .env>
GOOGLE_DRIVE_FOLDER_ID=<your folder ID from Step 2>
```

Then restart the containers:

```bash
docker compose down && docker compose up -d
```

---

## Troubleshooting

### `invalid_scope` error in logs

The refresh token was generated with different scopes than the app expects. Regenerate it:

```bash
python3 get_new_token.py
```

### `invalid_grant` error in logs

The refresh token has been revoked. This happens if you:
- Removed app permissions from your Google account settings
- Changed your Google password

Fix: regenerate the token with `get_new_token.py` and update the VPS `.env`.

### Files not uploading

- Confirm `GOOGLE_DRIVE_FOLDER_ID` is correct (copy it from the browser URL, not the folder name)
- Confirm the Google account has at least **Editor** access to the folder
- Check backend logs: `docker compose logs -f --tail=50`

---

## How Uploads Are Structured in Drive

```
📁 Your Target Folder (GOOGLE_DRIVE_FOLDER_ID)
  └── 📁 2026-05-29           ← date folder (auto-created)
        ├── 📄 301234567890_May_2026.pdf
        ├── 📄 401234567890_May_2026.pdf
        └── 📄 501234567890_May_2026.jpeg  ← meter photos
```
