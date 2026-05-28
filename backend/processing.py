import os
import pdfplumber
import datetime as dt_mod
from datetime import datetime, date, timedelta
import decimal
import json
import re
import mysql.connector
from dotenv import load_dotenv
import logging
import time

# Load environment variables
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# MySQL Configuration
DB_CONFIG = {
    'host': os.getenv('DB_HOST', '166.62.28.141'),
    'port': int(os.getenv('DB_PORT', 3306)),
    'user': os.getenv('DB_USER', 'Arin'),
    'password': os.getenv('DB_PASSWORD', 'Arin@098123'),
    'database': os.getenv('DB_NAME', 'Arin_Energy')
}

def get_db_connection(retry_count=3, retry_delay=2):
    """Connect to MySQL with retry logic and timeout."""
    config = {
        **DB_CONFIG,
        'connection_timeout': 10,  # 10 second timeout
        'autocommit': False,
        'use_unicode': True,
        'charset': 'utf8mb4',
    }
    
    for attempt in range(retry_count):
        try:
            logger.info(f"Attempting MySQL connection (attempt {attempt + 1}/{retry_count})...")
            conn = mysql.connector.connect(**config)
            logger.info("✓ MySQL connection successful")
            return conn
        except mysql.connector.Error as e:
            if attempt < retry_count - 1:
                logger.warning(f"Connection attempt {attempt + 1} failed: {e}. Retrying in {retry_delay}s...")
                time.sleep(retry_delay)
            else:
                logger.error(f"Failed to connect to MySQL after {retry_count} attempts: {e}")
                return None
        except Exception as e:
            logger.error(f"Unexpected error connecting to MySQL: {e}")
            return None

def search_consumers_in_db(identifiers):
    """
    Search for multiple consumers in the database using either 
    Consumer Number OR Arin ID.
    """
    if not identifiers:
        return []
        
    conn = get_db_connection()
    if not conn:
        logger.error("No DB connection available for search.")
        return []
        
    try:
        cursor = conn.cursor(dictionary=True)
        results = []
        
        # If it's a single identifier, we'll try both exact and partial matches
        # to make it more user-friendly for "single person lookup"
        if len(identifiers) == 1:
            val = identifiers[0]
            for table in ["customers", "customers_backup"]:
                try:
                    # Search with exact match first, then partial
                    query = f"""
                        SELECT arin_id, consumer_number, customer_name 
                        FROM {table} 
                        WHERE consumer_number = %s 
                           OR arin_id = %s
                           OR arin_id LIKE %s
                           OR consumer_number LIKE %s
                        LIMIT 50
                    """
                    pattern = f"%{val}%"
                    cursor.execute(query, (val, val, pattern, pattern))
                    table_results = cursor.fetchall()
                    for r in table_results:
                        if not any(x['consumer_number'] == r['consumer_number'] for x in results):
                            results.append(r)
                except Exception as e:
                    logger.warning(f"Search in {table} failed: {e}")
        else:
            # For multiple identifiers, stick to exact match for performance
            format_strings = ','.join(['%s'] * len(identifiers))
            for table in ["customers", "customers_backup"]:
                try:
                    query = f"""
                        SELECT arin_id, consumer_number, customer_name 
                        FROM {table} 
                        WHERE consumer_number IN ({format_strings}) 
                           OR arin_id IN ({format_strings})
                    """
                    cursor.execute(query, tuple(identifiers) + tuple(identifiers))
                    table_results = cursor.fetchall()
                    for r in table_results:
                        if not any(x['consumer_number'] == r['consumer_number'] for x in results):
                            results.append(r)
                except Exception as e:
                    logger.warning(f"Search in {table} failed: {e}")
                
        return results
    except Exception as e:
        logger.error(f"Search consumers error: {e}")
        return []
    finally:
        if conn:
            conn.close()

def get_all_customers_db():
    conn = get_db_connection()
    if not conn:
        logger.error("No DB connection available for all customers.")
        return []
    try:
        cursor = conn.cursor(dictionary=True)
        # Fetch all columns from customers table to support full profile views
        try:
            cursor.execute("SELECT * FROM customers")
            results = cursor.fetchall()
            # if customers table exists but is empty
            if not results:
                cursor.execute("SELECT * FROM customers_backup")
                results = cursor.fetchall()
        except Exception:
            # Fallback
            cursor.execute("SELECT * FROM customers_backup")
            results = cursor.fetchall()
            
        # Deduplicate profiles by consumer_number
        seen = set()
        deduped = []
        for r in results:
            cnum = r.get("consumer_number")
            if cnum not in seen:
                seen.add(cnum)
                deduped.append(r)
        return deduped
    except Exception as e:
        logger.error(f"Get all consumers error: {e}")
        return []
    finally:
        if conn:
            conn.close()

def get_customer_details(consumer_number):
    """
    Fetches customer details specifically for auto-filling from the customers table.
    SQL: SELECT customer_name, solar_capacity_kw as capacity, commission_date, consumer_number FROM customers WHERE consumer_number = %s
    """
    conn = get_db_connection()
    if not conn:
        return None
        
    try:
        cursor = conn.cursor(dictionary=True)
        # Search in both customers and customers_backup if needed, but customers is primary here
        query = "SELECT customer_name, solar_capacity_kw as capacity, commission_date, consumer_number, panel_name, inverter_name FROM customers WHERE consumer_number = %s"
        cursor.execute(query, (consumer_number,))
        result = cursor.fetchone()
        
        if not result:
            # Try backup table if not found, but it might not have all fields
            query_bk = "SELECT customer_name, consumer_number FROM customers_backup WHERE consumer_number = %s"
            cursor.execute(query_bk, (consumer_number,))
            result = cursor.fetchone()
            if result:
                # Add placeholders for missing fields in backup
                result['capacity'] = 0.0
                result['commission_date'] = None
                result['panel_name'] = 'Other'
                result['inverter_name'] = 'Other'
        
        return result
    except Exception as e:
        logger.error(f"Error fetching customer details: {e}")
        return None
    finally:
        if conn:
            conn.close()


