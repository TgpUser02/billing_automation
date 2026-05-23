"""
Run this script ONCE to generate a new Google Drive refresh token.
It will open a browser for you to authorize, then automatically update the .env file.
"""
import os
import re
from google_auth_oauthlib.flow import InstalledAppFlow

# Get credentials from .env first to be consistent
from dotenv import load_dotenv, set_key
load_dotenv('.env')

CLIENT_ID = os.environ.get("GOOGLE_DRIVE_CLIENT_ID", "57647831301-slmprltdearnsftettb4isjg2pnn0u3g.apps.googleusercontent.com")
CLIENT_SECRET = os.environ.get("GOOGLE_DRIVE_CLIENT_SECRET", "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")
SCOPES = ["https://www.googleapis.com/auth/drive"]

client_config = {
    "installed": {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "redirect_uris": ["urn:ietf:wg:oauth:2.0:oob", "http://localhost:8080/"],
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
    }
}

print("Initiating Google Drive Authorization flow...")
print("A browser window will open shortly. Please grant permission.")

try:
    flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
    creds = flow.run_local_server(port=8080, access_type='offline', prompt='consent')
    
    new_refresh_token = creds.refresh_token
    
    if new_refresh_token:
        # Update .env file using python-dotenv's set_key
        dot_env_path = '.env'
        set_key(dot_env_path, "GOOGLE_DRIVE_REFRESH_TOKEN", new_refresh_token)
        
        print("\n" + "="*60)
        print("✅ SUCCESS! Refresh token has been automatically updated in .env")
        print("="*60)
        print(f"Token: {new_refresh_token[:10]}...")
        print("="*60 + "\n")
    else:
        print("❌ FAILED: No refresh token received. Did you forget to click 'Allow' or was a token already active?")

except Exception as e:
    print(f"❌ ERROR occurred: {e}")
