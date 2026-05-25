import os
from dotenv import load_dotenv
load_dotenv()
from gdrive_utils import get_drive_service, upload_file_to_drive

# Set these to a real PDF path and your Drive folder ID
test_pdf = os.path.abspath("backend/sample.pdf")  # Place a small sample.pdf in backend/
drive_folder_id = os.environ.get("GOOGLE_DRIVE_FOLDER_ID")

if not os.path.exists(test_pdf):
    print(f"Test PDF not found: {test_pdf}")
    exit(1)

service = get_drive_service()
if not service:
    print("Google Drive service could not be initialized. Check credentials and .env.")
    exit(1)

print(f"Uploading {test_pdf} to Drive folder {drive_folder_id} ...")
success, msg = upload_file_to_drive(service, test_pdf, "test_upload.pdf", drive_folder_id)
print("Success:" if success else "Failed:", msg)
