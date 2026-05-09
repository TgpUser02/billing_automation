"""
FULL TEST: Extract PDF -> Save to MySQL -> Read Back & Verify
Run: python test_full_flow.py
"""
import os
import sys
import glob
from dotenv import load_dotenv
load_dotenv()

print("=" * 70)
print("   STEP 1: MySQL Connection Test")
print("=" * 70)

import mysql.connector

DB_CONFIG = {
    'host':     os.getenv('DB_HOST', '166.62.28.141'),
    'port':     int(os.getenv('DB_PORT', 3306)),
    'user':     os.getenv('DB_USER', 'Arin'),
    'password': os.getenv('DB_PASSWORD', 'Arin@098123'),
    'database': os.getenv('DB_NAME', 'Arin_Energy')
}

print(f"   Host:     {DB_CONFIG['host']}")
print(f"   User:     {DB_CONFIG['user']}")
print(f"   Database: {DB_CONFIG['database']}")
print()

try:
    conn = mysql.connector.connect(**DB_CONFIG)
    print("   ✅ MySQL Connection: SUCCESS!")
    conn.close()
except Exception as e:
    print(f"   ❌ MySQL Connection: FAILED!")
    print(f"   Error: {e}")
    print()
    print("   ⚠️  MySQL se connect nahi ho paa raha.")
    print("   Check karo:")
    print("   1. Internet connection hai?")
    print("   2. .env file mein credentials sahi hain?")
    print("   3. Server 166.62.28.141 accessible hai?")
    sys.exit(1)

print()
print("=" * 70)
print("   STEP 2: Find PDFs")
print("=" * 70)

# Look for PDFs in multiple common locations
desktop = os.path.join(os.environ.get('USERPROFILE', os.path.expanduser("~")), 'Desktop')
search_dirs = [
    os.path.join(desktop, 'arin'),
    os.path.join(desktop, 'New folder (4)'),
    'downloads',
    os.path.join(os.path.dirname(__file__), 'downloads'),
]

all_pdfs = []
for d in search_dirs:
    if os.path.exists(d):
        found = glob.glob(os.path.join(d, '**', '*.pdf'), recursive=True)
        if found:
            print(f"   📁 {d}: {len(found)} PDFs found")
            all_pdfs.extend(found)

if not all_pdfs:
    print("   ❌ Koi PDF nahi mila!")
    print("   Apna PDF folder path yahan daalo:")
    custom_path = input("   Path: ").strip().strip('"')
    if os.path.exists(custom_path):
        all_pdfs = glob.glob(os.path.join(custom_path, '**', '*.pdf'), recursive=True)
        print(f"   Found {len(all_pdfs)} PDFs in {custom_path}")
    if not all_pdfs:
        print("   ❌ No PDFs found. Exiting.")
        sys.exit(1)

print(f"\n   Total PDFs: {len(all_pdfs)}")
print()

# Pick first PDF for test
test_pdf = all_pdfs[0]
print("=" * 70)
print("   STEP 3: Extract Data from PDF")
print("=" * 70)
print(f"   File: {os.path.basename(test_pdf)}")
print()

from processing import extract_data_from_pdf, save_to_mysql

data = extract_data_from_pdf(test_pdf)
if not data:
    print("   ❌ PDF se data extract nahi ho paya!")
    sys.exit(1)

print("   Extracted Values:")
print(f"   ├── consumer_number:      {data.get('consumer_number')}")
print(f"   ├── consumer_name:        {data.get('consumer_name')}")
print(f"   ├── import_units:         {data.get('import_units')}")
print(f"   ├── export_units:         {data.get('export_units')}")
print(f"   ├── generation_units:     {data.get('generation_units')}")
print(f"   ├── previous_banked_units:{data.get('previous_banked_units')}")
print(f"   ├── current_banked_units: {data.get('current_banked_units')}")
print(f"   ├── billing_amount:       {data.get('billing_amount')}")
print(f"   ├── reading_date:         {data.get('reading_date')}")
print(f"   ├── bill_month_date:      {data.get('bill_month_date')}")
print(f"   └── capacity:             {data.get('capacity')}")
print()

print("=" * 70)
print("   STEP 4: Save to MySQL")
print("=" * 70)

result = save_to_mysql(data)
if result:
    print("   ✅ Data SAVED to MySQL successfully!")
else:
    print("   ❌ Save FAILED! Check the logs above for error details.")
    sys.exit(1)

print()
print("=" * 70)
print("   STEP 5: Read Back from MySQL (VERIFY)")
print("=" * 70)

try:
    conn = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT b.*, c.consumer_number, c.customer_name
        FROM bill_generation_details b
        LEFT JOIN customers c ON c.id = b.customer_id
        WHERE c.consumer_number = %s
        ORDER BY b.created_at DESC
        LIMIT 5
    """, (data['consumer_number'],))
    
    rows = cursor.fetchall()
    if rows:
        print(f"   ✅ Database mein {len(rows)} record(s) milein for {data['consumer_number']}:")
        print()
        for i, row in enumerate(rows):
            print(f"   --- Record {i+1} ---")
            print(f"   consumer_number:      {row.get('consumer_number')}")
            print(f"   month_year:           {row.get('month_year')}")
            print(f"   reading_date:         {row.get('reading_date')}")
            print(f"   import_units:         {row.get('import_units')}")
            print(f"   export_units:         {row.get('export_units')}")
            print(f"   generation_units:     {row.get('generation_units')}")
            print(f"   previous_banked_units:{row.get('previous_banked_units')}")
            print(f"   current_banked_units: {row.get('current_banked_units')}")
            print(f"   billing_amount:       {row.get('billing_amount')}")
            print()
            
            # Check if values are 0.00
            zero_fields = []
            for field in ['import_units', 'export_units', 'billing_amount']:
                if float(row.get(field, 0)) == 0.0:
                    zero_fields.append(field)
            
            if zero_fields and float(data.get('import_units', 0)) > 0:
                print(f"   ⚠️  WARNING: These fields are still 0.00 in DB: {zero_fields}")
                print(f"   But extracted values were non-zero! Something is wrong.")
            else:
                print(f"   ✅ Values match! Data is saving correctly now!")
    else:
        print(f"   ⚠️  Koi record nahi mila for {data['consumer_number']}")
    
    cursor.close()
    conn.close()
except Exception as e:
    print(f"   ❌ Read-back error: {e}")

print()
print("=" * 70)
print("   ✅ TEST COMPLETE!")
print("=" * 70)
print()
print("   Agar sab ✅ green hai, toh aapka data ab sahi save ho raha hai.")
print("   Browser mein dekho: http://localhost:8000/api/bills")
print()

# Ask if user wants to process ALL PDFs
if len(all_pdfs) > 1:
    print(f"   📋 Aapke paas total {len(all_pdfs)} PDFs hain.")
    ans = input("   Kya saare PDFs process karke MySQL mein save karein? (y/n): ").strip().lower()
    if ans == 'y':
        print()
        from processing import process_downloads
        for d in set(os.path.dirname(p) for p in all_pdfs):
            print(f"   Processing folder: {d}")
            count = process_downloads(d)
            print(f"   ✅ {count} bills saved from {d}")
        print()
        print("   🎉 DONE! Sab PDFs process ho gaye!")
        print("   Browser mein dekho: http://localhost:8000/api/bills")
