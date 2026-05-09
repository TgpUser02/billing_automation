import os
import csv
import logging
from datetime import datetime
from processing import get_all_bills
from gdrive_utils import get_drive_service, upload_file_to_drive, get_or_create_date_folder

logger = logging.getLogger(__name__)

def generate_and_upload_zero_gen():
    """
    Fetches all bills, filters for zero generation, creates a CSV, and uploads to Google Drive.
    """
    try:
        # 1. Fetch data
        bills = get_all_bills()
        if not bills:
            logger.warning("No bills found to process for zero generation.")
            return False, "No bills found in database."

        # 2. Filter for zero generation
        # Note: in processing.py, generation_units is mapped to 'generated' in get_dashboard_stats,
        # but get_all_bills returns the raw DB rows. The column is usually 'generation_units'.
        zero_gen_bills = [b for b in bills if float(b.get('generation_units') or 0) == 0]

        if not zero_gen_bills:
            logger.info("No zero generation bills found.")
            return True, "No zero generation consumers found today."

        # 3. Create CSV
        date_str = datetime.now().strftime("%Y-%m-%d")
        filename = f"zero_generation_{date_str}.csv"
        filepath = os.path.join(os.path.dirname(__file__), filename)

        keys = zero_gen_bills[0].keys()
        with open(filepath, 'w', newline='', encoding='utf-8') as output_file:
            dict_writer = csv.DictWriter(output_file, fieldnames=keys)
            dict_writer.writeheader()
            dict_writer.writerows(zero_gen_bills)

        logger.info(f"Created CSV: {filepath} with {len(zero_gen_bills)} entries.")

        # 4. Upload to Drive
        service = get_drive_service()
        if not service:
            return False, "Failed to initialize Google Drive service."

        parent_folder_id = os.environ.get("GOOGLE_DRIVE_FOLDER_ID")
        if not parent_folder_id:
            return False, "GOOGLE_DRIVE_FOLDER_ID not found in environment."

        # Optional: Upload to a subfolder for reports
        # folder_id = get_or_create_date_folder(service, "Zero_Gen_Reports", parent_folder_id)
        # For now, upload directly to the main folder as requested
        
        success, message = upload_file_to_drive(service, filepath, filename, parent_folder_id)
        
        # 5. Cleanup
        if os.path.exists(filepath):
            os.remove(filepath)

        return success, message

    except Exception as e:
        logger.error(f"Error in generate_and_upload_zero_gen: {e}")
        return False, str(e)

if __name__ == "__main__":
    # Setup basic logging to see output when running manually
    logging.basicConfig(level=logging.INFO)
    success, msg = generate_and_upload_zero_gen()
    print(f"Success: {success}, Message: {msg}")
