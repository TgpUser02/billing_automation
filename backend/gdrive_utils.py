import os
import io
import json
import re
import time
import logging
import mimetypes
import requests
from google.oauth2.credentials import Credentials
from google.oauth2 import service_account
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload, MediaFileUpload

logger = logging.getLogger(__name__)

SCOPES = ['https://www.googleapis.com/auth/drive']
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
ENV_PATH = os.path.join(PROJECT_ROOT, '.env')
if not os.path.exists(ENV_PATH):
    ENV_PATH = os.path.join(BACKEND_DIR, '.env')

def sync_drive_env_from_file():
    """Reads live keys from .env if present."""
    if not os.path.exists(ENV_PATH):
        return
    try:
        with open(ENV_PATH, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                k, v = line.split('=', 1)
                k = k.strip()
                v = v.strip().strip("'\"")
                if k.startswith("GOOGLE_DRIVE_") or k in ("GOOGLE_CREDENTIALS_FILE", "GOOGLE_TOKEN_FILE"):
                    os.environ[k] = v
    except Exception as e:
        logger.debug(f"Non-fatal error reading .env: {e}")

def get_credentials_file_path():
    sync_drive_env_from_file()
    path = os.environ.get("GOOGLE_DRIVE_CREDENTIALS_FILE") or os.environ.get("GOOGLE_CREDENTIALS_FILE") or ""
    path = path.strip()
    if path and not os.path.isabs(path):
        path = os.path.abspath(os.path.join(PROJECT_ROOT, path))
    return path

def get_token_file_path():
    sync_drive_env_from_file()
    path = os.environ.get("GOOGLE_DRIVE_TOKEN_FILE") or os.environ.get("GOOGLE_TOKEN_FILE") or ""
    path = path.strip()
    if not path:
        # Fallback to secrets/token.json under backend
        path = os.path.join(BACKEND_DIR, 'secrets', 'token.json')
    elif not os.path.isabs(path):
        path = os.path.abspath(os.path.join(PROJECT_ROOT, path))
    return path

def read_json_file(file_path):
    if not file_path or not os.path.exists(file_path):
        return None
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"Failed to parse json at {file_path}: {e}")
        return None

def upsert_env_value(file_path, key, value):
    if not file_path:
        return
    try:
        content = ""
        if os.path.exists(file_path):
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
        
        normalized = str(value or "").replace("\r", "").replace("\n", "").strip()
        line = f"{key}={normalized}"
        pattern = re.compile(rf"^{re.escape(key)}=.*$", re.MULTILINE)
        
        if pattern.search(content):
            new_content = pattern.sub(line, content)
        else:
            suffix = "\n" if (content and not content.endswith("\n")) else ""
            new_content = f"{content}{suffix}{line}\n"
            
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
    except Exception as e:
        logger.warning(f"Could not persist {key} to {file_path}: {e}")

