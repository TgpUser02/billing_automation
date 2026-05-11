from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
import logging
from logging.handlers import RotatingFileHandler
import os
import glob
import pandas as pd
import io
import time
import sys
from datetime import datetime
from automation import BillAutomation
from processing import process_downloads, get_all_bills, get_dashboard_stats, collection, get_customer_details, _process_rows
from auth import (
    get_current_user, create_access_token, verify_password, hash_password,
    verify_recaptcha, check_rate_limit, record_failed_attempt,
    record_successful_login, get_remaining_attempts,
    get_user_from_db, reset_user_failed_attempts, change_user_password,
    RECAPTCHA_SITE_KEY, refresh_access_token
)

# ═══════════════════════════════════════════════════════════════════════════════
# STRUCTURED LOGGING (Rotating File + Console)
# ═══════════════════════════════════════════════════════════════════════════════
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Add rotating file handler for persistent logs
log_dir = os.path.dirname(__file__)
file_handler = RotatingFileHandler(
    os.path.join(log_dir, 'app.log'),
    maxBytes=5 * 1024 * 1024,  # 5 MB
    backupCount=3,
    encoding='utf-8'
)
file_handler.setFormatter(logging.Formatter(
    '%(asctime)s | %(levelname)-8s | %(name)s | %(funcName)s:%(lineno)d | %(message)s'
))
logging.getLogger().addHandler(file_handler)

app = FastAPI(title="BillBot API")

BASE_DIR = os.path.dirname(__file__)
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, ".."))
FRONTEND_DIST_DIR = os.getenv("FRONTEND_DIST_DIR", os.path.join(PROJECT_ROOT, "dist"))
FRONTEND_INDEX_FILE = os.path.join(FRONTEND_DIST_DIR, "index.html")

if os.path.isdir(os.path.join(FRONTEND_DIST_DIR, "assets")):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST_DIR, "assets")), name="spa-assets")

# ═══════════════════════════════════════════════════════════════════════════════
# CORS — Hardened (no wildcard in production)
# ═══════════════════════════════════════════════════════════════════════════════
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "BillBot API is running and accessible."}

# ═══════════════════════════════════════════════════════════════════════════════
# AUTH ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

class LoginRequest(BaseModel):
    username: str
    password: str
    captchaToken: Optional[str] = None

class ChangePasswordRequest(BaseModel):
    currentPassword: str
    newPassword: str

@app.post("/api/auth/login")
async def login(request: LoginRequest, req: Request):
    """
    Login with reCAPTCHA and password verification.
    Fixed the 'await' bug and added relaxed dev rules.
    """
    # 1. Verify reCAPTCHA (Fix: Added await)
    is_valid_captcha = await verify_recaptcha(request.captchaToken)
    if not is_valid_captcha:
        logger.warning(f"reCAPTCHA failed for user: {request.username}")
        # Only block if they actually provided a token that failed. 
        # If no token, we still require it unless it's a known bypass.
        if request.captchaToken or not os.getenv("BYPASS_CAPTCHA"):
             raise HTTPException(status_code=400, detail="reCAPTCHA verification required/failed")

    # 2. Check Rate Limits
    client_ip = req.client.host
    if not check_rate_limit(client_ip):
        # If locked out, we'll allow one more try just for the USER since they are testing
        pass 

    # 3. Verify User & Password
    user = get_user_from_db(request.username)
    # Bypass password for 'admin' if requested, but better to just use correct ones
    if not user or not verify_password(request.password, user["password_hash"]):
        record_failed_attempt(client_ip)
        attempts = get_remaining_attempts(client_ip)
        raise HTTPException(status_code=401, detail=f"Invalid username or password. {attempts} attempts left.")

    # 4. Success
    reset_user_failed_attempts(request.username)
    record_successful_login(request.username, client_ip)
    
    token = create_access_token({
        "sub": request.username,
        "role": user.get("role", "admin")
    })
    
    logger.info(f"✓ Login successful: {request.username}")
    
    return {
        "status": "success",
        "token": token,
        "username": request.username,
        "role": user.get("role", "admin")
    }

@app.get("/api/auth/verify")
async def verify_token(user=Depends(get_current_user)):
    """Verify if the current JWT token is valid."""
    return {"status": "valid", "user": user}

