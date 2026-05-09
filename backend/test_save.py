"""
Quick end-to-end test: find a PDF, extract data, try saving to MySQL.
"""
import os, glob
from processing import extract_data_from_pdf, save_to_mysql

desktop = os.path.join(os.environ.get('USERPROFILE', os.path.expanduser("~")), 'Desktop')
arin_dir = os.path.join(desktop, 'arin')

pdfs = glob.glob(os.path.join(arin_dir, "**", "*.pdf"), recursive=True)
print(f"Found {len(pdfs)} PDFs under {arin_dir}")

if not pdfs:
    print("ERROR: No PDFs found. Check download directory.")
    exit(1)

pdf = pdfs[0]
print(f"Testing with: {pdf}")

data = extract_data_from_pdf(pdf)
print(f"Extracted: {data}")

ok = save_to_mysql(data)
print(f"Save result: {'SUCCESS' if ok else 'FAILED'}")
