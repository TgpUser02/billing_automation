"""
Script to re-process existing PDFs in downloads folder and UPDATE database 
with the freshly extracted correct bank units.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import glob
from processing import extract_data_from_pdf, save_to_mysql
import logging
logging.disable(logging.CRITICAL)

download_dir = 'downloads'
pdf_files = glob.glob(os.path.join(download_dir, '**', '*.pdf'), recursive=True)

print(f"Reprocessing {len(pdf_files)} PDFs to fix database records...\n")

success_count = 0
for f in pdf_files:
    clean = f.strip()
    data = extract_data_from_pdf(clean)
    if data:
        cnum = data.get('consumer_number', 'N/A')
        bsu = data.get('bank_solar_units', 0)
        pbu = data.get('prev_bank_units', 0)
        
        # We need a proper date to match DB records. 
        # The extraction gets 'bill_month_date' correctly in most cases.
        if data.get('bill_month_date'):
            # save_to_mysql will check if record exists for consumer & month and UPDATE it
            saved = save_to_mysql(data)
            if saved:
                print(f"✓ DB UPDATED for Consumer {cnum}: BSU={bsu}, PBU={pbu}")
                success_count += 1
            else:
                print(f"✗ Failed DB Update for Consumer {cnum}")
        else:
            print(f"✗ No bill month extracted for {cnum}")
    else:
        print(f"✗ Failed extraction on {os.path.basename(clean)}")

print(f"\nDone! Successfully updated {success_count} records in the database.")
