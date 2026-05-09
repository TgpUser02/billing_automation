import glob, os, pdfplumber, re, sys

download_dir = 'downloads'
pdf_files = glob.glob(os.path.join(download_dir, '**', '*.pdf'), recursive=True)
print(f'Total PDFs found: {len(pdf_files)}', flush=True)

for f in pdf_files:
    clean = f.strip()
    print(f'\n========== FILE: {clean} ==========', flush=True)
    try:
        with pdfplumber.open(clean) as pdf:
            text = ''
            for page in pdf.pages:
                text += page.extract_text() or ''
        
        cnums = re.findall(r'\d{10,12}', text)
        print(f'Consumer Numbers in PDF: {cnums[:3]}', flush=True)
        
        lines = text.split('\n')
        print(f'Total lines: {len(lines)}', flush=True)
        
        # Find relevant lines
        for i, line in enumerate(lines):
            if any(k in line for k in ['Bank Solar', 'Prev Bank', 'Export offset', 'Export Offset',
                                        'bank solar', 'prev bank', '835', '705', 'Banked', 'banked']):
                print(f'  [ANCHOR] Line {i}: {repr(line)}', flush=True)
                for offset in range(1, 5):
                    if i + offset < len(lines):
                        print(f'  [+{offset}]   Line {i+offset}: {repr(lines[i+offset])}', flush=True)
        
        # Also check for "Prvious Banked" / "Current Banked" (native English format)
        for i, line in enumerate(lines):
            if 'Banked' in line or 'Banking' in line:
                print(f'  [BANKED] Line {i}: {repr(line)}', flush=True)
                if i+1 < len(lines):
                    print(f'  [+1]     Line {i+1}: {repr(lines[i+1])}', flush=True)

    except Exception as e:
        print(f'ERROR: {e}', flush=True)
        import traceback
        traceback.print_exc()

print('\n=== DONE ===', flush=True)