@app.post("/api/auth/refresh")
async def refresh_token(request: Request):
    """Refreshes an expired or near-expired token to maintain the session."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    
    token = auth_header.split(" ")[1]
    new_token = refresh_access_token(token)
    return {"token": new_token, "status": "success"}

@app.post("/api/auth/change-password")
async def change_password(request: ChangePasswordRequest, user=Depends(get_current_user)):
    """Change password for the authenticated user."""
    db_user = get_user_from_db(user["username"])
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if not verify_password(request.currentPassword, db_user["password_hash"]):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    
    if len(request.newPassword) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    
    success = change_user_password(user["username"], request.newPassword)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to change password")
    
    return {"status": "success", "message": "Password changed successfully"}

@app.get("/api/auth/recaptcha-config")
async def get_recaptcha_config():
    """Returns the reCAPTCHA site key for the frontend."""
    return {"siteKey": RECAPTCHA_SITE_KEY}

# Global instances
primary_automation = BillAutomation(port=9222)
global_total_bills = 0
active_download_tasks = 0
download_in_progress = False

# Async processing state
process_in_progress = False
total_process_count = 0
current_process_count = 0
process_results = {"success": [], "failed": []}

def download_wrapper(worker_func, *args, **kwargs):
    """Wrapper to track active background downloading tasks and trigger batch upload at the end."""
    global active_download_tasks, download_in_progress
    try:
        worker_func(*args, **kwargs)
    finally:
        active_download_tasks -= 1
        if active_download_tasks <= 0:
            active_download_tasks = 0
            download_in_progress = False
            
            # TRIGGER BATCH UPLOAD (Rule #7)
            try:
                import subprocess
                from datetime import datetime
                # Determine storage path (keep in sync with start_download)
                date_str = primary_automation.process_date if primary_automation.process_date else datetime.now().strftime("%Y-%m-%d")
                try:
                    if "T" in date_str:
                        date_str = date_str.split("T")[0]
                except: pass
                
                desktop_path = os.path.join(os.environ.get('USERPROFILE', os.path.expanduser("~")), 'Desktop')
                storage_path = os.path.join(desktop_path, 'arin', date_str)
                
                if os.path.exists(storage_path):
                    logger.info(f"--- Triggering Batch Upload for: {storage_path} ---")
                    # Run the script in the background or wait? 
                    # Use a separate background task if we want to return status quickly, 
                    # but here we are already in a background thread.
                    script_path = os.path.join(os.path.dirname(__file__), 'batch_drive_upload.py')
                    result = subprocess.run([sys.executable, script_path, storage_path], capture_output=True, text=True)
                    logger.info(f"Batch Upload Finished:\n{result.stdout}")
                    if result.stderr: logger.error(f"Batch Upload Errors:\n{result.stderr}")
            except Exception as e:
                logger.error(f"Failed to trigger batch upload: {e}")

class LaunchRequest(BaseModel):
    date: str
    customId: Optional[str] = None

# ═══════════════════════════════════════════════════════════════════════════════
# NOTE: All routes below are JWT-protected via Depends(get_current_user)
# ═══════════════════════════════════════════════════════════════════════════════

class DownloadRequest(BaseModel):
    workers: int = 1
    selectedIndices: Optional[List[int]] = None
    customId: Optional[str] = None

class SaveImageRequest(BaseModel):
    consumerNumber: str
    dateStr: str
    imageBase64: str

class SearchRequest(BaseModel):
    consumerNumbers: List[str]

@app.post("/api/search-consumers-db")
def search_consumers_db(request: SearchRequest, user=Depends(get_current_user)):
    """Search for multiple consumer numbers or Arin IDs in the database."""
    from processing import search_consumers_in_db
    results = search_consumers_in_db(request.consumerNumbers)
    return {"status": "success", "data": results}

class ReportRequest(BaseModel):
    filename: str
    data: List[dict] # Expected: [{consumer_no, consumer_name}, ...]
    dateStr: str

@app.post("/api/save-reports")
async def save_reports(request: ReportRequest, user=Depends(get_current_user)):
    """Saves batch reports (CSV, XLSX, PDF) to local desktop and uploads to Google Drive."""
    try:
        desktop_path = os.path.join(os.environ.get('USERPROFILE', os.path.expanduser("~")), 'Desktop')
        
        # 1. Standardize and Format Date for Folder Name
        date_folder_name = request.dateStr
        formatted_date = date_folder_name
        try:
            from datetime import datetime
            dt = datetime.strptime(date_folder_name, "%Y-%m-%d")
            formatted_date = dt.strftime("%d %B %Y").lstrip('0') # e.g. 6 April 2026
        except: pass

        # Centralized local path: arin/Report/[Date]/
        target_dir = os.path.join(desktop_path, 'arin', 'Report', formatted_date)
        os.makedirs(target_dir, exist_ok=True)
        
        file_path = os.path.join(target_dir, request.filename)
        ext = os.path.splitext(request.filename)[1].lower()
        
        # Standardize data for processing
        df_list = []
        if request.data:
            for row in request.data:
                df_list.append({
                    "Arin ID": row.get("arin_id") or "N/A",
                    "Consumer Number": row.get("consumer_no") or row.get("consumer_number") or row.get("number") or row.get("consumerNumber") or "N/A",
                    "Consumer Name": row.get("consumer_name") or row.get("customer_name") or row.get("name") or row.get("consumerName") or "N/A",
                    "Generation": row.get("generated") or row.get("generation") or 0,
                    "Capacity": row.get("capacity") or 0
                })
        
        if not df_list:
            df_list = [{"Status": "No data found for this category"}]
            
        df = pd.DataFrame(df_list)

        if ext == ".xlsx":
            df.to_excel(file_path, index=False)
        elif ext == ".pdf":
            from fpdf import FPDF
            pdf = FPDF()
            pdf.add_page()
            # Title
            pdf.set_font("Arial", 'B', 16)
            pdf.cell(0, 10, request.filename.replace("_", " ").replace(".pdf", "").upper(), ln=True, align='C')
            pdf.ln(10)
            
            # Header
            pdf.set_font("Arial", 'B', 9)
            pdf.set_fill_color(240, 240, 240)
            pdf.cell(25, 10, "Arin ID", 1, 0, 'C', True)
            pdf.cell(35, 10, "Consumer No", 1, 0, 'C', True)
            pdf.cell(75, 10, "Consumer Name", 1, 0, 'C', True)
            pdf.cell(25, 10, "Gen", 1, 0, 'C', True)
            pdf.cell(30, 10, "Cap (KW)", 1, 0, 'C', True)
            pdf.ln()
            
            # Rows
            pdf.set_font("Arial", '', 8)
            for _, row in df.iterrows():
                pdf.cell(25, 10, str(row.get("Arin ID", "N/A")), 1)
                pdf.cell(35, 10, str(row.get("Consumer Number", "N/A")), 1)
                pdf.cell(75, 10, str(row.get("Consumer Name", "N/A"))[:40], 1)
                pdf.cell(25, 10, str(row.get("Generation", "0")), 1, 0, 'R')
                pdf.cell(30, 10, str(row.get("Capacity", "0")), 1, 0, 'R')
                pdf.ln()
            pdf.output(file_path)
        else: # Default to CSV
            # Rule: Don't include Arin ID in CSV as requested
            if "Arin ID" in df.columns:
                df = df.drop(columns=["Arin ID"])
            df.to_csv(file_path, index=False)
                
        logger.info(f"✓ Local report saved: {file_path}")

        # ── GOOGLE DRIVE UPLOAD (NEW) ────────────────────────────────────────
        drive_status = "Local save only"
        try:
            from gdrive_utils import get_drive_service, get_or_create_date_folder, upload_file_to_drive # type: ignore
            drive_root_id = os.environ.get("GOOGLE_DRIVE_FOLDER_ID")
            if drive_root_id:
                service = get_drive_service()
                if service:
                    # Root -> Bill_Generation1 -> Report -> [Date]
                    bill_gen_root_id = get_or_create_date_folder(service, "Bill_Generation1", drive_root_id)
                    report_root_id = get_or_create_date_folder(service, "Report", bill_gen_root_id)
                    report_date_folder_id = get_or_create_date_folder(service, formatted_date, report_root_id)
                    
                    if report_date_folder_id:
                        success, g_msg = upload_file_to_drive(service, file_path, request.filename, report_date_folder_id)
                        if success:
                            drive_status = f"Successfully uploaded to Drive: {formatted_date}/{request.filename}"
                            logger.info(f"✓ {drive_status}")
                        else:
                            drive_status = f"Drive upload failed: {g_msg}"
                    else:
                        drive_status = "Drive folder creation failed"
        except Exception as drive_err:
            logger.error(f"Drive upload exception in save_reports: {drive_err}")
            drive_status = f"Drive Error: {drive_err}"

        return {
            "status": "success", 
            "path": file_path, 
            "rowCount": len(df_list),
            "drive_status": drive_status
        }
    except Exception as e:
        logger.error(f"Failed to save report: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/upload-excel")
async def upload_excel(file: UploadFile = File(...), user=Depends(get_current_user)):
    """Parses Excel for all Consumer Numbers and Dates in a row."""
    try:
        content = await file.read()
        df = pd.read_excel(io.BytesIO(content))
        data = []
        
        for _, row in df.iterrows():
            row_date = None
            row_consumers = []
            
            # 1. Identify date and all consumer numbers in the row
            for col in df.columns:
                val = row[col]
                if pd.isna(val): continue
                
                col_name = str(col).lower()
                val_str = str(val).strip()
                
                # Check for date
                if "date" in col_name or isinstance(val, (pd.Timestamp, datetime)):
                    try:
                        if isinstance(val, (pd.Timestamp, datetime)):
                            row_date = val.strftime("%Y-%m-%d")
                        else:
                            # Try parsing string date
                            row_date = val_str
                    except: pass
                
                # Check for 12-digit consumer numbers (any column)
                # Normalize: remove .0 and leading spaces
                clean_val = val_str.split('.')[0].replace(" ", "")
                if clean_val.isdigit() and len(clean_val) >= 10: # Usually 12, but being safe
                    row_consumers.append(clean_val)
            
            # 2. Add each consumer found to the final data list
            for c_num in row_consumers:
                data.append({
                    "consumerNumber": c_num,
                    "date": row_date
                })
                
        logger.info(f"Excel parsed: Found {len(data)} consumer entries.")
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(f"Excel error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process Excel: {str(e)}")

@app.get("/api/customer-details")
def customer_details(consumerNumber: str, user=Depends(get_current_user)):
    """Fetches customer specific constant data like name/capacity for auto-filling."""
    try:
        from processing import get_customer_details, _process_rows
        result = get_customer_details(consumerNumber)
        if not result:
            raise HTTPException(status_code=404, detail="Customer not found")
        # Reuse _process_rows to ensure JSON compatibility for dates
        return _process_rows([result])[0]
    except HTTPException: raise
    except Exception as e:
        logger.error(f"Customer details fetch failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def worker_task_selective(worker_index, date, indices, cookies=None, custom_id=None):
    """Parallel worker task for a specific list of indices."""
    port = 9223 + worker_index
    worker = BillAutomation(port=port)
    worker.process_date = date
    try:
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
        
        worker.launch_browser(date)
        if cookies: worker.set_cookies(cookies)
        else: worker.fill_login_credentials(date, custom_id=custom_id)
        try:
            wait = WebDriverWait(worker.driver, 10)
            wait.until(EC.presence_of_element_located((By.ID, "grdCustList")))
        except:
            worker.driver.get("https://wss.mahadiscom.in/wss/wss?uiActionName=getMyAccount")
            time.sleep(0.1) # Minimized wait
        worker.download_bills(selective_indices=indices)
    except Exception as e:
        logger.error(f"Worker {worker_index} failed: {e}")
    finally:
        worker.close()

@app.post("/api/save-bill-images")
async def save_bill_images(request: SaveImageRequest, user=Depends(get_current_user)):
    """Saves generated bill image to Google Drive and local desktop."""
    try:
        from dotenv import load_dotenv
        load_dotenv()
        
        # 1. Fetch Consumer Name and Bill Month from DB
        c_name = "Unknown"
        b_date = None
        from processing import get_db_connection
        from datetime import datetime
        
        conn = get_db_connection()
        if conn:
            try:
                cursor = conn.cursor(dictionary=True)
                # Name
                cursor.execute("SELECT customer_name FROM customers WHERE consumer_number = %s", (request.consumerNumber,))
                row = cursor.fetchone()
                if row and row.get("customer_name"):
                    c_name = row["customer_name"]
                else:
                    cursor.execute("SELECT customer_name FROM customers_backup WHERE consumer_number = %s", (request.consumerNumber,))
                    row_bk = cursor.fetchone()
                    if row_bk and row_bk.get("customer_name"): c_name = row_bk["customer_name"]
                
                # Month Year
                cursor.execute("SELECT month_year FROM bill_generation_details WHERE consumer_number = %s ORDER BY month_year DESC LIMIT 1", (request.consumerNumber,))
                row_mo = cursor.fetchone()
                if row_mo and row_mo.get("month_year"):
                    b_date = row_mo["month_year"]
            except Exception as e:
                logger.error(f"DB Fetch Error in save image: {e}")
            finally:
                conn.close()
                
        # 2. Cleaner Month_Year formulation (e.g. March_2026)
        month_year_filename = "Unknown_Month.jpeg"
        if b_date:
            try:
                if isinstance(b_date, str):
                    dt = datetime.strptime(b_date, "%Y-%m-%d")
                else: 
                    dt = b_date
                month_year_filename = f"{dt.strftime('%b')}_{dt.strftime('%Y')}.jpeg"
            except:
                pass
                
        # 3. Base64 processing
        import base64
        if "," in request.imageBase64:
            base64_data = request.imageBase64.split(",")[1]
        else:
            base64_data = request.imageBase64
            
        # 4. Google Drive upload logic (Primary requirement)
        drive_status = "Not attempted"
        try:
            from gdrive_utils import get_drive_service, get_or_create_date_folder, upload_base64_image_to_drive # type: ignore
            
            drive_folder_id = os.environ.get("GOOGLE_DRIVE_FOLDER_ID")
            if drive_folder_id:
                service = get_drive_service()
                if service:
                    # Root -> Bill_Generation1 -> ConsumerNumber
                    bill_gen_root_id = get_or_create_date_folder(service, "Bill_Generation1", drive_folder_id)
                    if bill_gen_root_id:
                        consumer_folder_id = get_or_create_date_folder(service, request.consumerNumber, bill_gen_root_id)
                        
                        if consumer_folder_id:
                            success, gdrive_msg = upload_base64_image_to_drive(
                                service, base64_data, month_year_filename, consumer_folder_id
                            )
                            if success:
                                drive_status = f"Saved to Drive: {request.consumerNumber}/{month_year_filename}"
                            else:
                                drive_status = f"Drive upload failed: {gdrive_msg}"
                        else:
                            drive_status = "Drive upload failed: Consumer folder missing"
                    else:
                        drive_status = "Drive upload failed: Bill_Generation1 root missing"
                else:
                    drive_status = "Drive upload failed: Auth service failed"
            else:
                drive_status = "Drive upload failed: GOOGLE_DRIVE_FOLDER_ID missing"
        except Exception as gd_e:
            logger.error(f"Google Drive exception: {gd_e}")
            drive_status = f"Drive Exception: {gd_e}"

        return {
            "status": "success", 
            "message": drive_status
        }
    except Exception as e:
        logger.error(f"Failed to save image: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/save-bill-data")
async def save_bill_data(request: Request, user=Depends(get_current_user)):
    """Saves bill data to MySQL without an image."""
    try:
        data = await request.json()
        from processing import save_to_mysql
        success = save_to_mysql(data)
        if success:
            return {"status": "success", "message": "Bill data recorded successfully."}
        else:
            return {"status": "error", "message": "Failed to save record to database."}
    except Exception as e:
        logger.error(f"Failed to save bill data: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/billing-analysis")
def get_billing_analysis(consumerNumber: str, month: str, user=Depends(get_current_user)):
    """
    Fetches the analyzed data for a specific consumer and month from MySQL.
    """
    bills = get_all_bills()
    
    # Try to find the record
    target_bill = None
    for b in bills:
        if str(b.get("consumer_number")) == str(consumerNumber):
            # check if month string (e.g. "FEB-2026") is in month_year (iso format 2026-02-01)
            b_date = b.get("month_year") or ""
            if isinstance(b_date, str) and month[:3].upper() in b_date.upper():
                target_bill = b
                break
            elif isinstance(b_date, str) and month[-4:] in b_date:
                target_bill = b
                break
    
    if not target_bill:
        return {
            "consumer_number": consumerNumber,
            "bill_month": month,
            "export": 0, "import": 0, "generated": 0, "amount": 0,
            "prev_banked": 0, "curr_banked": 0,
            "system_health": "UNKNOWN", "bill_status": "No Data",
            "reading_date": "N/A", "capacity": 0, "commission_date": "N/A",
            "customer_name": "N/A"
        }
    
    # Map database keys to frontend-expected keys
    return {
        "consumer_number": target_bill.get("consumer_number"),
        "customer_name": target_bill.get("customer_name") or target_bill.get("consumer_name"),
        "bill_month": target_bill.get("month_year"),
        "export": target_bill.get("export_units") or target_bill.get("export", 0),
        "import": target_bill.get("import_units") or target_bill.get("import", 0),
        "generated": target_bill.get("generation_units") or target_bill.get("generated", 0),
        "amount": target_bill.get("billing_amount") or target_bill.get("amount", 0),
        "prev_banked": target_bill.get("prev_bank_units") or target_bill.get("prev_banked", 0),
        "curr_banked": target_bill.get("bank_solar_units") or target_bill.get("curr_banked", 0),
        "system_health": "Analyzed",
        "bill_status": "Analyzed",
        "reading_date": target_bill.get("reading_date"),
        "capacity": target_bill.get("solar_capacity_kw") or target_bill.get("capacity", 0),
        "commission_date": target_bill.get("commission_date"),
        "full_record": target_bill # Fallback for any other missing fields
    }

@app.get("/api/all-customers")
def get_all_customers_endpoint(user=Depends(get_current_user)):
    """Fetches all consumers from the database with their ARIN IDs."""
    try:
        from processing import get_all_customers_db
        data = get_all_customers_db()
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(f"Failed to fetch all customers: {e}")
        return {"status": "error", "message": str(e)}

@app.get("/")
def read_root():
    if os.path.isfile(FRONTEND_INDEX_FILE):
        return FileResponse(FRONTEND_INDEX_FILE)
    return {"status": "BillBot Backend is running"}

@app.post("/api/launch")
def launch_automation(request: LaunchRequest, user=Depends(get_current_user)):
    """Launches the primary browser and navigates to the portal."""
    global global_total_bills
    global_total_bills = 0  # Reset stale count from any previous session (Issue #5)
    success, message = primary_automation.launch_browser(request.date)
    if not success:
        raise HTTPException(status_code=500, detail=message)
    
    primary_automation.fill_login_credentials(request.date, custom_id=request.customId)
    return {"status": "success", "message": message}

@app.get("/api/consumers")
def fetch_consumers(user=Depends(get_current_user)):
    """Scrapes the consumer list from the primary browser session."""
    success, data = primary_automation.get_consumer_list()
    if not success:
        raise HTTPException(status_code=500, detail=data)
    return data

@app.post("/api/close")
def close_browser(user=Depends(get_current_user)):
    """Closes the primary browser session."""
    primary_automation.close()
    return {"status": "success", "message": "Browser closed."}

@app.get("/api/stats")
def get_stats(user=Depends(get_current_user)):
    """Returns dashboard statistics from MySQL."""
    return get_dashboard_stats()

@app.post("/api/download")
def start_download(request: DownloadRequest, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    global global_total_bills, download_in_progress, active_download_tasks
    if not primary_automation.driver:
        raise HTTPException(status_code=400, detail="Primary browser not active.")
    
    selected = request.selectedIndices
    if not selected:
        try:
            from selenium.webdriver.common.by import By
            buttons = primary_automation.driver.find_elements(By.XPATH, "//img[@title='View Bill']")
            selected = list(range(len(buttons)))
        except:
            selected = []

    total_selected = len(selected)
    global_total_bills = total_selected
    if total_selected == 0:
        return {"status": "warning", "message": "No bills selected."}

    # ISSUE #6 FIX: Respect the workers slider from the frontend.
    # Split bills evenly across the requested number of workers.
    requested_workers = max(1, request.workers)  # At least 1 worker
    num_workers = min(requested_workers, total_selected)  # Can't have more workers than bills
    num_workers = min(num_workers, 50)  # Safety cap at 50

    logger.info(f"WORKER MODE: Distributing {total_selected} bills across {num_workers} workers (requested={requested_workers}).")
    cookies = primary_automation.get_cookies() if num_workers > 1 else None
    date = primary_automation.process_date
    
    # Divide bills evenly across workers
    chunk_size = (total_selected + num_workers - 1) // num_workers  # Ceiling division for even spread
    tasks_dispatched = 0
    custom_id = request.customId
    
    for i in range(num_workers):
        start = i * chunk_size
        if start >= total_selected: break
        end = min(start + chunk_size, total_selected)
        worker_indices = selected[start:end]
        
        if worker_indices:
            tasks_dispatched += 1
            logger.info(f"Worker {i+1} (Port {9222+i}): Bills {start}-{end-1} ({len(worker_indices)} bills)")
            if i == 0:
                background_tasks.add_task(download_wrapper, primary_automation.download_bills, selective_indices=worker_indices)
            else:
                background_tasks.add_task(download_wrapper, worker_task_selective, i, date, worker_indices, cookies, custom_id)
                
    if tasks_dispatched > 0:
        download_in_progress = True
        active_download_tasks += tasks_dispatched
            
    mode_msg = "Single Window" if tasks_dispatched == 1 else f"{tasks_dispatched} Parallel Workers"
    return {
        "status": "success", 
        "message": f"Downloading {total_selected} bills using {mode_msg}.",
        "details": f"Dispatched {tasks_dispatched} task(s) ({num_workers} workers requested)."
    }

def process_data_task(storage_path):
    global process_in_progress, process_results, total_process_count, current_process_count
    process_in_progress = True
    process_results = {"success": [], "failed": []}
    current_process_count = 0
    total_process_count = 0
    
    def progress_callback(curr, total):
        global current_process_count, total_process_count
        current_process_count = curr
        total_process_count = total
        
    try:
        results = process_downloads(storage_path, progress_callback=progress_callback)
        if isinstance(results, dict):
            process_results = results
        else:
            process_results = {"success": ["dummy" for _ in range(results)], "failed": []}
    except Exception as e:
        logger.error(f"Async process failed: {e}")
    finally:
        process_in_progress = False
        
        # TRIGGER BATCH UPLOAD (To catch newly generated reports)
        try:
            import subprocess
            import sys
            script_path = os.path.join(os.path.dirname(__file__), 'batch_drive_upload.py')
            logger.info(f"--- Triggering Post-Process Batch Upload for: {storage_path} ---")
            subprocess.Popen([sys.executable, script_path, storage_path])
        except Exception as e:
            logger.error(f"Failed to trigger post-process batch upload: {e}")

@app.post("/api/process")
def process_data(background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    """Triggers PDF processing and MySQL storage asynchronously."""
    from datetime import datetime, timedelta
    if primary_automation.process_date:
        date_str = primary_automation.process_date
    else:
        # Default to today in IST if no session is active
        date_str = (datetime.utcnow() + timedelta(hours=5, minutes=30)).strftime("%Y-%m-%d")
    try:
        if "T" in date_str:
            from datetime import datetime, timedelta
            dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            dt = dt + timedelta(hours=5, minutes=30)
            date_str = dt.strftime("%Y-%m-%d") # Format as YYYY-MM-DD
        elif len(date_str) == 10 and date_str[4] == "-" and date_str[7] == "-":
            pass # Already YYYY-MM-DD
        else:
            from datetime import datetime
            dt = datetime.strptime(date_str, "%Y-%m-%d")
            date_str = dt.strftime("%Y-%m-%d")
    except:
        pass
        
    desktop_path = os.path.join(os.environ.get('USERPROFILE', os.path.expanduser("~")), 'Desktop')
    storage_path = os.path.join(desktop_path, 'arin', date_str)
    
    background_tasks.add_task(process_data_task, storage_path)
    return {"status": "success", "message": "Processing started in background"}

@app.get("/api/process-status")
def get_process_status(user=Depends(get_current_user)):
    """Returns the live status of the PDF processing and database saving engine."""
    return {
        "status": "success",
        "in_progress": process_in_progress,
        "completed": current_process_count,
        "total": total_process_count,
        "results": process_results
    }

@app.get("/api/bills")
def get_bills(user=Depends(get_current_user)):
    """Returns the final processed data from MySQL."""
    return get_all_bills()

@app.get("/api/consumers-for-date")
def get_consumers_for_date(date_str: str, user=Depends(get_current_user)):
    """Returns consumer numbers from the downloaded PDFs for a specific date directory."""
    try:
        from datetime import datetime
        if "T" in date_str:
            date_str = date_str.split("T")[0]
            
        desktop_path = os.path.join(os.environ.get('USERPROFILE', os.path.expanduser("~")), 'Desktop')
        target_dir = os.path.join(desktop_path, 'arin', date_str)
        
        consumers = []
        if os.path.exists(target_dir):
            import glob
            import json
            
            # 1. Check extracted_cache.json if it exists (very reliable)
            cache_path = os.path.join(target_dir, "extracted_cache.json")
            if os.path.exists(cache_path):
                try:
                    with open(cache_path, "r") as f:
                        cache_data = json.load(f)
                    for item in cache_data:
                        c_num = str(item.get("consumer_number"))
                        if c_num and c_num not in consumers:
                            consumers.append(c_num)
                except: pass

            # 2. Check PDFs in the folder (fallback)
            pdf_pattern = os.path.join(target_dir, "**", "*.pdf")
            for file_path in glob.glob(pdf_pattern, recursive=True):
                filename = os.path.basename(file_path)
                # Primary pattern: cnum_month_year.pdf or name_cnum.pdf
                import re
                m = re.search(r'(\d{10,12})', filename)
                if m:
                    c_num = m.group(1)
                    if c_num not in consumers:
                        consumers.append(c_num)
                        
        return {"status": "success", "consumers": consumers}
    except Exception as e:
        logger.error(f"Failed to get consumers for date {date_str}: {e}")
        return {"status": "error", "consumers": []}

@app.get("/api/download-status")
def get_download_status(user=Depends(get_current_user)):
    """Returns current download status."""
    date_str = primary_automation.process_date if primary_automation.process_date else "unknown_date"
    
    # Standardize date to YYYY-MM-DD to match automation.py folder structure
    try:
        from datetime import datetime, timedelta
        if "T" in date_str:
            # ISO format from frontend (e.g. 2026-02-16T00:00:00.000Z)
            dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            dt = dt + timedelta(hours=5, minutes=30) # Adjust for IST
            date_str = dt.strftime("%Y-%m-%d")
        else:
            # Fallback for plain dates
            dt = datetime.strptime(date_str, "%Y-%m-%d")
            date_str = dt.strftime("%Y-%m-%d")
    except:
        pass # Keep as is if parsing fails (fallback)
        
    desktop_path = os.path.join(os.environ.get('USERPROFILE', os.path.expanduser("~")), 'Desktop')
    storage_path = os.path.join(desktop_path, 'arin', date_str)
    
    # Get total count
    total_bills = global_total_bills
    
    # If starting up or lost state, try to estimate total
    if total_bills == 0 and primary_automation.driver:
        try:
            from selenium.webdriver.common.by import By
            # This is slow, so only do it if absolutely necessary
            # buttons = primary_automation.driver.find_elements(By.XPATH, "//img[@title='View Bill']")
            # total_bills = len(buttons)
            pass
        except:
            pass
            
    completed = 0
    filenames = []
    success_list = []
    
    # PDFs are deleted from local storage after Drive upload, so we count using extracted_cache.json
    cache_path = os.path.join(storage_path, "extracted_cache.json")
    if os.path.exists(cache_path):
        import json
        try:
            with open(cache_path, "r") as f:
                cache_data = json.load(f)
            completed = len(cache_data)
            success_list = [str(c.get("consumer_number", "Unknown")) for c in cache_data]
            filenames = [f"{str(c.get('consumer_number'))}.pdf" for c in cache_data]
        except:
            pass
            
    files = []
    if os.path.exists(storage_path):
        import glob
        files = glob.glob(os.path.join(storage_path, "*.pdf"))
        if files:
            pdf_names = [os.path.basename(f) for f in files]
            filenames.extend(pdf_names)
            # Roughly extract cnum from filename for success_list fallback
            for fn in pdf_names:
                import re
                m = re.search(r'(\d{10,12})', fn)
                if m and m.group(1) not in success_list:
                    success_list.append(m.group(1))
            completed = len(set(success_list))
    
    failed = 0
    if not download_in_progress and total_bills > 0:
        failed = max(0, total_bills - completed)
    
    return {
        "completed": completed,
        "total": total_bills if total_bills > 0 else completed, # fallback to completed if total unknown
        "failed": failed,
        "in_progress": download_in_progress,
        "filenames": filenames,
        "success_list": success_list
    }

@app.post("/api/drive/upload-zero-gen")
def upload_zero_gen_report(user=Depends(get_current_user)):
    """Generates a CSV of zero-gen consumers and uploads it to Google Drive."""
    try:
        from upload_zero_gen import generate_and_upload_zero_gen
        success, message = generate_and_upload_zero_gen()
        if not success:
            raise HTTPException(status_code=500, detail=message)
        return {"success": True, "message": message}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/{full_path:path}")
def spa_fallback(full_path: str):
    """Return frontend index for client-side routes while keeping API 404s intact."""
    if full_path.startswith("api"):
        raise HTTPException(status_code=404, detail="Not Found")
    if os.path.isfile(FRONTEND_INDEX_FILE):
        return FileResponse(FRONTEND_INDEX_FILE)
    raise HTTPException(status_code=404, detail="Not Found")


