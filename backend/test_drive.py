import sys, os
sys.path.insert(0, '.')
from dotenv import load_dotenv
load_dotenv('.env')

print('AUTH_MODE:', os.environ.get('GOOGLE_DRIVE_AUTH_MODE'))
print('CLIENT_ID:', str(os.environ.get('GOOGLE_DRIVE_CLIENT_ID', 'MISSING'))[:20] + '...')
print('REFRESH_TOKEN:', str(os.environ.get('GOOGLE_DRIVE_REFRESH_TOKEN', 'MISSING'))[:30] + '...')
print('FOLDER_ID:', os.environ.get('GOOGLE_DRIVE_FOLDER_ID', 'MISSING'))

from gdrive_utils import get_drive_service
svc = get_drive_service()
if svc:
    print('Drive service: OK')
    folder_id = os.environ.get('GOOGLE_DRIVE_FOLDER_ID')
    try:
        res = svc.files().list(
            q=f"'{folder_id}' in parents and trashed=false",
            fields='files(id, name)',
            pageSize=5
        ).execute()
        print('Folder contents:', res.get('files'))
    except Exception as e:
        print('List error:', type(e).__name__, str(e)[:300])
else:
    print('Drive service: FAILED - could not authenticate')
