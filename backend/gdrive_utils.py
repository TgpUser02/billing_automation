import os
import io
import logging
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload, MediaFileUpload
import mimetypes
import requests

logger = logging.getLogger(__name__)

# Scopes needed for Google Drive API
SCOPES = ['https://www.googleapis.com/auth/drive']

def get_drive_service():
    """Initializes and returns the Google Drive API service with automatic token management."""
    try:
        auth_mode = os.environ.get("GOOGLE_DRIVE_AUTH_MODE", "oauth")
        
        if auth_mode == "oauth":
            # Path for the persisted token
            token_path = os.path.join(os.path.dirname(__file__), 'secrets', 'token.json')
            if not os.path.exists(os.path.dirname(token_path)):
                os.makedirs(os.path.dirname(token_path), exist_ok=True)

            creds = None
            client_id = os.environ.get("GOOGLE_DRIVE_CLIENT_ID")
            client_secret = os.environ.get("GOOGLE_DRIVE_CLIENT_SECRET")
            refresh_token = os.environ.get("GOOGLE_DRIVE_REFRESH_TOKEN")

            # 1. Try loading from token.json
            if os.path.exists(token_path):
                from google.oauth2.credentials import Credentials
                creds = Credentials.from_authorized_user_file(token_path, SCOPES)
                logger.info("Loaded Google Drive credentials from token.json")

            # 2. If no valid credentials, try to bootstrap from .env variables
            if not creds or not creds.valid:
                if creds and creds.expired and creds.refresh_token:
                    # Token expired, try refreshing it
                    try:
                        from google.auth.transport.requests import Request
                        creds.refresh(Request())
                        logger.info("Refreshed Google Drive token using refresh_token in token.json")
                    except Exception as refresh_err:
                        logger.error(f"Failed to refresh token from file: {refresh_err}")
                        creds = None # Force bootstrap from .env

                if not creds:
                    if client_id and client_secret and refresh_token:
                        from google.oauth2.credentials import Credentials
                        creds = Credentials(
                            token=None,
                            refresh_token=refresh_token,
                            token_uri="https://oauth2.googleapis.com/token",
                            client_id=client_id,
                            client_secret=client_secret,
                            scopes=SCOPES
                        )
                        logger.info("Bootstrapped Google Drive credentials from environment variables")
                    elif client_id and client_secret:
                        # Interactive one-time bootstrap for local development.
                        # This writes a token.json cache so later runs do not need a refresh token in .env.
                        try:
                            from google_auth_oauthlib.flow import InstalledAppFlow

                            flow = InstalledAppFlow.from_client_config(
                                {
                                    "installed": {
                                        "client_id": client_id,
                                        "client_secret": client_secret,
                                        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                                        "token_uri": "https://oauth2.googleapis.com/token",
                                        "redirect_uris": ["http://localhost:8080/"]
                                    }
                                },
                                SCOPES
                            )
                            creds = flow.run_local_server(port=8080, access_type="offline", prompt="consent")
                            logger.info("Bootstrapped Google Drive credentials interactively")
                        except Exception as flow_err:
                            logger.error(f"Interactive Google Drive bootstrap failed: {flow_err}")
                            return None
                    else:
                        logger.error(
                            "Missing required Google Drive OAuth credentials. Set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET, "
                            "and optionally GOOGLE_DRIVE_REFRESH_TOKEN for non-interactive runs."
                        )
                        return None

                # Verify valid now
                if not creds.valid:
                    try:
                        from google.auth.transport.requests import Request
                        creds.refresh(Request())
                    except Exception as e:
                        logger.error(f"Credentials still invalid after bootstrap refresh via google.auth: {e}")
                        # Try manual refresh via token endpoint to capture clearer error response
                        try:
                            token_url = "https://oauth2.googleapis.com/token"
                            payload = {
                                'client_id': client_id,
                                'client_secret': client_secret,
                                'refresh_token': refresh_token,
                                'grant_type': 'refresh_token'
                            }
                            logger.info("Attempting manual token refresh via OAuth token endpoint")
                            resp = requests.post(token_url, data=payload, timeout=15)
                            try:
                                resp_json = resp.json()
                            except Exception:
                                resp_json = {'status_code': resp.status_code, 'text': resp.text}

                            if resp.status_code == 200 and resp_json.get('access_token'):
                                access_token = resp_json.get('access_token')
                                # Construct Credentials with the new access token
                                creds = Credentials(
                                    token=access_token,
                                    refresh_token=refresh_token,
                                    token_uri=token_url,
                                    client_id=client_id,
                                    client_secret=client_secret,
                                    scopes=SCOPES
                                )
                                logger.info("Manual token refresh succeeded and credentials constructed")
                            else:
                                # Provide additional diagnostic for common errors
                                err = resp_json.get('error') if isinstance(resp_json, dict) else None
                                logger.error(f"Manual token refresh failed: {resp.status_code} {resp_json}")
                                if err == 'invalid_scope':
                                    logger.error("Token endpoint returned invalid_scope. This means the refresh token was generated with different scopes than the ones requested by the application.\n"
                                                 "Fix: regenerate the refresh token using the EXACT scopes:\n"
                                                 "  https://www.googleapis.com/auth/drive.file\n"
                                                 "  https://www.googleapis.com/auth/drive\n"
                                                 "Use the OAuth Playground with 'Use your own OAuth credentials' set to your client ID/secret, or re-run your app's OAuth flow to obtain a fresh refresh token.")
                                return None
                        except Exception as mex:
                            logger.error(f"Manual token refresh attempt raised exception: {mex}")
                            return None

                # 3. Save the credentials for the next run
                with open(token_path, 'w') as token:
                    token.write(creds.to_json())
                    logger.info("Saved updated Google Drive credentials to token.json")

            return build('drive', 'v3', credentials=creds)
        
        else:
            # Fallback service account logic if needed
            from google.oauth2 import service_account
            service_account_file = os.environ.get("GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE")
            if service_account_file and not os.path.isabs(service_account_file):
                # Resolve relative to the project root (parent directory of backend)
                project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                service_account_file = os.path.abspath(os.path.join(project_root, service_account_file))

            if service_account_file and os.path.exists(service_account_file):
                creds = service_account.Credentials.from_service_account_file(
                    service_account_file, scopes=SCOPES)
                return build('drive', 'v3', credentials=creds)
            
            logger.error(f"Service account file {service_account_file} not found.")
            return None
            
    except Exception as e:
        logger.error(f"Failed to initialize Google Drive service: {e}")
        return None