def extract_data_from_pdf(pdf_path, default_date=None):
    """
    Extracts relevant data from a MSEDCL Solar Net Meter PDF bill.
    Patterns matched to actual bill layout, including native direct-downloads.
    """
    data = {
        "consumer_number": "N/A",
        "consumer_name": "N/A",
        "import_units": 0.0,
        "export_units": 0.0,
        "generation_units": 0.0,
        "billing_amount": 0.0,
        "reading_date": None,
        "bill_month_date": None,
        "prev_bank_units": 0.0,
        "bank_solar_units": 0.0,
        "capacity": 0.0,
        "area": "Other",
        "bill_status": "Normal"
    }

    try:
        def num(s):
            if not s: return 0.0
            return float(s.replace(",", "").strip())

        with pdfplumber.open(pdf_path) as pdf:
            text = ""
            for page in pdf.pages:
                text += page.extract_text() or ""

            # ── 1. Consumer Number ──────────────────────────────────────────
            # prioritized search for consumer number including Marathi
            # ग्राहक क्रमांक : 425320007691
            c_match = re.search(r"(?:Consumer|Cons|ग्राहक)\s*[:.\-]?\s*(?:No\.?|Number|क्रमांक)\s*[:.\-]?\s*(\d{10,12})", text, re.IGNORECASE)
            if c_match:
                data["consumer_number"] = c_match.group(1).strip()
            else:
                # Secondary fallback: look for "क्रमांक" followed by 12 digits anywhere nearby
                c_match_v2 = re.search(r"क्रमांक\s*[:.\-]?\s*(\d{10,12})", text)
                if c_match_v2:
                    data["consumer_number"] = c_match_v2.group(1).strip()
                else:
                    # Final fallback purely for 12 digits - but try to avoid the internal ID if possible
                    # (Usually the consumer number starts with 3 or 4 or 5 in MSEDCL)
                    c_all = re.findall(r"(\d{10,12})", text)
                    if c_all:
                        # Prefer 12-digit numbers starting with 3, 4, or 5 (standard for MSEDCL Consumer Numbers)
                        for potential in c_all:
                            if potential.startswith(('3', '4', '5')):
                                data["consumer_number"] = potential
                                break
                        if data["consumer_number"] == "N/A":
                            data["consumer_number"] = c_all[0]

            # ── 2. Consumer Name ────────────────────────────────────────────
            # Try progressively specific patterns to match MSEDCL bill layout (Issue #14)
            name_match = None
            # Pattern 1: "Consumer Name : Some Name" with stop at mobile/email/address or 2+ spaces
            name_patterns = [
                r"Consumer\s+Name\s*:\s*([A-Za-z][A-Za-z\s\.]{1,50})(?:\s{2,}|Mobile|Email|Address|\n)",
                r"(?:^|\n)Name\s*:\s*([A-Za-z][A-Za-z\s\.]{1,50})(?:\s{2,}|Mobile|Email|\n)",
                r"Consumer\s*:\s*([A-Za-z][A-Za-z\s\.]{1,50})(?:\s{2,}|Bill Date|\n)",
            ]
            for pat in name_patterns:
                m = re.search(pat, text, re.IGNORECASE | re.MULTILINE)
                if m:
                    name_match = m
                    break
            
            # Native layout often has something like: "MR VINOD CHITAMAN BELSARE"
            if not name_match:
                m_native = re.search(r"(?:^|\n)(M/?[R|S|s]\.?\s+[A-Za-z\s]+)(?:\n)", text)
                if m_native:
                    name_match = m_native
                    
            if name_match:
                data["consumer_name"] = name_match.group(1).strip()
                
            # DB FALLBACK FOR NAME (CRITICAL FOR NATIVE PDF RENAMING)
            if data["consumer_name"] == "N/A" and data["consumer_number"] != "N/A":
                try:
                    conn = get_db_connection()
                    if conn:
                        cursor = conn.cursor(dictionary=True)
                        cursor.execute("SELECT customer_name FROM customers WHERE consumer_number = %s", (data["consumer_number"],))
                        row = cursor.fetchone()
                        if row and row.get("customer_name"):
                            data["consumer_name"] = row["customer_name"]
                        else:
                            # Try backup table too
                            cursor.execute("SELECT customer_name FROM customers_backup WHERE consumer_number = %s", (data["consumer_number"],))
                            row_bk = cursor.fetchone()
                            if row_bk and row_bk.get("customer_name"):
                                data["consumer_name"] = row_bk["customer_name"]
                        conn.close()
                except Exception as e:
                    logger.error(f"DB Name Fallback failed: {e}")

            # ── 3. Bill Month ───────────────────────────────────────────────
            months_map = {
                "JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
                "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12,
                "जानेवारी": 1, "जाने": 1, "फेब्रुवारी": 2, "फेब्रु": 2,
                "मार्च": 3, "एप्रिल": 4, "मे": 5, "जून": 6, "जुलै": 7,
                "ऑगस्ट": 8, "ऑग": 8, "सप्टेंबर": 9, "सप्टें": 9, "ऑक्टोबर": 10,
                "ऑक्टो": 10, "नोव्हेंबर": 11, "नोव्हे": 11, "डिसेंबर": 12, "डिसें": 12
            }
            
            # Translate Marathi numerals to English
            trans_table = str.maketrans("०१२३४५६७८९", "0123456789")
            text_trans = text.translate(trans_table)
            
            month_match = re.search(
                r"(?:FOR\s+THE\s+MONTH\s+OF|Bill\s*Month|बिल\s*महिना)\s*:?\s*([A-Za-z]+|[\u0900-\u097F]+)[-\s,]*(\d{4})",
                text_trans, re.IGNORECASE
            )
            
            if month_match:
                m_str = month_match.group(1).upper()
                yr = month_match.group(2)
                
                m_idx = None
                for k, v in months_map.items():
                    if m_str.startswith(k.upper()) or m_str.startswith(k):
                        m_idx = v
                        break
                
                if m_idx:
                    data["bill_month_date"] = f"{yr}-{m_idx:02d}-01"
            
            if not data.get("bill_month_date") and default_date:
                data["bill_month_date"] = default_date

            # ── 4. Reading Date ─────────────────────────────────────────────
            # Support Marathi, English, and Mojibake reading date labels (Issue #Naresh)
            # चालू/चालु रिडींग/रिडिंग दिनांक : 20-03-2026
            # Mojibake patterns often found: '°îîÑîõ', 'ïÏï¸ëë¬î', 'ï¿Æîîë´ø'
            
            # Step 1: Highly specific match
            rd_match = re.search(r"(?:Reading|Current|वाचन|रीडिंग|रिडींग|रिडिंग|मीटर\s*वाचन|चालू?\s*[रर][ीि]ड[ीि]?ं?ंग|°îîÑîõ|ïÏï¸ëë¬î)\s*(?:Date|दिनांक|तारीख|ï¿Æîîë´ø|ï¿Æîë´ø)?\s*[:\-]*\s*(\d{2}[-/]\d{2}[-/]\d{4})", text_trans, re.IGNORECASE)
            
            if not rd_match:
                # Step 2: More flexible fallback match
                for m in re.finditer(r"(\d{2}[-/]\d{2}[-/]\d{4})", text_trans):
                    d_str = m.group(1)
                    start_idx = m.start()
                    context = text_trans[max(0, start_idx-50):start_idx].upper()
                    
                    # Exclusions
                    if any(x in context for x in ["AGREEMENT", "COMMISSION", "PURVATHA", "पुरवठा", "मंजूर", "SUPPLY"]):
                        continue
                    
                    # Labels (Including Mojibake)
                    if any(x in context for x in ["DATE", "दिनांक", "तारीख", "READING", "CURRENT", "चालू", "रीडिंग", "रिडिंग", "BILL", "ï¿Æîîë´ø", "ï¿Æîë´ø", "°îîÑîõ", "ïÏï¸ëë¬î"]):
                        raw_rd = d_str.replace("/", "-")
                        try:
                            data["reading_date"] = datetime.strptime(raw_rd, "%d-%m-%Y").strftime("%Y-%m-%d")
                            # We keep looking to find the *best/specific* one if possible, 
                            # but usually the one with 'Reading' label is what we want.
                            if any(r in context for r in ["READING", "CURRENT", "चालू", "रीडिंग", "रिडिंग", "°îîÑîõ", "ïÏï¸ëë¬î"]):
                                break 
                        except: pass
            
            if rd_match:
                raw_rd = rd_match.group(1).replace("/", "-")
                try:
                    data["reading_date"] = datetime.strptime(raw_rd, "%d-%m-%Y").strftime("%Y-%m-%d")
                except: pass

            # ── 5. Solar Units (Import / Export / Generation) ───────────────
            # Extraction based on consumption table columns
            # Column mapping: Import -> Imp, Export -> Exp, Generation -> Gen
            
            # Pattern for "TOTAL" row in consumption table
            total_match = re.search(
                r"TOTAL\s+"
                r"([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+" # Import: curr, prev, units (consumption)
                r"([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+" # Export: curr, prev, units (consumption)
                r"([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)",   # Generation: curr, prev, units (consumption)
                text, re.IGNORECASE
            )
            if total_match:
                data["import_units"]     = num(total_match.group(3)) # Units column for Import
                data["export_units"]     = num(total_match.group(6)) # Units column for Export
                data["generation_units"] = num(total_match.group(9)) # Units column for Generation
                
            # Alternative: Search for table headers and values directly
            if data["import_units"] == 0.0 and data["generation_units"] == 0.0:
                # Try locating IMP EXP GEN columns
                # Values often appear in a row below headers or matched by lines
                consumption_vals = re.findall(r"([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)", text)
                # Look for suspicious blocks that match the IMP EXP GEN layout
                for row in consumption_vals:
                    # In solar bills, these are often the last three columns of a row
                    pass # Keep seeking robust pattern

                imp_m = re.search(r"Import\s+[\d,.]+\s+[\d,.]+\s+[\d,.]+\s+([\d,.]+)", text, re.IGNORECASE)
                if imp_m: data["import_units"] = num(imp_m.group(1))

                exp_m = re.search(r"Export\s+[\d,.]+\s+[\d,.]+\s+[\d,.]+\s+([\d,.]+)", text, re.IGNORECASE)
                if exp_m: data["export_units"] = num(exp_m.group(1))

                gen_m = re.search(r"Generation\s+[\d,.]+\s+[\d,.]+\s+[\d,.]+\s+([\d,.]+)", text, re.IGNORECASE)
                if gen_m: data["generation_units"] = num(gen_m.group(1))

            # ── 6. Banked Units ─────────────────────────────────────────────
            # Support Marathi: "मागील बँक युनिट" (Prev), "बँक युनिट" or "सौर बँक युनिट" (Current)
            # Standard Labels: "Previous Banked", "Current Banked", "Prev Bank Units", "Bank Solar Units"
            
            # ── 6. Banked Units (HIGH-ROBUSTNESS EXTRACTION) ───────────────
            # This scanner is specifically designed for the messy jumbled lines in portal PDFs
            found_in_white_table = False
            lines = text.split('\n')
            
            # Step A: Identify the anchor row for the Bank Units table
            # We look for any of the 3 specific headers in that row
            for i, line in enumerate(lines):
                if any(h in line for h in ["Export offset", "Bank Solar Units", "Prev Bank Units"]):
                    # Scan the NEXT 4 lines after the anchor for the actual values.
                    # The anchor line and the 'Solar' line (offset+1) are label/history rows
                    # that start with text. The ACTUAL values row ALWAYS starts with a digit.
                    for offset in range(0, 5): 
                        if i + offset >= len(lines): break
                        
                        target_row = lines[i + offset]
                        
                        # KEY FIX: Only process rows that START with a digit.
                        # The actual values row looks like: '170 835 705 ...'
                        # Label rows like 'Export offset...', 'Solar...' start with text → skip.
                        # This replaces the old year+dash heuristic that was too broad
                        # and accidentally skipped the actual values row as well.
                        line_stripped = target_row.strip()
                        if not line_stripped or not re.match(r'^\d', line_stripped):
                            continue
                            
                        # Extract numeric blocks
                        row_vals = re.findall(r"(\d+[\d,.]*)", target_row)
                        
                        # Filter out common years (safety check)
                        clean_vals = [v for v in row_vals if v not in ["2024", "2025", "2026", "2027"]]
                        
                        # Validation: the bank row MUST have at least 3 values [Offset, BSU, PBU]
                        if len(clean_vals) >= 3:
                            # We found it! Layout: clean_vals[0]=offset, [1]=BSU, [2]=PBU
                            data["bank_solar_units"] = num(clean_vals[1])
                            data["prev_bank_units"] = num(clean_vals[2])
                            
                            logger.info(
                                f"✓ REINFORCED CATCH (Anchor+{offset}): "
                                f"BSU={data['bank_solar_units']}, PBU={data['prev_bank_units']} "
                                f"| Row: '{target_row[:60]}'"
                            )
                            found_in_white_table = True
                            break
                    if found_in_white_table: break
            
            # Step B: Marathi Fallback (Only if white table scan completely failed)
            if not found_in_white_table or (data["bank_solar_units"] == 0 and data["prev_bank_units"] == 0):
                # "बँक युनिट" or "सौर बँक युनिट" (Current)
                m_curr = re.search(r"(?:बँक\s+युनिट)[\s\t]*[:.\-]?[\s\t]*(\d+)", text, re.IGNORECASE)
                if m_curr: data["bank_solar_units"] = num(m_curr.group(1))
                
                # "मागील बँक युनिट" (Prev)
                m_prev = re.search(r"(?:मागील\s+बँक\s+युनिट)[\s\t]*[:.\-]?[\s\t]*(\d+)", text, re.IGNORECASE)
                if m_prev: data["prev_bank_units"] = num(m_prev.group(1))
                
                if m_curr or m_prev:
                    logger.info(f"✓ Marathi Fallback Catch: BSU={data['bank_solar_units']}, PBU={data['prev_bank_units']}")
            
            # Rule #3 Final Safety (Years 2024-2027 should never be banked units)
            for key in ["bank_solar_units", "prev_bank_units"]:
                if data[key] in [2024, 2025, 2026, 2027]: data[key] = 0.0
            

            # ── 7. Total Bill Amount ────────────────────────────────────────
            amt_match = re.search(r"(?:Total\s+Bill\s*\(Rounded\)|Amount\s+Payable|TOTAL\s+CURRENT\s+BILL|देयक\s+रक्कम)\s*:?\s*Rs\.?\s*([\d,]+\.\d{2})", text, re.IGNORECASE)
            if not amt_match:
                 # try without Rs.
                 amt_match = re.search(r"(?:Total\s+Bill\s*\(Rounded\)|Amount\s+Payable|TOTAL\s+CURRENT\s+BILL|देयक\s+रक्कम)\s*:?\s*([\d,]+\.\d{2})", text, re.IGNORECASE)
            
            if amt_match:
                data["billing_amount"] = num(amt_match.group(1))
            
            # Native layout backup (often explicitly says Rs.)
            if data["billing_amount"] == 0.0:
                rs_match = re.search(r"Rs\.?\s*([\d,\.]+)", text)
                if rs_match: data["billing_amount"] = num(rs_match.group(1))

            # ── 8. Solar Capacity ───────────────────────────────────────────
            # Support variations: "Solar Generation Capacity", "Sanctioned Load", "मंजुर भार", "SOLAR NET METER (5.00KW)"
            cap_match = re.search(r"(?:Solar\s+Generation\s+Capacity|Capacity|Sanctioned\s*Load|मंजुर\s*भार|SOLAR\s+NET\s+METER)\s*(?:\(KW\))?\s*[:\-\(]*\s*([\d.]+)\s*(?:KW)?\)?", text, re.IGNORECASE)
            if cap_match:
                data["capacity"] = float(cap_match.group(1))

            # ── 9. Bill Status ──────────────────────────────────────────────
            status_match = re.search(r"(?:Bill\s*Status|देयक\s*स्थिती|बिल\s*स्थिती)\s*[:\-]?\s*([A-Za-z\u0900-\u097F]+)", text, re.IGNORECASE)
            if status_match:
                raw_status = status_match.group(1).strip()
                if "सामान्य" in raw_status or raw_status.lower() == "normal":
                    data["bill_status"] = "Normal"
                else:
                    data["bill_status"] = raw_status
            else:
                if "सामान्य" in text or "NORMAL" in text.upper():
                    data["bill_status"] = "Normal"


            # ── DEBUG: Log extracted data to file for troubleshooting ─────────
            try:
                debug_dir = os.path.dirname(pdf_path)
                debug_path = os.path.join(debug_dir, "extraction_debug.log")
                with open(debug_path, "a", encoding="utf-8") as dbg:
                    dbg.write(f"\n{'='*60}\n")
                    dbg.write(f"File: {os.path.basename(pdf_path)}\n")
                    dbg.write(f"Time: {datetime.now().isoformat()}\n")
                    dbg.write(f"Extracted: {json.dumps(data, default=str, indent=2)}\n")
            except Exception as dbg_err:
                logger.debug(f"Debug log write failed: {dbg_err}")

            return data

    except Exception as e:
        logger.error(f"Error extracting data from {pdf_path}: {e}")
        return None

