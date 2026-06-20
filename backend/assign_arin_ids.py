"""
Arin ID Assignment Utility Script
Usage: backend/.venv/bin/python backend/assign_arin_ids.py
"""

import os
import sys
import mysql.connector

# Set up python path to access backend helpers
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

DB_CONFIG = {
    'host': os.getenv('DB_HOST'),
    'port': int(os.getenv('DB_PORT', 3306)) if os.getenv('DB_PORT') else 3306,
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
    'database': os.getenv('DB_NAME')
}

def get_db_connection():
    try:
        return mysql.connector.connect(**DB_CONFIG)
    except Exception as e:
        print(f"Error connecting to database: {e}")
        return None

def list_unassigned():
    conn = get_db_connection()
    if not conn:
        return
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id, consumer_number, customer_name, zone FROM customers WHERE arin_id IS NULL OR arin_id = 'N/A' OR arin_id = ''")
    rows = cursor.fetchall()
    conn.close()
    return rows

def update_arin_id(customer_id, arin_id):
    conn = get_db_connection()
    if not conn:
        return False
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE customers SET arin_id = %s WHERE id = %s", (arin_id, customer_id))
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Failed to update customer {customer_id}: {e}")
        conn.close()
        return False

def interactive_mode(unassigned):
    print(f"\nFound {len(unassigned)} consumers without an Arin ID.")
    print("Press Enter to skip a consumer. Type 'exit' to quit.\n")
    
    for idx, row in enumerate(unassigned):
        print(f"[{idx+1}/{len(unassigned)}] Name: {row['customer_name']}")
        print(f"      Consumer No: {row['consumer_number']}")
        print(f"      Zone: {row['zone']}")
        val = input("      Enter Arin ID (e.g. Arin#029): ").strip()
        
        if val.lower() == 'exit':
            break
        if not val:
            print("      -> Skipped.\n")
            continue
            
        # Format input (e.g., replace 'arin #29' -> 'Arin#029')
        # We standardise the prefix to 'Arin#'
        formatted = val
        if '#' in val:
            parts = val.split('#')
            prefix = parts[0].strip().capitalize()
            num_str = parts[1].strip()
            # If the number is less than 3 digits, pad it with zero
            if num_str.isdigit():
                formatted = f"{prefix}#{num_str.zfill(3)}"
        
        success = update_arin_id(row['id'], formatted)
        if success:
            print(f"      -> Assigned to {formatted}!\n")
        else:
            print("      -> Failed to save to database.\n")

def csv_mode():
    path = input("\nEnter path to CSV file: ").strip()
    if not os.path.exists(path):
        print("File does not exist.")
        return
        
    import csv
    conn = get_db_connection()
    if not conn:
        return
        
    cursor = conn.cursor(dictionary=True)
    success_count = 0
    
    with open(path, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        # Attempt to discover columns
        fieldnames = reader.fieldnames
        cnum_col = None
        arin_col = None
        
        for name in fieldnames:
            name_lower = name.lower()
            if 'consumer' in name_lower or 'number' in name_lower or 'no' in name_lower:
                cnum_col = name
            if 'arin' in name_lower or 'id' in name_lower:
                arin_col = name
                
        if not cnum_col or not arin_col:
            print(f"Could not map columns. Detected fields: {fieldnames}")
            print("Please ensure your CSV has a consumer number column and an arin id column.")
            conn.close()
            return
            
        print(f"Mapping columns: Consumer Number -> '{cnum_col}', Arin ID -> '{arin_col}'")
        for row in reader:
            cnum = row[cnum_col].strip()
            arin_id = row[arin_col].strip()
            
            if '#' in arin_id:
                parts = arin_id.split('#')
                prefix = parts[0].strip().capitalize()
                num_str = parts[1].strip()
                if num_str.isdigit():
                    arin_id = f"{prefix}#{num_str.zfill(3)}"
            
            cursor.execute("UPDATE customers SET arin_id = %s WHERE consumer_number = %s", (arin_id, cnum))
            if cursor.rowcount > 0:
                success_count += 1
                
    conn.commit()
    conn.close()
    print(f"Successfully updated {success_count} customer profiles from CSV.")

def main():
    print("=" * 50)
    print("      ARIN ID ASSIGNMENT TOOL")
    print("=" * 50)
    
    unassigned = list_unassigned()
    if not unassigned:
        print("All active consumers have an Arin ID assigned! Nothing to do.")
        return
        
    print("1. Assign interactively one-by-one")
    print("2. Import mapping from a CSV file")
    print("3. Exit")
    
    choice = input("\nEnter choice (1/2/3): ").strip()
    if choice == '1':
        interactive_mode(unassigned)
    elif choice == '2':
        csv_mode()
    else:
        print("Exited.")

if __name__ == "__main__":
    main()