def get_or_create_date_folder(service, date_str, parent_folder_id):
    """
    Checks if a folder with the given date_str exists within the parent_folder_id.
    If it does, returns its ID. If not, creates it and returns the new ID.
    """
    if not service or not parent_folder_id:
        return None
        
    try:
        # Search for folder with the specific name and parent
        query = f"name='{date_str}' and '{parent_folder_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false"
        results = service.files().list(q=query, spaces='drive', fields='files(id, name)').execute()
        items = results.get('files', [])
        
        if items:
            return items[0]['id']
            
        # Folder doesn't exist, create it
        file_metadata = {
            'name': date_str,
            'parents': [parent_folder_id],
            'mimeType': 'application/vnd.google-apps.folder'
        }
        folder = service.files().create(body=file_metadata, fields='id').execute()
        return folder.get('id')
        
    except Exception as e:
        logger.error(f"Error finding/creating Drive folder: {e}")
        return None

def upload_base64_image_to_drive(service, base64_data, filename, folder_id):
    """
    Uploads base64 image data to Google Drive as a PNG file.
    """
    if not service or not folder_id:
        return False, "Google Drive service or folder ID not available"
        
    try:
        import base64
        image_bytes = base64.b64decode(base64_data)
        
        file_metadata = {
            'name': filename,
            'parents': [folder_id]
        }
        
        media = MediaIoBaseUpload(io.BytesIO(image_bytes), mimetype='image/png', resumable=True)
        
        # We can also check if the file already exists and update it, but for now we create
        # To avoid duplicates, we can search first
        query = f"name='{filename}' and '{folder_id}' in parents and trashed=false"
        results = service.files().list(q=query, spaces='drive', fields='files(id)').execute()
        items = results.get('files', [])
        
        try:
            if items:
                # Update existing file
                file_id = items[0]['id']
                service.files().update(fileId=file_id, media_body=media).execute()
            else:
                # Create new file
                service.files().create(body=file_metadata, media_body=media).execute()
        except Exception as e:
            logger.warning(f"First upload attempt failed: {e}. Retrying once...")
            import time
            time.sleep(2)
            if items:
                service.files().update(fileId=items[0]['id'], media_body=media).execute()
            else:
                service.files().create(body=file_metadata, media_body=media).execute()
            
        return True, "Successfully uploaded to Google Drive"
    except Exception as e:
        error_msg = f"Failed to upload to Google Drive after retry: {e}"
        logger.error(error_msg)
        return False, error_msg

def upload_file_to_drive(service, filepath, filename, folder_id):
    """
    Uploads a file to Google Drive.
    """
    if not service or not folder_id:
        return False, "Google Drive service or folder ID not available"
        
    try:
        mimetype, _ = mimetypes.guess_type(filepath)
        if not mimetype:
            mimetype = 'application/octet-stream'
            
        file_metadata = {
            'name': filename,
            'parents': [folder_id]
        }
        
        media = MediaFileUpload(filepath, mimetype=mimetype, resumable=True)
        
        # Check if file already exists
        query = f"name='{filename}' and '{folder_id}' in parents and trashed=false"
        results = service.files().list(q=query, spaces='drive', fields='files(id)').execute()
        items = results.get('files', [])
        
        try:
            if items:
                # Update existing file
                file_id = items[0]['id']
                service.files().update(fileId=file_id, media_body=media).execute()
            else:
                # Create new file
                service.files().create(body=file_metadata, media_body=media).execute()
        except Exception as e:
            logger.warning(f"First file upload attempt failed: {e}. Retrying once...")
            import time
            time.sleep(2)
            if items:
                service.files().update(fileId=items[0]['id'], media_body=media).execute()
            else:
                service.files().create(body=file_metadata, media_body=media).execute()

        return True, "Successfully uploaded file to Google Drive"
    except Exception as e:
        error_msg = f"Failed to upload file to Google Drive after retry: {e}"
        logger.error(error_msg)
        return False, error_msg