def process_downloads(download_dir="downloads", progress_callback=None, threshold=75):
    """
    Iterates through downloaded PDFs (recursively) and read extracted caches to save to MySQL.
    Also generates Poor and Zero generation reports.
    """
    import glob
    import re
    import json
    import csv
    logger.info(f"--- STARTING PROCESS_DOWNLOADS for dir: {download_dir} ---")
    
    # We use dictionaries to avoid duplicates and track results
    results_map = {} # consumer_num -> status ('success' or 'failed')
    all_extracted_data = []
    conn = get_db_connection()

    if not os.path.exists(download_dir):
        logger.error(f"Directory DOES NOT EXIST: {download_dir}")
        return {"success": [], "failed": []}

    # 1. READ CACHE
    cache_path = os.path.join(download_dir, "extracted_cache.json")
    cached_records = []
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r") as f:
                cached_records = json.load(f)
            logger.info(f"Loaded {len(cached_records)} records from {cache_path}")
        except Exception as e:
            logger.error(f"Failed to read cache: {e}")

    # 2. READ STRAGGLER PDFs
    pdf_pattern = os.path.join(download_dir, "**", "*.pdf")
    pdf_files = glob.glob(pdf_pattern, recursive=True)
    logger.info(f"Recursive search found {len(pdf_files)} straggler PDFs.")
    
    total_files = len(cached_records) + len(pdf_files)
    if progress_callback:
        progress_callback(0, total_files)

    idx_counter = 0
    dir_name = os.path.basename(os.path.normpath(download_dir))
    default_d = dir_name if re.match(r"\d{4}-\d{2}-\d{2}", dir_name) else None

    # Process cache
    for record in cached_records:
        consumer_num = str(record.get("consumer_number", "N/A"))
        if not record.get("bill_month_date") and default_d:
            record["bill_month_date"] = default_d

        if not record.get("bill_month_date"):
            results_map[consumer_num] = "failed"
        else:
            save_status = save_to_mysql(record, conn=conn)
            if save_status in (True, "exists"):
                results_map[consumer_num] = "success"
                all_extracted_data.append(record)
            elif save_status == "not_found":
                results_map[consumer_num] = "not_found"
            else:
                results_map[consumer_num] = "failed"
                
        idx_counter += 1
        if progress_callback: progress_callback(idx_counter, total_files)

    # Process remaining PDFs (Only if not already successful from cache)
    for file_path in pdf_files:
        filename = os.path.basename(file_path)
        
        cnum_match = re.search(r'(\d{10,12})', filename)
        fallback_cnum = cnum_match.group(1) if cnum_match else filename
        
        # SKIP if already successful
        if results_map.get(str(fallback_cnum)) == "success":
            logger.info(f"Skipping PDF for {fallback_cnum} as it was already successful from cache.")
            idx_counter += 1
            if progress_callback: progress_callback(idx_counter, total_files)
            continue

        logger.info(f"Processing remaining file: {filename}")
        extracted_data = extract_data_from_pdf(file_path, default_date=default_d)
        
        if not extracted_data:
            results_map[str(fallback_cnum)] = "failed"
        else:
            consumer_num = str(extracted_data.get("consumer_number", fallback_cnum))
            
            # Re-check with the actual extracted number
            if results_map.get(consumer_num) == "success":
                logger.info(f"Skipping PDF for {consumer_num} as it was already successful from cache.")
                idx_counter += 1
                if progress_callback: progress_callback(idx_counter, total_files)
                continue
                
            if not extracted_data.get("bill_month_date"):
                results_map[consumer_num] = "failed"
            else:
                save_status = save_to_mysql(extracted_data, conn=conn)
                if save_status in (True, "exists"):
                    results_map[consumer_num] = "success"
                    all_extracted_data.append(extracted_data)
                    # Delete the PDF after DB save
                    try:
                        os.remove(file_path)
                    except: pass
                elif save_status == "not_found":
                    results_map[consumer_num] = "not_found"
                else:
                    results_map[consumer_num] = "failed"
                    
        idx_counter += 1
        if progress_callback: progress_callback(idx_counter, total_files)
    
    # Generate Reports
    generate_generation_reports(download_dir, all_extracted_data, threshold=threshold)

    # Final results lists (unique)
    success_list = sorted(list(set([c for c, status in results_map.items() if status == "success"])))
    not_in_db_list = sorted(list(set([c for c, status in results_map.items() if status == "not_found"])))
    failed_list = sorted(list(set([c for c, status in results_map.items() if status == "failed" and c not in success_list and c not in not_in_db_list])))
    
    # Optionally delete the cache path after completion
    if os.path.exists(cache_path):
        try: os.remove(cache_path)
        except: pass

    if conn:
        try:
            conn.close()
        except Exception:
            pass
        
    logger.info(f"--- FINISHED PROCESS_DOWNLOADS. Success: {len(success_list)}, Not in DB: {len(not_in_db_list)}, Failed: {len(failed_list)} ---")
    return {"success": success_list, "failed": failed_list, "not_in_db": not_in_db_list}


