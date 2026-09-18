"""
Sanitize mismatched reading dates in bill_generation_details.
1. Re-extract true values for records 1859-1865 from downloaded PDFs.
2. Fix billing_date = reading_date where billing_date was defaulted to 1st of month.
3. Clear invalid reading_date where reading_date > billing_date.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from processing import get_db_connection, extract_data_from_pdf

def sanitize_and_fix_dates():
    conn = get_db_connection()
    if not conn:
        print("Error connecting to database.")
        return

    cursor = conn.cursor(dictionary=True)

    # 1. Update records 1859-1865 using extracted PDF data
    print("=== Step 1: Re-extracting records 1859-1865 ===")
    for rec_id in range(1859, 1866):
        pdf_path = os.path.join(os.path.dirname(__file__), "..", "scratch", f"bill_{rec_id}.pdf")
        if os.path.exists(pdf_path):
            data = extract_data_from_pdf(pdf_path)
            if data and data.get("reading_date") and data.get("billing_date"):
                print(f"Updating record {rec_id} ({data.get('consumer_number')}):")
                print(f"  reading_date: {data['reading_date']}, billing_date: {data['billing_date']}, gen: {data['generation_units']}, exp: {data['export_units']}, imp: {data['import_units']}, amt: {data['billing_amount']}")
                cursor.execute("""
                    UPDATE bill_generation_details
                    SET reading_date = %s,
                        billing_date = %s,
                        generation_units = %s,
                        export_units = %s,
                        import_units = %s,
                        billing_amount = %s
                    WHERE id = %s
                """, (
                    data["reading_date"],
                    data["billing_date"],
                    data["generation_units"],
                    data["export_units"],
                    data["import_units"],
                    data["billing_amount"],
                    rec_id
                ))
    conn.commit()

    # 2. For records where billing_date was defaulted to month_year (e.g. day 1 or 5) and reading_date is shortly after in the same month
    print("\n=== Step 2: Fixing defaulted billing_date where reading_date is in same month ===")
    cursor.execute("""
        SELECT id, consumer_number, month_year, billing_date, reading_date, DATEDIFF(reading_date, billing_date) as diff
        FROM bill_generation_details
        WHERE reading_date > billing_date AND DATEDIFF(reading_date, billing_date) <= 6
    """)
    short_diff_rows = cursor.fetchall()
    for r in short_diff_rows:
        # In MSEDCL, bill date cannot precede meter reading. Adjust billing_date to match reading_date
        print(f"Adjusting record {r['id']} ({r['consumer_number']}): billing_date {r['billing_date']} -> {r['reading_date']}")
        cursor.execute("UPDATE bill_generation_details SET billing_date = %s WHERE id = %s", (r['reading_date'], r['id']))
    conn.commit()

    # 3. For any remaining records where reading_date > billing_date (clearly Due Date / invalid future date)
    print("\n=== Step 3: Clearing any remaining invalid reading_date > billing_date ===")
    cursor.execute("""
        SELECT id, consumer_number, month_year, billing_date, reading_date, DATEDIFF(reading_date, billing_date) as diff
        FROM bill_generation_details
        WHERE reading_date > billing_date
    """)
    remaining = cursor.fetchall()
    if remaining:
        ids = [r['id'] for r in remaining]
        format_strings = ','.join(['%s'] * len(ids))
        cursor.execute(f"""
            UPDATE bill_generation_details
            SET reading_date = NULL
            WHERE id IN ({format_strings})
        """, tuple(ids))
        conn.commit()
        print(f"Set reading_date = NULL for {len(ids)} remaining mismatched records: {ids}")
    else:
        print("No remaining records with reading_date > billing_date!")

    # 4. Final verification
    cursor.execute("SELECT COUNT(*) as cnt FROM bill_generation_details WHERE reading_date > billing_date")
    cnt = cursor.fetchone()['cnt']
    print(f"\n✓ Verification: Total records where reading_date > billing_date = {cnt}")

    cursor.close()
    conn.close()

if __name__ == "__main__":
    sanitize_and_fix_dates()
