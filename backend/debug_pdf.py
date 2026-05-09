import pdfplumber
import glob
import re
import sys

# Force UTF-8 output
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

files = glob.glob('C:/Users/wahan/Desktop/arin/**/*.pdf', recursive=True)
if not files:
    print("NO PDFs FOUND")
else:
    print(f"Found {len(files)} PDFs, checking first one: {files[0]}")
    with pdfplumber.open(files[0]) as pdf:
        text = ''
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                text += t + '\n'

    print("\n=== SEARCHING FOR BANK/BANKED KEYWORDS ===")
    keywords = ['Bank Solar', 'Prev Bank', 'banked', 'Prev Bank Units', 'Bank Solar Units', 'solar']
    for kw in keywords:
        pos = text.lower().find(kw.lower())
        if pos != -1:
            print(f"\n[FOUND: '{kw}' at pos {pos}]")
            snippet = text[max(0, pos-30):pos+150]
            print(repr(snippet))
        else:
            print(f"\n[NOT FOUND: '{kw}']")

    print("\n=== ALL LINES CONTAINING NUMBERS NEAR BANK/SOLAR ===")
    lines = text.split('\n')
    for i, line in enumerate(lines):
        if re.search(r'bank|banked|prev\s*bank|solar', line, re.IGNORECASE):
            print(f"Line {i}: {repr(line)}")
            for j in range(i+1, min(i+4, len(lines))):
                print(f"  +{j-i}: {repr(lines[j])}")
