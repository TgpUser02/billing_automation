"""
Test the fixed extraction. Writes results to test_results.txt
"""
import sys, os, io
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import glob
# Redirect stderr to suppress INFO logs in results
import logging
logging.disable(logging.CRITICAL)

from processing import extract_data_from_pdf

download_dir = 'downloads'
pdf_files = glob.glob(os.path.join(download_dir, '**', '*.pdf'), recursive=True)

lines_out = []
lines_out.append(f'Testing {len(pdf_files)} PDFs with FIXED extraction\n')
lines_out.append('='*60 + '\n')

all_warn = []
for f in pdf_files:
    clean = f.strip()
    data = extract_data_from_pdf(clean)
    cnum = data.get('consumer_number','N/A') if data else 'ERROR'
    bsu  = data.get('bank_solar_units', 0)   if data else 0
    pbu  = data.get('prev_bank_units',  0)   if data else 0
    imp  = data.get('import_units', 0)        if data else 0
    exp  = data.get('export_units', 0)        if data else 0
    gen  = data.get('generation_units', 0)   if data else 0

    lines_out.append(f'Consumer : {cnum}\n')
    lines_out.append(f'  Import={imp}  Export={exp}  Gen={gen}\n')
    lines_out.append(f'  bank_solar_units (BSU): {bsu}\n')
    lines_out.append(f'  prev_bank_units  (PBU): {pbu}\n')
    if bsu == 0.0 and pbu == 0.0:
        lines_out.append(f'  *** WARN: Both bank units are ZERO ***\n')
        all_warn.append(cnum)
    lines_out.append('\n')

lines_out.append('='*60 + '\n')
if all_warn:
    lines_out.append(f'Consumers with 0 bank units: {all_warn}\n')
else:
    lines_out.append('All consumers have non-zero bank units extracted correctly!\n')

with open('test_results.txt', 'w', encoding='utf-8') as f:
    f.writelines(lines_out)

print('Done - see test_results.txt')