def generate_generation_reports(target_dir, data_list, threshold=75):
    """Generates zero_generation, poor_generation, export_greater_than_generation, and bill_status_other_than_normal Excel reports."""
    import pandas as pd
    
    zero_gen = []
    poor_gen = []
    export_gt_gen = []
    status_not_normal = []
    
    logger.info(f"Generating Excel reports for {len(data_list)} records (threshold: {threshold})...")
    for item in data_list:
        try:
            gen = _safe_float(item.get("generation_units") or item.get("generated") or item.get("Generation"))
            cap = _safe_float(item.get("capacity") or item.get("solar_capacity_kw") or item.get("Capacity"))
            exp = _safe_float(item.get("export_units") or item.get("export") or item.get("Export"))
            status = item.get("bill_status") or item.get("bill_status_other") or "Normal"
            
            cnum = item.get("consumer_number") or item.get("consumer_no") or "N/A"
            cname = item.get("consumer_name") or item.get("customer_name") or "N/A"
            
            row = {
                "Consumer Number": cnum,
                "Consumer Name": cname,
                "Capacity (kW)": cap,
                "Generation (kWh)": gen,
                "Export (kWh)": exp,
                "Bill Status": status
            }
            
            # a) Zero Generation
            if gen == 0:
                zero_gen.append(row)
                
            # b) Poor Generation
            if cap > 0 and (gen / cap) <= threshold:
                poor_gen.append(row)
            elif cap == 0 and gen < (threshold * 0.5):
                poor_gen.append(row)
                
            # c) Export greater than generation
            if exp > gen:
                export_gt_gen.append(row)
                
            # d) Bill status other than Normal
            if status != "Normal":
                status_not_normal.append(row)
                
        except Exception as e:
            logger.error(f"Error processing item for report: {e}")
            continue

    # Local Report structure: arin/Report/[Date]/
    arin_root = os.path.dirname(os.path.normpath(target_dir))
    date_str = os.path.basename(os.path.normpath(target_dir))
    
    # Format date for readability (e.g., 6 April 2026)
    formatted_date = date_str
    try:
        from datetime import datetime
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        formatted_date = dt.strftime("%d %B %Y").lstrip('0')
    except: pass

    report_local_dir = os.path.join(arin_root, "Report", formatted_date)
    os.makedirs(report_local_dir, exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    reports = {
        f"zero_generation_{timestamp}.xlsx": zero_gen,
        f"poor_generation_{timestamp}.xlsx": poor_gen,
        f"export_greater_than_generation_{timestamp}.xlsx": export_gt_gen,
        f"bill_status_other_than_normal_{timestamp}.xlsx": status_not_normal
    }
    
    for filename, rows in reports.items():
        filepath = os.path.join(report_local_dir, filename)
        if rows:
            df = pd.DataFrame(rows)
        else:
            df = pd.DataFrame(columns=["Consumer Number", "Consumer Name", "Capacity (kW)", "Generation (kWh)", "Export (kWh)", "Bill Status"])
        
        try:
            df.to_excel(filepath, index=False)
            logger.info(f"Generated report: {filepath} with {len(rows)} rows.")
        except Exception as ex_err:
            logger.error(f"Failed to generate Excel report {filename}: {ex_err}")



def _safe_float(val):
    """Safely convert any value (string, int, float, None) to float."""
    if val is None:
        return 0.0
    if isinstance(val, str):
        val = val.replace(',', '').strip()
        if not val or val == 'N/A':
            return 0.0
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0


# ═══════════════════════════════════════════════════════════════════════════════
# DATA VALIDATION LAYER — Prevents corrupted/garbage values from reaching DB
# ═══════════════════════════════════════════════════════════════════════════════

def _validate_bill_data(consumer_number, import_units, export_units, generation_units,
                        prev_bank_units, bank_solar_units, billing_amount):
    """
    Validates extracted bill data before DB insertion.
    Returns (validated_dict, warnings_list).
    Fixes the 0→2 corruption bug by ensuring values are within sane ranges.
    """
    warnings = []
    validated = {
        'import_units': import_units,
        'export_units': export_units,
        'generation_units': generation_units,
        'prev_bank_units': prev_bank_units,
        'bank_solar_units': bank_solar_units,
        'billing_amount': billing_amount
    }

    # Rule 1: Amount must be >= 0 and <= 500000 (reasonable cap for solar bills)
    if billing_amount < 0 or billing_amount > 500000:
        warnings.append(f"billing_amount={billing_amount} out of range [0-500000], zeroed")
        validated['billing_amount'] = 0.0

    # Rule 1B: The notorious "0 becomes 2" OCR glitch in MSEDCL PDFs
    # MSEDCL standard bills are rarely exactly 2 Rs, if OCR extracts "0" as "2", we force it to 0.
    if validated['billing_amount'] == 2.0 or validated['billing_amount'] == 2:
        warnings.append("billing_amount=2 detected (known MSEDCL PDFPlumber glitch for 0), forced to 0.0")
        validated['billing_amount'] = 0.0

    # Rule 2: All unit values must be non-negative
    for key in ['import_units', 'export_units', 'generation_units',
                'prev_bank_units', 'bank_solar_units']:
        val = validated[key]
        if val < 0:
            warnings.append(f"{key}={val} is negative, zeroed")
            validated[key] = 0.0

    # Rule 3: Units should not be absurdly large (> 100000 for a single month)
    for key in ['import_units', 'export_units', 'generation_units']:
        val = validated[key]
        if val > 100000:
            warnings.append(f"{key}={val} exceeds 100000, possible OCR error")

    # Rule 4: Banked units sanity — should not equal year values
    for key in ['prev_bank_units', 'bank_solar_units']:
        val = validated[key]
        if val in [2024, 2025, 2026, 2027, 2028]:
            warnings.append(f"{key}={val} looks like a year, zeroed")
            validated[key] = 0.0

    # Rule 5: Cross-validation warning (non-blocking)
    gen = validated['generation_units']
    imp = validated['import_units']
    exp = validated['export_units']
    if gen > 0 and (imp + exp) > 0:
        ratio = gen / (imp + exp)
        if ratio < 0.3 or ratio > 3.0:
            warnings.append(f"Cross-validation: gen={gen} vs imp+exp={imp+exp} (ratio={ratio:.2f})")

    if warnings:
        logger.warning(f"[VALIDATION] {consumer_number}: {'; '.join(warnings)}")

    return validated, warnings


def save_to_mysql(bill_data, conn=None):
    consumer_number = bill_data.get('consumer_number', 'N/A')

    # ── KEY NORMALISATION ────────────────────────────────────────────────────
    import_units     = _safe_float(bill_data.get('import_units') or bill_data.get('import'))
    export_units     = _safe_float(bill_data.get('export_units') or bill_data.get('export'))
    generation_units = _safe_float(bill_data.get('generation_units') or bill_data.get('generated'))
    prev_bank_units  = _safe_float(bill_data.get('prev_bank_units') or bill_data.get('prev_banked'))
    bank_solar_units = _safe_float(bill_data.get('bank_solar_units') or bill_data.get('curr_banked'))
    billing_amount   = _safe_float(bill_data.get('billing_amount') or bill_data.get('amount'))

    bill_month_date  = bill_data.get('bill_month_date') or bill_data.get('bill_month')
    reading_date_raw = bill_data.get('reading_date') or bill_data.get('bill_date')

    # ── PRE-SAVE VALIDATION ─────────────────────────────────────────────────
    validated, val_warnings = _validate_bill_data(
        consumer_number, import_units, export_units, generation_units,
        prev_bank_units, bank_solar_units, billing_amount
    )
    import_units     = validated['import_units']
    export_units     = validated['export_units']
    generation_units = validated['generation_units']
    prev_bank_units  = validated['prev_bank_units']
    bank_solar_units = validated['bank_solar_units']
    billing_amount   = validated['billing_amount']

    logger.info(
        f"[PRE-SAVE] consumer={consumer_number} | "
        f"imp={import_units} exp={export_units} gen={generation_units} "
        f"pbk={prev_bank_units} bsu={bank_solar_units} "
        f"amt={billing_amount} | month={bill_month_date} reading={reading_date_raw}"
    )

    local_conn = conn or get_db_connection()
    if not local_conn:
        logger.error("No DB connection available.")
        return False

    try:
        if conn and hasattr(local_conn, "ping"):
            local_conn.ping(reconnect=True, attempts=1, delay=0)
    except Exception:
        pass

    try:
        cursor = local_conn.cursor(dictionary=True)

        # ── 1. Discover actual columns in both tables ──
        cursor.execute("DESCRIBE bill_generation_details")
        bill_cols = [row['Field'] for row in cursor.fetchall()]

        cursor.execute("DESCRIBE customers")
        cursor.fetchall()

        # ── 2. Parse dates ──
        def parse_date(val):
            if not val or val == 'N/A':
                return None
            if isinstance(val, (dt_mod.datetime, dt_mod.date)):
                return val.strftime('%Y-%m-%d')

            val_str = str(val).strip()
            for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%b %Y', '%B %Y', '%b%Y', '%B%Y'):
                try:
                    return dt_mod.datetime.strptime(val_str, fmt).strftime('%Y-%m-%d')
                except Exception:
                    pass
            return None

        m_year = parse_date(bill_month_date)
        r_date = parse_date(reading_date_raw) or m_year

        if not m_year:
            if re.match(r"\d{4}-\d{2}-\d{2}", str(bill_month_date)):
                m_year = str(bill_month_date)
            else:
                logger.warning(f"Skipping {consumer_number}: missing/invalid year month '{bill_month_date}'")
                return False

        # ── 3. CHECK IF CUSTOMER EXISTS ──
        cursor.execute("SELECT id FROM customers WHERE consumer_number = %s", (consumer_number,))
        cust_found = cursor.fetchone()

        if not cust_found:
            cursor.execute("SELECT id, customer_name FROM customers_backup WHERE consumer_number = %s", (consumer_number,))
            cust_bkp = cursor.fetchone()
            if cust_bkp:
                customer_internal_id = cust_bkp['id']
            else:
                logger.warning(f"Consumer {consumer_number} not found in database. Skipping save as requested.")
                return "not_found"
        else:
            customer_internal_id = cust_found['id']

        # ── 4. MAP DATA TO COLUMNS ──
        val_map = {
            'customer_id': customer_internal_id,
            'consumer_number': consumer_number,
            'month_year': m_year,
            'bill_month': m_year,
            'reading_date': r_date,
            'bill_date': r_date,
            'import_units': import_units,
            'export_units': export_units,
            'generation_units': generation_units,
            'prev_bank_units': prev_bank_units,
            'bank_solar_units': bank_solar_units,
            'billing_amount': billing_amount,
            'import': import_units,
            'export': export_units,
            'generated': generation_units,
            'amount': billing_amount,
            'bill_status': bill_data.get('bill_status', 'Normal'),
        }

        cols_to_use = [c for c in bill_cols if c in val_map and val_map[c] is not None]
        vals_to_use = [val_map[c] for c in cols_to_use]

        cursor.execute(
            "SELECT id FROM bill_generation_details WHERE consumer_number = %s AND month_year = %s",
            (consumer_number, m_year)
        )
        existing_record = cursor.fetchone()

        if existing_record:
            logger.info(f"✓ SKIPPING EXISTING DB RECORD: {consumer_number} for {m_year}")
            return "exists"
        else:
            placeholders = ", ".join(["%s"] * len(cols_to_use))
            col_names = ", ".join(cols_to_use)
            insert_query = f"INSERT INTO bill_generation_details ({col_names}) VALUES ({placeholders})"
            cursor.execute(insert_query, tuple(vals_to_use))
            local_conn.commit()
            record_id = cursor.lastrowid
            logger.info(f"✓ SAVED NEW RECORD: {consumer_number} for {m_year}")

        try:
            cursor2 = local_conn.cursor(dictionary=True)
            cursor2.execute(
                "SELECT billing_amount, import_units, export_units, generation_units, prev_bank_units, bank_solar_units FROM bill_generation_details WHERE id = %s",
                (record_id,)
            )
            saved_row = cursor2.fetchone()
            cursor2.close()

            if saved_row:
                checks = [
                    ('billing_amount', billing_amount, float(saved_row.get('billing_amount', 0))),
                    ('import_units', import_units, float(saved_row.get('import_units', 0))),
                    ('export_units', export_units, float(saved_row.get('export_units', 0))),
                ]
                for field, expected, actual in checks:
                    if abs(expected - actual) > 0.01:
                        logger.error(
                            f"⚠ DATA INTEGRITY MISMATCH for {consumer_number} [{field}]: expected={expected}, saved={actual}"
                        )
        except Exception as verify_err:
            logger.warning(f"Post-save verification failed: {verify_err}")

        cursor.close()
        return True

    except Exception as e:
        logger.error(f"MySQL store error for {consumer_number}: {e}")
        import traceback
        logger.error(traceback.format_exc())
        if local_conn:
            local_conn.rollback()
        return False
    finally:
        if conn is None and local_conn:
            local_conn.close()


def get_all_bills():
    """
    Fetches all bills from MySQL joined with customer details.
    """
    conn = get_db_connection()
    if not conn: return []
    
    try:
        cursor = conn.cursor(dictionary=True)
        
        # 1. Discover columns to build a safe query
        cursor.execute("DESCRIBE bill_generation_details")
        b_cols = [row['Field'] for row in cursor.fetchall()]
        
        # 2. Build the JOIN query based on available columns
        if 'customer_id' in b_cols:
            join_clause = "ON b.customer_id = c.id"
        elif 'consumer_number' in b_cols:
            join_clause = "ON b.consumer_number = c.consumer_number"
        else:
            # If no join column found, just return bill details
            cursor.execute("SELECT * FROM bill_generation_details ORDER BY month_year DESC")
            return _process_rows(cursor.fetchall())

        query = f"""
            SELECT 
                b.*, 
                c.customer_name, 
                c.solar_capacity_kw as capacity, 
                c.commission_date,
                c.arin_id,
                c.panel_name,
                c.inverter_name,
                c.zone,
                c.is_blacklisted
            FROM bill_generation_details b
            LEFT JOIN customers c {join_clause}
            ORDER BY b.month_year DESC
        """
        
        cursor.execute(query)
        rows = cursor.fetchall()
        
        # Deduplicate bills by (consumer_number, month_year)
        seen = set()
        deduped = []
        for r in rows:
            key = (r.get("consumer_number"), r.get("month_year"))
            if key not in seen:
                seen.add(key)
                deduped.append(r)
        return _process_rows(deduped)

    except Exception as e:
        logger.error(f"MySQL fetch error: {e}")
        return []
    finally:
        if conn: conn.close()

def _process_rows(rows):
    """Helper to convert MySQL types for JSON conversion."""
    for row in rows:
        for key, val in row.items():
            # Check for both datetime and date objects
            if isinstance(val, dt_mod.datetime) or isinstance(val, dt_mod.date):
                row[key] = val.isoformat()
            elif isinstance(val, decimal.Decimal):
                row[key] = float(val)
            elif hasattr(val, '__float__') and not isinstance(val, (int, float, str)):
                row[key] = float(val)
    
    logger.info(f"[get_all_bills] Processed {len(rows)} rows for JSON")
    return rows

def get_dashboard_stats():
    bills = get_all_bills()
    if not bills:
        total_consumers = 0
        conn = get_db_connection()
        if conn:
            try:
                cursor = conn.cursor()
                cursor.execute("SELECT COUNT(DISTINCT consumer_number) FROM customers")
                total_consumers = cursor.fetchone()[0]
                if total_consumers == 0:
                    cursor.execute("SELECT COUNT(DISTINCT consumer_number) FROM customers_backup")
                    total_consumers = cursor.fetchone()[0]
            except Exception as e:
                logger.error(f"Error getting total consumers count: {e}")
            finally:
                conn.close()
        return {
            "totalConsumers": total_consumers,
            "totalBills": 0,
            "energySaved": "0 kWh",
            "pendingCount": 0,
            "totalAmount": 0,
            "areaDistribution": [],
            "healthDistribution": [],
            "statusDistribution": [],
            "monthDistribution": [],
            "generationDistribution": [],
            "revenueDistribution": [],
            "areaRevenue": [],
            "hourlyActivity": [],
            "recentBills": [],
            "dailyDistribution": []
        }
    
    total_bills = len(bills)
    
    # Calculate unique registered consumers directly from the customers table
    total_consumers = 0
    conn = get_db_connection()
    if conn:
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(DISTINCT consumer_number) FROM customers")
            total_consumers = cursor.fetchone()[0]
            if total_consumers == 0:
                cursor.execute("SELECT COUNT(DISTINCT consumer_number) FROM customers_backup")
                total_consumers = cursor.fetchone()[0]
        except Exception as e:
            logger.error(f"Error getting total consumers count: {e}")
            total_consumers = len(set(b.get("consumer_number") for b in bills))
        finally:
            conn.close()
    else:
        total_consumers = len(set(b.get("consumer_number") for b in bills))
        
    total_amount = sum(float(b.get("billing_amount", 0)) for b in bills)
    
    # Simple mapping for UI compatibility
    processed_bills = []
    for b in bills:
        processed_bills.append({
            "consumer_number": b.get("consumer_number"),
            "bill_month": b.get("month_year"),
            "import": b.get("import_units"),
            "export": b.get("export_units"),
            "generated": b.get("generation_units"),
            "amount": b.get("billing_amount"),
            "reading_date": b.get("reading_date"),
            "prev_banked": b.get("prev_bank_units"),
            "curr_banked": b.get("bank_solar_units"),
            "capacity": b.get("capacity") or b.get("solar_capacity_kw") or 0,
            "consumer_name": b.get("customer_name") or b.get("consumer_name") or "N/A",
            "arin_id": b.get("arin_id") or "N/A"
        })

    return {
        "totalConsumers": total_consumers,
        "totalBills": total_bills,
        "energySaved": "N/A", # Calculated if needed
        "totalAmount": round(total_amount, 2),
        "recentBills": processed_bills[:10],
        # Add placeholders for other charts to avoid UI crashes
        "areaDistribution": [],
        "healthDistribution": [],
        "statusDistribution": [],
        "monthDistribution": [],
        "generationDistribution": [],
        "revenueDistribution": [],
        "areaRevenue": [],
        "hourlyActivity": []
    }

def delete_customer_from_db(consumer_number):
    """Deletes a customer profile and their associated bills from the database."""
    conn = get_db_connection()
    if not conn:
        return False, "Failed to connect to database."
    try:
        cursor = conn.cursor()
        
        # 1. Delete from customers table
        cursor.execute("DELETE FROM customers WHERE consumer_number = %s", (consumer_number,))
        
        # 2. Delete from customers_backup table
        cursor.execute("DELETE FROM customers_backup WHERE consumer_number = %s", (consumer_number,))
        
        # 3. Delete associated bills from bill_generation_details
        try:
            cursor.execute("DELETE FROM bill_generation_details WHERE consumer_number = %s", (consumer_number,))
        except Exception as e:
            logger.warning(f"Could not delete bills by consumer_number: {e}")
            try:
                cursor.execute("DELETE FROM bill_generation_details WHERE customer_id = (SELECT id FROM customers WHERE consumer_number = %s)", (consumer_number,))
            except Exception as e2:
                logger.warning(f"Could not delete bills by customer_id: {e2}")
                
        conn.commit()
        cursor.close()
        logger.info(f"Successfully deleted customer {consumer_number} and all their associated data.")
        return True, "Customer profile and bills deleted successfully."
    except Exception as e:
        logger.error(f"Error deleting customer {consumer_number}: {e}")
        conn.rollback()
        return False, str(e)
    finally:
        conn.close()

def deduplicate_database_profiles():
    """Finds all duplicate consumer profiles and deletes subsequent ones, keeping the oldest/first entry."""
    conn = get_db_connection()
    if not conn:
        return False, "Failed to connect to database."
    try:
        cursor = conn.cursor(dictionary=True)
        
        # Find all duplicate consumer numbers
        cursor.execute("""
            SELECT consumer_number, GROUP_CONCAT(id ORDER BY id ASC) as ids_list, COUNT(*) as cnt
            FROM customers
            GROUP BY consumer_number
            HAVING cnt > 1
        """)
        dupes = cursor.fetchall()
        
        deleted_count = 0
        for d in dupes:
            ids = [int(x) for x in d['ids_list'].split(',')]
            # Keep the first ID (oldest), delete the rest
            ids_to_delete = ids[1:]
            
            # Delete other duplicate records from customers
            format_strings = ','.join(['%s'] * len(ids_to_delete))
            cursor.execute(f"DELETE FROM customers WHERE id IN ({format_strings})", tuple(ids_to_delete))
            deleted_count += cursor.rowcount
            
            # Clean up duplicate backups for this consumer_number as well
            cnum = d['consumer_number']
            cursor.execute("DELETE FROM customers_backup WHERE consumer_number = %s AND id NOT IN (SELECT id FROM customers WHERE consumer_number = %s)", (cnum, cnum))
            
        conn.commit()
        cursor.close()
        logger.info(f"Resolved duplicates: deleted {deleted_count} duplicate profiles.")
        return True, f"Successfully resolved duplicates. Deleted {deleted_count} duplicate profiles."
    except Exception as e:
        logger.error(f"Deduplication failed: {e}")
        conn.rollback()
        return False, str(e)
    finally:
        conn.close()

# Compatibility dummy
collection = "MYSQL_MODE"