def persist_tokens(access_token=None, refresh_token=None, expiry=None, client_id=None, client_secret=None):
    """Persists refreshed tokens to token.json and .env file."""
    # 1. Update in-memory environment
    if access_token:
        os.environ["GOOGLE_DRIVE_ACCESS_TOKEN"] = access_token
    if refresh_token:
        os.environ["GOOGLE_DRIVE_REFRESH_TOKEN"] = refresh_token
    if expiry:
        os.environ["GOOGLE_DRIVE_ACCESS_TOKEN_EXPIRY"] = str(expiry)

    # 2. Persist to .env
    persist_flag = os.environ.get("GOOGLE_DRIVE_PERSIST_TOKENS", "true").lower()
    if persist_flag not in ("0", "false", "no", "off"):
        if access_token:
            upsert_env_value(ENV_PATH, "GOOGLE_DRIVE_ACCESS_TOKEN", access_token)
        if refresh_token:
            upsert_env_value(ENV_PATH, "GOOGLE_DRIVE_REFRESH_TOKEN", refresh_token)
        if expiry:
            upsert_env_value(ENV_PATH, "GOOGLE_DRIVE_ACCESS_TOKEN_EXPIRY", str(expiry))

    # 3. Persist to token.json
    token_path = get_token_file_path()
    if token_path:
        os.makedirs(os.path.dirname(token_path), exist_ok=True)
        data = read_json_file(token_path) or {}
        if access_token:
            data["token"] = access_token
            data["access_token"] = access_token
        if refresh_token:
            data["refresh_token"] = refresh_token
        if expiry:
            data["expiry"] = str(expiry)
        if client_id:
            data["client_id"] = client_id
        if client_secret:
            data["client_secret"] = client_secret
        data["scopes"] = SCOPES
        data["token_uri"] = "https://oauth2.googleapis.com/token"

        try:
            with open(token_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
            logger.info(f"✓ Successfully persisted updated Drive tokens to {token_path}")
        except Exception as e:
            logger.warning(f"Failed to write tokens to {token_path}: {e}")

def get_drive_service():
    """Initializes and returns the Google Drive API service with robust auto-refresh and token persistence."""
    sync_drive_env_from_file()
    auth_mode = os.environ.get("GOOGLE_DRIVE_AUTH_MODE", "oauth").lower().strip()

    if auth_mode == "oauth":
        creds_path = get_credentials_file_path()
        token_path = get_token_file_path()

        creds_json = read_json_file(creds_path) if creds_path else None
        token_json = read_json_file(token_path) if token_path else None

        installed = (
            creds_json.get("installed") or creds_json.get("web")
            if isinstance(creds_json, dict) else None
        )

        client_id = (
            (installed.get("client_id") if installed else None)
            or (token_json.get("client_id") if token_json else None)
            or os.environ.get("GOOGLE_DRIVE_CLIENT_ID")
            or ""
        ).strip()

        client_secret = (
            (installed.get("client_secret") if installed else None)
            or (token_json.get("client_secret") if token_json else None)
            or os.environ.get("GOOGLE_DRIVE_CLIENT_SECRET")
            or ""
        ).strip()

        refresh_token = (
            (token_json.get("refresh_token") if token_json else None)
            or os.environ.get("GOOGLE_DRIVE_REFRESH_TOKEN")
            or ""
        ).strip()

        access_token = (
            (token_json.get("token") or token_json.get("access_token") if token_json else None)
            or os.environ.get("GOOGLE_DRIVE_ACCESS_TOKEN")
            or ""
        ).strip()

        if not client_id or not client_secret:
            logger.error("Missing GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET or credentials file.")
            return None

        if not refresh_token and not access_token:
            logger.error("Missing GOOGLE_DRIVE_REFRESH_TOKEN or token.json file.")
            return None

        # Build Credentials
        creds = Credentials(
            token=access_token or None,
            refresh_token=refresh_token or None,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=client_id,
            client_secret=client_secret,
            scopes=SCOPES
        )

        # Proactive check / refresh
        try:
            if not creds.valid or not creds.token:
                logger.info("Refreshing Google Drive access token proactively...")
                creds.refresh(Request())
                persist_tokens(
                    access_token=creds.token,
                    refresh_token=creds.refresh_token or refresh_token,
                    expiry=creds.expiry.isoformat() if creds.expiry else None,
                    client_id=client_id,
                    client_secret=client_secret
                )
        except Exception as ref_err:
            logger.warning(f"google.auth refresh attempt failed ({ref_err}); attempting manual token endpoint refresh...")
            try:
                resp = requests.post(
                    "https://oauth2.googleapis.com/token",
                    data={
                        "client_id": client_id,
                        "client_secret": client_secret,
                        "refresh_token": refresh_token,
                        "grant_type": "refresh_token"
                    },
                    timeout=15
                )
                res_data = resp.json()
                if resp.status_code == 200 and res_data.get("access_token"):
                    new_token = res_data["access_token"]
                    creds = Credentials(
                        token=new_token,
                        refresh_token=refresh_token,
                        token_uri="https://oauth2.googleapis.com/token",
                        client_id=client_id,
                        client_secret=client_secret,
                        scopes=SCOPES
                    )
                    persist_tokens(
                        access_token=new_token,
                        refresh_token=refresh_token,
                        client_id=client_id,
                        client_secret=client_secret
                    )
                    logger.info("✓ Manual token refresh succeeded!")
                else:
                    logger.error(f"Manual token refresh failed: {resp.status_code} {res_data}")
                    return None
            except Exception as mex:
                logger.error(f"Manual token refresh exception: {mex}")
                return None

        return build('drive', 'v3', credentials=creds, cache_discovery=False)

    else:
        # Service account mode
        sa_file = os.environ.get("GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE")
        if sa_file and not os.path.isabs(sa_file):
            sa_file = os.path.abspath(os.path.join(PROJECT_ROOT, sa_file))
            
        if sa_file and os.path.exists(sa_file):
            creds = service_account.Credentials.from_service_account_file(sa_file, scopes=SCOPES)
            return build('drive', 'v3', credentials=creds, cache_discovery=False)
            
        logger.error(f"Service account file {sa_file} not found.")
        return None

def get_or_create_date_folder(service, folder_name, parent_folder_id=None):
    """Finds or creates a folder with the given name under parent_folder_id."""
    if not service:
        return None
    try:
        norm_name = str(folder_name or "").strip().replace("'", "\\'")
        query_parts = [
            f"name='{norm_name}'",
            "mimeType='application/vnd.google-apps.folder'",
            "trashed=false"
        ]
        if parent_folder_id:
            query_parts.append(f"'{parent_folder_id}' in parents")

        query = " and ".join(query_parts)
        results = service.files().list(
            q=query,
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
            spaces='drive',
            fields='files(id, name)'
        ).execute()
        items = results.get('files', [])

        if items:
            return items[0]['id']

        # Create folder
        body = {
            'name': folder_name,
            'mimeType': 'application/vnd.google-apps.folder'
        }
        if parent_folder_id:
            body['parents'] = [parent_folder_id]

        folder = service.files().create(
            body=body,
            supportsAllDrives=True,
            fields='id'
        ).execute()
        return folder.get('id')
    except Exception as e:
        logger.error(f"Error finding/creating Drive folder '{folder_name}': {e}")
        return None

def record_drive_upload_metadata(
    file_id,
    file_name,
    file_type=None,
    file_size=0,
    mime_type=None,
    folder_id=None,
    folder_path=None,
    view_url=None,
    download_url=None,
    consumer_number=None,
    month_year=None,
    category='general',
    uploaded_by='system'
):
    """Safely logs Google Drive upload metadata into MySQL drive_uploads_meta and updates bill_generation_details if applicable."""
    if not file_id:
        return
    try:
        from processing import get_db_connection
        conn = get_db_connection()
        if not conn:
            return
        cursor = conn.cursor()

        actual_view_url = view_url or f"https://drive.google.com/file/d/{file_id}/view"
        actual_download_url = download_url or f"https://drive.google.com/uc?id={file_id}"
        ext_type = file_type or ('pdf' if file_name.lower().endswith('.pdf') else 'image' if any(file_name.lower().endswith(ext) for ext in ('.png', '.jpg', '.jpeg', '.webp')) else 'file')

        # 1. Insert into centralized drive_uploads_meta table
        cursor.execute("""
            INSERT INTO drive_uploads_meta 
            (file_id, file_name, file_type, file_size, mime_type, folder_id, folder_path, view_url, download_url, consumer_number, month_year, category, uploaded_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            file_id,
            file_name,
            ext_type,
            file_size or 0,
            mime_type or '',
            folder_id or '',
            folder_path or '',
            actual_view_url,
            actual_download_url,
            consumer_number,
            month_year,
            category,
            uploaded_by
        ))

        # 2. If consumer_number is provided, update bill_generation_details record
        if consumer_number:
            if ext_type == 'pdf' or category in ('bill_pdf', 'report_pdf'):
                if month_year:
                    cursor.execute("""
                        UPDATE bill_generation_details 
                        SET pdf_drive_file_id = %s, pdf_drive_view_url = %s, pdf_file_name = %s 
                        WHERE consumer_number = %s AND month_year = %s
                    """, (file_id, actual_view_url, file_name, consumer_number, month_year))
                else:
                    cursor.execute("""
                        UPDATE bill_generation_details 
                        SET pdf_drive_file_id = %s, pdf_drive_view_url = %s, pdf_file_name = %s 
                        WHERE consumer_number = %s ORDER BY month_year DESC LIMIT 1
                    """, (file_id, actual_view_url, file_name, consumer_number))
            elif ext_type == 'image' or category in ('bill_image', 'image'):
                if month_year:
                    cursor.execute("""
                        UPDATE bill_generation_details 
                        SET image_drive_file_id = %s, image_drive_view_url = %s, image_file_name = %s 
                        WHERE consumer_number = %s AND month_year = %s
                    """, (file_id, actual_view_url, file_name, consumer_number, month_year))
                else:
                    cursor.execute("""
                        UPDATE bill_generation_details 
                        SET image_drive_file_id = %s, image_drive_view_url = %s, image_file_name = %s 
                        WHERE consumer_number = %s ORDER BY month_year DESC LIMIT 1
                    """, (file_id, actual_view_url, file_name, consumer_number))

        conn.commit()
        cursor.close()
        conn.close()
        logger.info(f"✓ Stored Drive metadata in MySQL: {file_name} ({file_id}) for consumer {consumer_number or 'N/A'}")
    except Exception as e:
        logger.warning(f"Could not log Drive metadata in MySQL: {e}")

def upload_file_to_drive(service, filepath, filename, folder_id, consumer_number=None, month_year=None, category='bill_pdf', folder_path=None, uploaded_by='system'):
    """Uploads a file to Google Drive, sets public reader permission, and logs metadata into MySQL."""
    if not service or not folder_id:
        return False, None, None, "Google Drive service or folder ID not available"

    try:
        mimetype, _ = mimetypes.guess_type(filepath)
        if not mimetype:
            mimetype = 'application/octet-stream'

        file_size = 0
        try:
            if os.path.exists(filepath):
                file_size = os.path.getsize(filepath)
        except:
            pass

        file_metadata = {
            'name': filename,
            'parents': [folder_id]
        }
        media = MediaFileUpload(filepath, mimetype=mimetype, resumable=True)

        res_file = service.files().create(
            body=file_metadata,
            media_body=media,
            supportsAllDrives=True,
            fields='id, name, mimeType, webViewLink, webContentLink, trashed'
        ).execute()

        file_id = res_file.get('id')
        if not file_id:
            return False, None, None, "Drive upload failed: missing file id"

        # Make file public for viewing
        try:
            service.permissions().create(
                fileId=file_id,
                supportsAllDrives=True,
                body={'role': 'reader', 'type': 'anyone'}
            ).execute()
        except Exception as perm_err:
            logger.debug(f"Permission create note: {perm_err}")

        # Untrash if needed
        if res_file.get('trashed'):
            try:
                service.files().update(
                    fileId=file_id,
                    supportsAllDrives=True,
                    body={'trashed': False}
                ).execute()
            except Exception as untrash_err:
                logger.warning(f"Untrash attempt failed: {untrash_err}")

        view_url = res_file.get('webViewLink') or f"https://drive.google.com/file/d/{file_id}/view"
        download_url = f"https://drive.google.com/uc?id={file_id}"

        # Record metadata into MySQL
        record_drive_upload_metadata(
            file_id=file_id,
            file_name=filename,
            file_type='pdf' if filename.lower().endswith('.pdf') else 'file',
            file_size=file_size,
            mime_type=mimetype,
            folder_id=folder_id,
            folder_path=folder_path,
            view_url=view_url,
            download_url=download_url,
            consumer_number=consumer_number,
            month_year=month_year,
            category=category,
            uploaded_by=uploaded_by
        )

        return True, file_id, view_url, "Successfully uploaded to Google Drive"

    except Exception as e:
        logger.error(f"Failed to upload file to Google Drive: {e}")
        return False, None, None, str(e)

def upload_base64_image_to_drive(service, base64_data, filename, folder_id, consumer_number=None, month_year=None, category='bill_image', folder_path=None, uploaded_by='system'):
    """Uploads base64 image data to Google Drive as a PNG file and logs metadata into MySQL."""
    if not service or not folder_id:
        return False, None, None, "Google Drive service or folder ID not available"

    try:
        import base64
        clean_b64 = base64_data
        if isinstance(clean_b64, str):
            if "," in clean_b64:
                clean_b64 = clean_b64.split(",", 1)[1]
            clean_b64 = clean_b64.strip()
            missing_padding = len(clean_b64) % 4
            if missing_padding:
                clean_b64 += '=' * (4 - missing_padding)
            image_bytes = base64.b64decode(clean_b64)
        else:
            image_bytes = clean_b64

        file_size = len(image_bytes) if image_bytes else 0

        file_metadata = {
            'name': filename,
            'parents': [folder_id]
        }
        media = MediaIoBaseUpload(io.BytesIO(image_bytes), mimetype='image/png', resumable=True)

        res_file = service.files().create(
            body=file_metadata,
            media_body=media,
            supportsAllDrives=True,
            fields='id, name, mimeType, webViewLink, webContentLink, trashed'
        ).execute()

        file_id = res_file.get('id')
        if not file_id:
            return False, None, None, "Drive image upload failed: missing file id"

        try:
            service.permissions().create(
                fileId=file_id,
                supportsAllDrives=True,
                body={'role': 'reader', 'type': 'anyone'}
            ).execute()
        except Exception:
            pass

        view_url = res_file.get('webViewLink') or f"https://drive.google.com/file/d/{file_id}/view"
        download_url = f"https://drive.google.com/uc?id={file_id}"

        # Record metadata into MySQL
        record_drive_upload_metadata(
            file_id=file_id,
            file_name=filename,
            file_type='image',
            file_size=file_size,
            mime_type='image/png',
            folder_id=folder_id,
            folder_path=folder_path,
            view_url=view_url,
            download_url=download_url,
            consumer_number=consumer_number,
            month_year=month_year,
            category=category,
            uploaded_by=uploaded_by
        )

        return True, file_id, view_url, "Successfully uploaded image to Google Drive"

    except Exception as e:
        logger.error(f"Failed to upload base64 image to Google Drive: {e}")
        return False, None, None, str(e)
