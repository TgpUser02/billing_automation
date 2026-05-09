import os
import mysql.connector
from dotenv import load_dotenv

load_dotenv()

DB_CONFIG = {
    'host': os.getenv('DB_HOST', '166.62.28.141'),
    'port': int(os.getenv('DB_PORT', 3306)),
    'user': os.getenv('DB_USER', 'Arin'),
    'password': os.getenv('DB_PASSWORD', 'Arin@098123'),
    'database': os.getenv('DB_NAME', 'Arin_Energy')
}

def test_connection():
    try:
        print(f"Connecting to {DB_CONFIG['host']}...")
        conn = mysql.connector.connect(**DB_CONFIG)
        print("Successfully connected!")
        conn.close()
        
        # Test processing
        print("\nTesting processing...")
        from processing import process_downloads
        import os
        
        # Estimate date_str (today)
        from datetime import datetime
        date_str = datetime.now().strftime("%Y-%m-%d")
        desktop_path = os.path.join(os.environ.get('USERPROFILE', os.path.expanduser("~")), 'Desktop')
        storage_path = os.path.join(desktop_path, 'arin', date_str)
        
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        for table in ['customers', 'bill_generation_details']:
            print(f"\n--- TABLE: {table} ---")
            cursor.execute(f"DESCRIBE {table}")
            for col in cursor.fetchall():
                print(f"COL: {col}")
            
            print(f"\n--- DATA SAMPLE: {table} ---")
            cursor.execute(f"SELECT * FROM {table} LIMIT 5")
            for row in cursor.fetchall():
                print(f"ROW: {row}")
        
        cursor.close()
        conn.close()

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_connection()
