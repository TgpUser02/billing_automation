import os
import sys
import argparse
import time
from dotenv import load_dotenv
load_dotenv()
from gdrive_utils import get_drive_service, upload_file_to_drive, get_or_create_date_folder
import re


def find_latest_arin_folder():
    storage_root = os.environ.get('ARIN_STORAGE_PATH', '/var/arin')
    arin_root = os.path.abspath(storage_root)
    if not os.path.exists(arin_root):
        return None
    # Look for directories under arin that look like dates and pick the latest by name
    candidates = [d for d in os.listdir(arin_root) if os.path.isdir(os.path.join(arin_root, d))]
    if not candidates:
        return None
    # Prefer ISO-like names; sort and pick the last
    candidates_sorted = sorted(candidates)
    latest = candidates_sorted[-1]
    return os.path.join(arin_root, latest)


parser = argparse.ArgumentParser(description='Batch upload PDFs from a local folder to Google Drive')
parser.add_argument('folder', nargs='?', help='Path to folder containing PDFs (optional). If omitted, uses latest Desktop/arin/<date> folder.')
args = parser.parse_args()

if args.folder:
    pdf_folder = os.path.abspath(args.folder)
else:
    pdf_folder = find_latest_arin_folder()

drive_folder_id = os.environ.get('GOOGLE_DRIVE_FOLDER_ID')

if not pdf_folder or not os.path.exists(pdf_folder):
    print(f"PDF folder not found: {pdf_folder}")
    sys.exit(1)

service = get_drive_service()
if not service:
    print("Google Drive service could not be initialized.")
    exit(1)

root_drive_folder = drive_folder_id
if not root_drive_folder:
    print("GOOGLE_DRIVE_FOLDER_ID not set in environment.")
    exit(1)

# Ensure there is a Bill_Generation1 folder under the configured DRIVE folder
bill_gen_folder_id = get_or_create_date_folder(service, "Bill_Generation1", root_drive_folder)
if not bill_gen_folder_id:
    print("Could not create/find Bill_Generation1 folder in Drive.")
    exit(1)

print(f"--- Starting Batch Upload from: {pdf_folder} ---")
uploaded_count = 0
failed_count = 0

for fname in os.listdir(pdf_folder):
    if not fname.lower().endswith(".pdf"):
        continue
        
    fpath = os.path.join(pdf_folder, fname)
    
    # Extract consumer number (usually 12 digits)
    # The automation script saves as name_cnum.pdf or [date]_cnum.pdf
    m = re.search(r"(\d{10,12})", fname)
    if m:
        c_num = m.group(1)
    else:
        print(f"Could not extract consumer number from {fname}. Skipping.")
        continue

    consumer_folder_name = f"{c_num}"

    # Create/find consumer folder under Bill_Generation1
    consumer_folder_id = get_or_create_date_folder(service, consumer_folder_name, bill_gen_folder_id)
    if not consumer_folder_id:
        print(f"Could not create/find consumer folder for {consumer_folder_name}; skipping {fname}")
        failed_count += 1
        continue

    # Try to determine month_year filename (e.g., Mar_2026) from filename
    # Automation saves files with month data if possible
    # We look for MMM_YYYY or Jan|Feb...
    drive_filename = fname
    month_match = re.search(r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[ _-]?(\d{4})", fname, re.IGNORECASE)
    if month_match:
        month = month_match.group(1).capitalize()
        year = month_match.group(2)
        drive_filename = f"{month}_{year}.pdf"
    else:
        # Fallback: try YYYY-MM
        ymatch = re.search(r"(20\d{2})[-_ ]?(0[1-9]|1[0-2])", fname)
        if ymatch:
            y = ymatch.group(1)
            mnum = int(ymatch.group(2))
            month = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][mnum-1]
            drive_filename = f"{month}_{y}.pdf"

    print(f"Uploading {fname} as {consumer_folder_name}/{drive_filename} ...")
    
    # Global retry handled in gdrive_utils.py
    success, msg = upload_file_to_drive(service, fpath, drive_filename, consumer_folder_id)

    if success:
        print(f"Successfully uploaded: {drive_filename}")
        uploaded_count += 1
        try:
            os.remove(fpath)
            print(f"Deleted local file: {fname}")
        except Exception as e:
            print(f"Failed to delete local file {fname}: {e}")
    else:
        print(f"FAILED to upload {fname}: {msg}")
        failed_count += 1

# --- REPORT UPLOAD LOGIC ---
print("\n--- Checking for Reports to Upload ---")
# pdf_folder is .../arin/YYYY-MM-DD
arin_root = os.path.dirname(os.path.normpath(pdf_folder))
date_folder_name = os.path.basename(os.path.normpath(pdf_folder))

# Format date for readability (matches processing.py)
formatted_date = date_folder_name
try:
    from datetime import datetime
    dt = datetime.strptime(date_folder_name, "%Y-%m-%d")
    formatted_date = dt.strftime("%d %B %Y").lstrip('0') # e.g. 6 April 2026
except: pass

report_folder_local = os.path.join(arin_root, "Report", formatted_date)

if os.path.exists(report_folder_local):
    # 1. Ensure "Report" folder exists under Bill_Generation1 in Drive
    report_root_id = get_or_create_date_folder(service, "Report", bill_gen_folder_id)
    if report_root_id:
        # 2. Ensure Date folder exists under Report in Drive
        report_date_folder_id = get_or_create_date_folder(service, formatted_date, report_root_id)
        
        if report_date_folder_id:
            for rname in os.listdir(report_folder_local):
                if rname.endswith(".csv"):
                    rpath = os.path.join(report_folder_local, rname)
                    print(f"Uploading report: {rname} to Report/{formatted_date}/ ...")
                    success, msg = upload_file_to_drive(service, rpath, rname, report_date_folder_id)
                    if success:
                        print(f"Successfully uploaded report: {rname}")
                        # We don't delete local reports, just keep them organized
                    else:
                        print(f"FAILED to upload report {rname}: {msg}")
        else:
            print(f"Could not create/find report date folder: {formatted_date}")
    else:
        print("Could not create/find Report root folder in Drive.")
else:
    print(f"No local Report folder found at: {report_folder_local}")


print(f"\n--- Batch Upload Finished ---")

print(f"Uploaded: {uploaded_count}")
print(f"Failed: {failed_count}")

