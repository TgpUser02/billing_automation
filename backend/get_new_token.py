import os
import json
from google_auth_oauthlib.flow import InstalledAppFlow
from dotenv import load_dotenv, set_key

current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(current_dir)
dot_env_path = os.path.join(project_root, '.env')
if not os.path.exists(dot_env_path):
    dot_env_path = os.path.join(current_dir, '.env')
load_dotenv(dot_env_path)

CLIENT_ID = os.environ.get("GOOGLE_DRIVE_CLIENT_ID", "").strip()
CLIENT_SECRET = os.environ.get("GOOGLE_DRIVE_CLIENT_SECRET", "").strip()
SCOPES = ["https://www.googleapis.com/auth/drive"]

if not CLIENT_ID or not CLIENT_SECRET:
    # Try reading from secrets/token.json
    token_json_path = os.path.join(current_dir, 'secrets', 'token.json')
    if os.path.exists(token_json_path):
        try:
            with open(token_json_path, 'r') as f:
                tj = json.load(f)
                CLIENT_ID = CLIENT_ID or tj.get("client_id", "")
                CLIENT_SECRET = CLIENT_SECRET or tj.get("client_secret", "")
        except Exception:
            pass

client_config = {
    "installed": {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "redirect_uris": ["http://localhost:8080/"],
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
    }
}

print("=" * 70, flush=True)
print("🔑 Google Drive Token Generator", flush=True)
print("=" * 70, flush=True)
print(f"Client ID: {CLIENT_ID[:20]}...", flush=True)
print("\nOpening authorization server on http://localhost:8080/ ...", flush=True)

try:
    flow = InstalledAppFlow.from_client_config(client_config, SCOPES, redirect_uri="http://localhost:8080/")
    auth_url, _ = flow.authorization_url(access_type='offline', prompt='select_account consent')
    print("\n" + "=" * 70, flush=True)
    print("👉 AUTHORIZATION URL (Click or open in browser):", flush=True)
    print(auth_url, flush=True)
    print("=" * 70 + "\n", flush=True)
    
    creds = flow.run_local_server(port=8080, access_type='offline', prompt='select_account consent', open_browser=True)
    
    new_refresh_token = creds.refresh_token
    new_access_token = creds.token
    
    if new_refresh_token:
        # 1. Update .env
        set_key(dot_env_path, "GOOGLE_DRIVE_REFRESH_TOKEN", new_refresh_token)
        if new_access_token:
            set_key(dot_env_path, "GOOGLE_DRIVE_ACCESS_TOKEN", new_access_token)
            
        # 2. Update token.json
        secrets_dir = os.path.join(current_dir, 'secrets')
        os.makedirs(secrets_dir, exist_ok=True)
        token_path = os.path.join(secrets_dir, 'token.json')
        token_data = {
            "token": new_access_token,
            "access_token": new_access_token,
            "refresh_token": new_refresh_token,
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "scopes": SCOPES,
            "token_uri": "https://oauth2.googleapis.com/token"
        }
        with open(token_path, 'w', encoding='utf-8') as f:
            json.dump(token_data, f, indent=2)
            
        print("\n" + "=" * 70)
        print("✅ SUCCESS! Fresh refresh token saved to .env & backend/secrets/token.json")
        print("=" * 70)
        print(f"Refresh Token: {new_refresh_token[:15]}...")
        print("=" * 70 + "\n")
    else:
        print("❌ FAILED: No refresh token returned. Ensure you clicked 'Allow' with offline access.")

except Exception as e:
    print(f"❌ Authorization error: {e}")

