import { google } from "googleapis";
import { Readable } from "stream";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// server/.env or backend/.env
const DRIVE_ENV_FILE_PATH = path.resolve(__dirname, ".env");

const driveFolderResolutionLocks = new Map();

function syncDriveEnvFromFile() {
  try {
    if (!fs.existsSync(DRIVE_ENV_FILE_PATH)) return;

    const raw = fs.readFileSync(DRIVE_ENV_FILE_PATH, "utf8");
    const driveKeys = [
      "GOOGLE_DRIVE_AUTH_MODE",
      "GOOGLE_DRIVE_ALLOW_SERVICE_ACCOUNT_FALLBACK",
      "GOOGLE_DRIVE_CLIENT_ID",
      "GOOGLE_DRIVE_CLIENT_SECRET",
      "GOOGLE_DRIVE_REDIRECT_URI",
      "GOOGLE_DRIVE_REFRESH_TOKEN",
      "GOOGLE_DRIVE_ACCESS_TOKEN",
      "GOOGLE_DRIVE_ACCESS_TOKEN_EXPIRY",
      "GOOGLE_DRIVE_FOLDER_ID",
      "GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE",
      "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON",
      "GOOGLE_DRIVE_CLIENT_EMAIL",
      "GOOGLE_DRIVE_PRIVATE_KEY",
      "GOOGLE_CREDENTIALS_FILE",
      "GOOGLE_TOKEN_FILE",
      "GOOGLE_DRIVE_CREDENTIALS_FILE",
      "GOOGLE_DRIVE_TOKEN_FILE",
      "GOOGLE_DRIVE_PERSIST_TOKENS",
    ];

    for (const key of driveKeys) {
      const pattern = new RegExp(`^${key}=(.*)$`, "m");
      const match = raw.match(pattern);
      if (!match) continue;

      const value = String(match[1] ?? "")
        .trim()
        .replace(/^['\"]|['\"]$/g, "");

      process.env[key] = value;
    }
  } catch (error) {
    // Non-fatal: continue with existing process.env values.
  }
}

function isTruthyEnv(value, defaultValue = true) {
  if (value == null) return defaultValue;
  return !["0", "false", "no", "off"].includes(
    String(value).trim().toLowerCase(),
  );
}

function getCredentialsFilePath() {
  return String(
    process.env.GOOGLE_DRIVE_CREDENTIALS_FILE ||
      process.env.GOOGLE_CREDENTIALS_FILE ||
      "",
  ).trim();
}

function getTokenFilePath() {
  return String(
    process.env.GOOGLE_DRIVE_TOKEN_FILE ||
      process.env.GOOGLE_TOKEN_FILE ||
      "",
  ).trim();
}

function readJsonFileIfExists(filePath) {
  const resolved = String(filePath || "").trim();
  if (!resolved || !fs.existsSync(resolved)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(resolved, "utf8"));
  } catch (error) {
    throw new Error(
      `Failed to parse Google auth JSON at ${resolved}: ${error.message}`,
    );
  }
}

function parseTokenExpiry(value) {
  if (value == null || value === "") return undefined;
  if (Number.isFinite(Number(value))) {
    const asNumber = Number(value);
    // Treat values that look like seconds as ms if needed.
    return asNumber < 1e12 ? asNumber * 1000 : asNumber;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatTokenExpiry(expiryDate) {
  if (!Number.isFinite(expiryDate)) return undefined;
  return new Date(expiryDate).toISOString().replace(/\.\d{3}Z$/, "");
}

function loadOAuthClientConfigFromFiles() {
  const credentialsPath = getCredentialsFilePath();
  const tokenPath = getTokenFilePath();
  const credentialsJson = credentialsPath
    ? readJsonFileIfExists(credentialsPath)
    : null;
  const tokenJson = tokenPath ? readJsonFileIfExists(tokenPath) : null;

  const installed =
    credentialsJson?.installed ||
    credentialsJson?.web ||
    (credentialsJson?.client_id ? credentialsJson : null);

  return {
    credentialsPath,
    tokenPath,
    credentialsJson,
    tokenJson,
    clientId:
      installed?.client_id ||
      tokenJson?.client_id ||
      null,
    clientSecret:
      installed?.client_secret ||
      tokenJson?.client_secret ||
      null,
    refreshToken: tokenJson?.refresh_token || null,
    accessToken: tokenJson?.token || tokenJson?.access_token || null,
    expiryDate: parseTokenExpiry(tokenJson?.expiry || tokenJson?.expiry_date),
    scopes: Array.isArray(tokenJson?.scopes) ? tokenJson.scopes : undefined,
    tokenUri: tokenJson?.token_uri || installed?.token_uri || undefined,
  };
}

function upsertEnvValue(content, key, value) {
  const normalizedValue = String(value ?? "")
    .replace(/[\r\n]+/g, "")
    .trim();
  const line = `${key}=${normalizedValue}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }
  const suffix = content.endsWith("\n") || content.length === 0 ? "" : "\n";
  return `${content}${suffix}${line}\n`;
}

function persistOAuthTokensToEnv({
  accessToken,
  refreshToken,
  expiryDate,
} = {}) {
  if (!isTruthyEnv(process.env.GOOGLE_DRIVE_PERSIST_TOKENS, true)) {
    return;
  }

  if (typeof accessToken === "string") {
    process.env.GOOGLE_DRIVE_ACCESS_TOKEN = accessToken;
  }
  if (typeof refreshToken === "string" && refreshToken.trim()) {
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN = refreshToken;
  }
  if (Number.isFinite(expiryDate)) {
    process.env.GOOGLE_DRIVE_ACCESS_TOKEN_EXPIRY = String(expiryDate);
  }

  try {
    const current = fs.existsSync(DRIVE_ENV_FILE_PATH)
      ? fs.readFileSync(DRIVE_ENV_FILE_PATH, "utf8")
      : "";
    let updated = current;
    if (typeof accessToken === "string") {
      updated = upsertEnvValue(updated, "GOOGLE_DRIVE_ACCESS_TOKEN", accessToken);
    }
    if (typeof refreshToken === "string" && refreshToken.trim()) {
      updated = upsertEnvValue(
        updated,
        "GOOGLE_DRIVE_REFRESH_TOKEN",
        refreshToken,
      );
    }
    if (Number.isFinite(expiryDate)) {
      updated = upsertEnvValue(
        updated,
        "GOOGLE_DRIVE_ACCESS_TOKEN_EXPIRY",
        String(expiryDate),
      );
    }
    if (updated !== current) {
      fs.writeFileSync(DRIVE_ENV_FILE_PATH, updated, "utf8");
    }
  } catch (error) {
    console.warn(
      "Failed to persist Google OAuth tokens to .env:",
      error.message,
    );
  }
}

function persistOAuthTokensToFile({
  accessToken,
  refreshToken,
  expiryDate,
  clientId,
  clientSecret,
  scopes,
  tokenUri,
} = {}) {
  const tokenPath = getTokenFilePath();
  if (!tokenPath) {
    return;
  }

  let existing = {};
  try {
    if (fs.existsSync(tokenPath)) {
      existing = JSON.parse(fs.readFileSync(tokenPath, "utf8"));
    }
  } catch {
    existing = {};
  }

  const next = {
    ...existing,
  };

  if (typeof accessToken === "string" && accessToken.trim()) {
    next.token = accessToken;
  }
  if (typeof refreshToken === "string" && refreshToken.trim()) {
    next.refresh_token = refreshToken;
  }
  if (Number.isFinite(expiryDate)) {
    next.expiry = formatTokenExpiry(expiryDate);
  }
  if (clientId) next.client_id = clientId;
  if (clientSecret) next.client_secret = clientSecret;
  if (Array.isArray(scopes) && scopes.length) next.scopes = scopes;
  if (tokenUri) next.token_uri = tokenUri;

  try {
    fs.writeFileSync(tokenPath, `${JSON.stringify(next, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  } catch (error) {
    console.warn(
      `Failed to persist Google OAuth tokens to ${tokenPath}:`,
      error.message,
    );
  }
}

function persistOAuthTokens(tokens = {}) {
  persistOAuthTokensToEnv(tokens);
  persistOAuthTokensToFile(tokens);
}

function getDriveAuthMode() {
  syncDriveEnvFromFile();
  return (process.env.GOOGLE_DRIVE_AUTH_MODE || "oauth")
    .toString()
    .trim()
    .toLowerCase();
}

function allowServiceAccountFallback() {
  return (
    (process.env.GOOGLE_DRIVE_ALLOW_SERVICE_ACCOUNT_FALLBACK || "false")
      .toString()
      .trim()
      .toLowerCase() === "true"
  );
}

function resolveOAuthCredentials() {
  syncDriveEnvFromFile();
  const fromFiles = loadOAuthClientConfigFromFiles();

  const clientId =
    fromFiles.clientId ||
    process.env.GOOGLE_DRIVE_CLIENT_ID?.toString().trim() ||
    "";
  const clientSecret =
    fromFiles.clientSecret ||
    process.env.GOOGLE_DRIVE_CLIENT_SECRET?.toString().trim() ||
    "";
  const refreshToken =
    fromFiles.refreshToken ||
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.toString().trim() ||
    "";
  const accessToken =
    fromFiles.accessToken ||
    process.env.GOOGLE_DRIVE_ACCESS_TOKEN?.toString().trim() ||
    "";
  const expiryDate =
    fromFiles.expiryDate ||
    parseTokenExpiry(process.env.GOOGLE_DRIVE_ACCESS_TOKEN_EXPIRY);

  if (!clientId || !clientSecret) {
    throw new Error(
      "OAuth credentials are missing. Set GOOGLE_DRIVE_CREDENTIALS_FILE / GOOGLE_CREDENTIALS_FILE (or GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET)",
    );
  }

  if (!refreshToken && !accessToken) {
    throw new Error(
      "OAuth token is missing. Set GOOGLE_DRIVE_TOKEN_FILE / GOOGLE_TOKEN_FILE (or GOOGLE_DRIVE_REFRESH_TOKEN / GOOGLE_DRIVE_ACCESS_TOKEN)",
    );
  }

  // Keep process.env in sync so other code paths see the active tokens.
  process.env.GOOGLE_DRIVE_CLIENT_ID = clientId;
  process.env.GOOGLE_DRIVE_CLIENT_SECRET = clientSecret;
  if (refreshToken) process.env.GOOGLE_DRIVE_REFRESH_TOKEN = refreshToken;
  if (accessToken) process.env.GOOGLE_DRIVE_ACCESS_TOKEN = accessToken;
  if (Number.isFinite(expiryDate)) {
    process.env.GOOGLE_DRIVE_ACCESS_TOKEN_EXPIRY = String(expiryDate);
  }

  // Dynamically mirror token.json → GOOGLE_DRIVE_ACCESS_TOKEN= in .env
  // whenever credentials are resolved from the token file.
  if (fromFiles.tokenPath && (accessToken || refreshToken)) {
    persistOAuthTokensToEnv({
      accessToken: accessToken || undefined,
      refreshToken: refreshToken || undefined,
      expiryDate: Number.isFinite(expiryDate) ? expiryDate : undefined,
    });
  }

  return {
    clientId,
    clientSecret,
    refreshToken: refreshToken || null,
    accessToken: accessToken || null,
    expiryDate: Number.isFinite(expiryDate) ? expiryDate : undefined,
    scopes: fromFiles.scopes,
    tokenUri: fromFiles.tokenUri,
  };
}

function normalizeGoogleDriveError(error, clientEmail) {
  const responseMessage =
    error?.response?.data?.error?.message ||
    error?.response?.data?.error_description ||
    error?.response?.statusText;
  const message = String(
    error?.message || responseMessage || "Google Drive request failed",
  );
  const code = error?.code || error?.response?.status;

  if (/invalid_grant/i.test(message) && /account not found/i.test(message)) {
    const accountLabel = clientEmail || "configured service account";
    return {
      code: code || 401,
      message: `Google Drive authentication failed: service account not found (${accountLabel}). Create/re-enable this service account in Google Cloud IAM, generate a new JSON key, update GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE, then restart the server.`,
    };
  }

  if (/invalid_grant/i.test(message)) {
    return {
      code: code || 401,
      message:
        "Google Drive OAuth authentication failed: refresh token is invalid or expired. Re-generate GOOGLE_DRIVE_REFRESH_TOKEN and restart the server.",
    };
  }

  if (/unauthorized_client/i.test(message)) {
    return {
      code: code || 401,
      message:
        "Google OAuth error: unauthorized_client. Common causes: the OAuth client is not a 'Web application', the redirect URI used does not exactly match the one registered in Google Cloud, the OAuth consent screen is not configured or your account is not a test user. Ensure Drive API is enabled in the project, add the exact redirect URI to the OAuth client, then re-authorize.",
    };
  }

  if (/invalid credentials/i.test(message)) {
    return {
      code: code || 401,
      message:
        "Google Drive authentication failed: credentials were rejected. If using OAuth, set a valid GOOGLE_DRIVE_REFRESH_TOKEN and remove stale GOOGLE_DRIVE_ACCESS_TOKEN. Then restart the server.",
    };
  }

  if (
    /invalid authentication credentials/i.test(message) ||
    /request had invalid authentication credentials/i.test(message)
  ) {
    return {
      code: code || 401,
      message:
        "Google Drive authentication failed: invalid OAuth access credentials. Set a valid GOOGLE_DRIVE_REFRESH_TOKEN, clear GOOGLE_DRIVE_ACCESS_TOKEN, and restart the server.",
    };
  }

  if (
    /Service Accounts do not have storage quota/i.test(message) ||
    /insufficientFilePermissions/i.test(message)
  ) {
    return {
      code: code || 403,
      message:
        "Google Drive upload failed: service account must upload into a Shared Drive folder. Share the Shared Drive/folder with the service account and set GOOGLE_DRIVE_FOLDER_ID to that Shared Drive folder ID.",
    };
  }

  return {
    code,
    message,
  };
}

export function getGoogleDriveConfigDiagnostics() {
  const authMode = getDriveAuthMode();
  const rawJson = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON;
  const serviceAccountFile =
    process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY;
  const oauthClientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const oauthClientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const oauthRefreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  const oauthAccessToken = process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  const issues = [];
  let mode = "none";

  if (authMode === "oauth") {
    mode = "oauth";
    const fromFiles = loadOAuthClientConfigFromFiles();
    const hasClient = Boolean(
      oauthClientId || fromFiles.clientId,
    );
    const hasSecret = Boolean(
      oauthClientSecret || fromFiles.clientSecret,
    );
    const hasToken = Boolean(
      oauthRefreshToken ||
        oauthAccessToken ||
        fromFiles.refreshToken ||
        fromFiles.accessToken,
    );

    if (!hasClient) {
      issues.push(
        "OAuth client id missing: set GOOGLE_DRIVE_CREDENTIALS_FILE or GOOGLE_DRIVE_CLIENT_ID",
      );
    }
    if (!hasSecret) {
      issues.push(
        "OAuth client secret missing: set GOOGLE_DRIVE_CREDENTIALS_FILE or GOOGLE_DRIVE_CLIENT_SECRET",
      );
    }
    if (!hasToken) {
      issues.push(
        "OAuth token missing: set GOOGLE_DRIVE_TOKEN_FILE or GOOGLE_DRIVE_REFRESH_TOKEN",
      );
    }

    const credentialsPath = getCredentialsFilePath();
    if (credentialsPath && !fs.existsSync(credentialsPath)) {
      issues.push(`GOOGLE_DRIVE_CREDENTIALS_FILE not found: ${credentialsPath}`);
    }
    const tokenPath = getTokenFilePath();
    if (tokenPath && !fs.existsSync(tokenPath)) {
      issues.push(`GOOGLE_DRIVE_TOKEN_FILE not found: ${tokenPath}`);
    }
  } else if (rawJson) {
    mode = "json";
    if (rawJson.includes("...")) {
      issues.push(
        "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON contains placeholder text (...) and is not valid credentials",
      );
    } else {
      try {
        const parsed = JSON.parse(rawJson);
        if (!parsed.client_email || !parsed.private_key) {
          issues.push(
            "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON is missing client_email or private_key",
          );
        }
      } catch {
        issues.push("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON is not valid JSON");
      }
    }
  } else if (serviceAccountFile) {
    mode = "file";
    if (!fs.existsSync(serviceAccountFile)) {
      issues.push(
        `GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE path not found: ${serviceAccountFile}`,
      );
    }
  } else if (clientEmail || privateKey) {
    mode = "pair";
    if (!clientEmail)
      issues.push(
        "GOOGLE_DRIVE_CLIENT_EMAIL is missing (required with private key)",
      );
    if (!privateKey)
      issues.push(
        "GOOGLE_DRIVE_PRIVATE_KEY is missing (required with client email)",
      );
  } else {
    issues.push(
      "No Google Drive credentials configured. Set GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE or GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON or GOOGLE_DRIVE_CLIENT_EMAIL + GOOGLE_DRIVE_PRIVATE_KEY",
    );
  }

  if (!folderId) {
    issues.push("GOOGLE_DRIVE_FOLDER_ID is missing");
  }

  return {
    ok: issues.length === 0,
    authMode,
    mode,
    hasFolderId: Boolean(folderId),
    issues,
  };
}

function resolveServiceAccountCredentials() {
  if (process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON) {
    try {
      const parsed = JSON.parse(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON);
      if (parsed.client_email && parsed.private_key) {
        return {
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key.replace(/\\n/g, "\n"),
        };
      }
    } catch (error) {
      throw new Error("Invalid GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON");
    }
  }

  const credentialsFilePath =
    process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (credentialsFilePath) {
    try {
      const fileContent = fs.readFileSync(credentialsFilePath, "utf8");
      const parsed = JSON.parse(fileContent);
      if (parsed.client_email && parsed.private_key) {
        return {
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key.replace(/\\n/g, "\n"),
        };
      }
      throw new Error("credentials missing client_email/private_key");
    } catch (error) {
      throw new Error(
        `Failed to read Google Drive credentials file: ${error.message}`,
      );
    }
  }

  const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n",
  );

  if (clientEmail && privateKey) {
    return { clientEmail, privateKey };
  }

  throw new Error(
    "Google Drive credentials are missing. Use GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE, GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON, or GOOGLE_DRIVE_CLIENT_EMAIL + GOOGLE_DRIVE_PRIVATE_KEY",
  );
}

export function getDriveClient() {
  const authMode = getDriveAuthMode();

  if (authMode === "oauth") {
    const {
      clientId,
      clientSecret,
      refreshToken,
      accessToken,
      expiryDate,
      scopes,
      tokenUri,
    } = resolveOAuthCredentials();
    const auth = new google.auth.OAuth2(clientId, clientSecret);

    auth.on("tokens", (tokens) => {
      persistOAuthTokens({
        accessToken: tokens?.access_token,
        refreshToken: tokens?.refresh_token || refreshToken,
        expiryDate: tokens?.expiry_date,
        clientId,
        clientSecret,
        scopes,
        tokenUri,
      });
    });

    auth.setCredentials(
      refreshToken
        ? {
            refresh_token: refreshToken,
            access_token: accessToken || undefined,
            expiry_date: expiryDate,
          }
        : {
            access_token: accessToken,
            expiry_date: expiryDate,
          },
    );

    const needsRefresh =
      Boolean(refreshToken) &&
      (!accessToken ||
        !Number.isFinite(expiryDate) ||
        expiryDate <= Date.now() + 60_000);

    if (needsRefresh) {
      auth
        .getAccessToken()
        .then((refreshed) => {
          const refreshedToken =
            typeof refreshed === "string" ? refreshed : refreshed?.token;
          if (!refreshedToken) return;
          const current = auth.credentials || {};
          persistOAuthTokens({
            accessToken: refreshedToken,
            refreshToken: current.refresh_token || refreshToken,
            expiryDate: current.expiry_date,
            clientId,
            clientSecret,
            scopes,
            tokenUri,
          });
        })
        .catch((error) => {
          console.warn(
            "Google OAuth proactive token refresh failed:",
            error?.message || error,
          );
        });
    }

    return {
      drive: google.drive({ version: "v3", auth }),
      mode: "oauth",
    };
  }

  const { clientEmail, privateKey } = resolveServiceAccountCredentials();

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  return {
    drive: google.drive({ version: "v3", auth }),
    mode: "service_account",
    clientEmail,
  };
}

export function getServiceAccountDriveClient() {
  const { clientEmail, privateKey } = resolveServiceAccountCredentials();

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  return {
    drive: google.drive({ version: "v3", auth }),
    mode: "service_account",
    clientEmail,
  };
}

function isCredentialFailure(error) {
  const code = error?.code || error?.response?.status;
  const message = String(
    error?.message ||
      error?.response?.data?.error?.message ||
      error?.response?.statusText ||
      "",
  );
  return (
    Number(code) === 401 ||
    /invalid credentials/i.test(message) ||
    /invalid authentication credentials/i.test(message) ||
    /request had invalid authentication credentials/i.test(message)
  );
}

function isFileNotFound(error) {
  const code = Number(error?.code || error?.response?.status || 0);
  const message = String(
    error?.message ||
      error?.response?.data?.error?.message ||
      error?.response?.statusText ||
      "",
  );
  return code === 404 || /file not found/i.test(message);
}

async function deleteDriveFileById({ drive, fileId }) {
  await drive.files.delete({
    fileId,
    supportsAllDrives: true,
  });
}

async function createPublicDriveFile({
  drive,
  buffer,
  fileName,
  mimeType,
  folderId,
}) {
  const createResponse = await drive.files.create({
    requestBody: {
      name: fileName,
      ...(folderId ? { parents: [folderId] } : {}),
    },
    supportsAllDrives: true,
    media: {
      mimeType: mimeType || "application/octet-stream",
      body: Readable.from(buffer),
    },
    fields: "id,name,mimeType,webViewLink,webContentLink,trashed,parents",
  });

  const fileId = createResponse.data.id;
  if (!fileId) {
    throw new Error("Google Drive upload failed: missing file id");
  }

  await drive.permissions.create({
    fileId,
    supportsAllDrives: true,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
  });

  try {
    const meta = await drive.files.get({
      fileId,
      supportsAllDrives: true,
      fields: "id,name,trashed,parents,webViewLink,webContentLink",
    });

    if (meta?.data?.trashed) {
      console.warn(
        `[DRIVE] Uploaded file is trashed; attempting to untrash (id: ${fileId})`,
      );
      await drive.files.update({
        fileId,
        supportsAllDrives: true,
        requestBody: { trashed: false },
        fields: "id,trashed",
      });
      console.log(`[DRIVE] File untrashed: ${fileId}`);
    }
  } catch (err) {
    console.warn(
      `[DRIVE] Failed to verify/untrash file ${fileId}:`,
      err?.message || err,
    );
  }

  return {
    fileId,
    fileName: createResponse.data.name || fileName,
    mimeType: createResponse.data.mimeType || mimeType,
    webViewLink:
      createResponse.data.webViewLink ||
      `https://drive.google.com/file/d/${fileId}/view`,
    publicUrl: `https://drive.google.com/uc?id=${fileId}`,
  };
}

function normalizeDriveFolderName(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw
    .replace(/[\\/]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120)
    .trim();
}

function escapeDriveQueryValue(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'");
}

async function resolveDriveTargetFolderId({ drive, folderId, subfolderName }) {
  const normalizedSubfolder = normalizeDriveFolderName(subfolderName);
  if (!normalizedSubfolder) {
    return folderId || null;
  }

  const lockKey = `${folderId || "root"}::${normalizedSubfolder}`;
  const existingLock = driveFolderResolutionLocks.get(lockKey);
  if (existingLock) {
    return existingLock;
  }

  const resolutionPromise = (async () => {
    const escapedName = escapeDriveQueryValue(normalizedSubfolder);
    const queryParts = [
      "mimeType='application/vnd.google-apps.folder'",
      "trashed=false",
      `name='${escapedName}'`,
    ];

    if (folderId) {
      queryParts.push(`'${folderId}' in parents`);
    }

    const listResponse = await drive.files.list({
      q: queryParts.join(" and "),
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: "allDrives",
      pageSize: 10,
      fields: "files(id,name,createdTime)",
      orderBy: "createdTime asc",
    });

    const existingFolder = Array.isArray(listResponse?.data?.files)
      ? listResponse.data.files[0]
      : null;

    if (existingFolder?.id) {
      return existingFolder.id;
    }

    const createResponse = await drive.files.create({
      requestBody: {
        name: normalizedSubfolder,
        mimeType: "application/vnd.google-apps.folder",
        ...(folderId ? { parents: [folderId] } : {}),
      },
      supportsAllDrives: true,
      fields: "id,name",
    });

    const createdFolderId = createResponse?.data?.id;
    if (!createdFolderId) {
      throw new Error("Google Drive folder creation failed: missing folder id");
    }

    return createdFolderId;
  })();

  driveFolderResolutionLocks.set(lockKey, resolutionPromise);

  try {
    return await resolutionPromise;
  } finally {
    driveFolderResolutionLocks.delete(lockKey);
  }
}

export async function uploadBufferToGoogleDrive({
  buffer,
  fileName,
  mimeType,
  folderId,
  subfolderName,
  subfolderPath,
}) {
  if (!buffer || !fileName) {
    throw new Error("Invalid upload payload for Google Drive");
  }

  const authMode = getDriveAuthMode();
  const clientEmail =
    authMode === "oauth"
      ? process.env.GOOGLE_DRIVE_CLIENT_ID
      : resolveServiceAccountCredentials().clientEmail;

  try {
    const { drive } = getDriveClient();
    const targetFolderId = await resolveDriveTargetFolderId({
      drive,
      folderId,
      subfolderName,
    });
    return await createPublicDriveFile({
      drive,
      buffer,
      fileName,
      mimeType,
      folderId: targetFolderId,
    });
  } catch (error) {
    if (
      authMode === "oauth" &&
      allowServiceAccountFallback() &&
      isCredentialFailure(error)
    ) {
      try {
        const { drive } = getServiceAccountDriveClient();
        const targetFolderId = await resolveDriveTargetFolderId({
          drive,
          folderId,
          subfolderName,
        });
        return await createPublicDriveFile({
          drive,
          buffer,
          fileName,
          mimeType,
          folderId: targetFolderId,
        });
      } catch (fallbackError) {
        const normalizedFallback = normalizeGoogleDriveError(
          fallbackError,
          clientEmail,
        );
        const wrappedFallback = new Error(normalizedFallback.message);
        wrappedFallback.code = normalizedFallback.code;
        wrappedFallback.originalMessage = fallbackError?.message;
        wrappedFallback.oauthError = error?.message;
        throw wrappedFallback;
      }
    }

    const normalized = normalizeGoogleDriveError(error, clientEmail);
    const wrapped = new Error(normalized.message);
    wrapped.code = normalized.code;
    wrapped.originalMessage = error?.message;
    throw wrapped;
  }
}

export async function deleteFileFromGoogleDrive(fileId) {
  const normalizedFileId = (fileId || "").toString().trim();
  if (!normalizedFileId) {
    return { success: false, skipped: true, reason: "missing-file-id" };
  }

  const authMode = getDriveAuthMode();
  const clientEmail =
    authMode === "oauth"
      ? process.env.GOOGLE_DRIVE_CLIENT_ID
      : resolveServiceAccountCredentials().clientEmail;

  try {
    const { drive } = getDriveClient();
    await deleteDriveFileById({ drive, fileId: normalizedFileId });
    return { success: true, fileId: normalizedFileId };
  } catch (error) {
    const normalized = normalizeGoogleDriveError(error, clientEmail);
    const wrapped = new Error(normalized.message);
    wrapped.code = normalized.code;
    wrapped.originalMessage = error?.message;
    throw wrapped;
  }
}
