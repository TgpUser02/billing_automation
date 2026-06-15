import os
from dotenv import load_dotenv
# Load environment variables first
load_dotenv(override=True)
# Also search in the parent directory as fallback (for local start.sh relative pathing)
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'), override=True)

from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
import base64
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
from login_automation import login_automator
from processing import process_downloads, get_all_bills, get_dashboard_stats, collection, get_customer_details, _process_rows
from auth import (
    get_current_user, create_access_token, verify_password, hash_password,
    verify_recaptcha, check_rate_limit, record_failed_attempt,
    record_successful_login, get_remaining_attempts,
    get_user_from_db, reset_user_failed_attempts, change_user_password,
    RECAPTCHA_SITE_KEY, refresh_access_token, update_user_failed_attempts
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


class EndpointNoiseFilter(logging.Filter):
    def filter(self, record):
        message = record.getMessage()
        return not (
            "/api/process-status" in message
            or "/api/download-status" in message
        )


logging.getLogger("uvicorn.access").addFilter(EndpointNoiseFilter())

def run_migrations():
    """Add columns for panel/system/general warranties, blacklist reasons, and portal credentials."""
    from processing import get_db_connection
    conn = get_db_connection()
    if not conn:
        logger.error("Failed to connect to database for migrations.")
        return
    try:
        cursor = conn.cursor()
        
        # 1. Add columns to customers
        columns_to_add = [
            ("panel_warranty_expiry_date", "DATE NULL"),
            ("system_warranty_expiry_date", "DATE NULL"),
            ("general_warranty_expiry_date", "DATE NULL"),
            ("blacklisted_reason", "VARCHAR(255) NULL"),
            ("portal_username", "VARCHAR(100) NULL"),
            ("portal_password", "VARCHAR(100) NULL"),
            ("maintenance_tenure", "VARCHAR(100) NULL")
        ]
        
        for col_name, col_type in columns_to_add:
            try:
                cursor.execute(f"ALTER TABLE customers ADD COLUMN {col_name} {col_type}")
                logger.info(f"Migration: Added column {col_name} to customers.")
            except Exception:
                pass
                
        # 2. Add columns to customers_backup
        for col_name, col_type in columns_to_add:
            try:
                cursor.execute(f"ALTER TABLE customers_backup ADD COLUMN {col_name} {col_type}")
                logger.info(f"Migration: Added column {col_name} to customers_backup.")
            except Exception:
                pass
                
        # 3. Add bill_status to bill_generation_details
        try:
            cursor.execute("ALTER TABLE bill_generation_details ADD COLUMN bill_status VARCHAR(50) DEFAULT 'Normal'")
            logger.info("Migration: Added column bill_status to bill_generation_details.")
        except Exception:
            pass
            
        # 4. Create portal_credentials table
        try:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS portal_credentials (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    username VARCHAR(100) UNIQUE NOT NULL,
                    password VARCHAR(100) NOT NULL,
                    description VARCHAR(255) NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """)
            logger.info("Migration: Created/verified table portal_credentials.")
        except Exception as e:
            logger.error(f"Migration: portal_credentials creation/seeding failed: {e}")
            
        # 5. Add columns to users table
        columns_to_add_users = [
            ("email", "VARCHAR(100) UNIQUE NULL"),
            ("otp_code", "VARCHAR(6) NULL"),
            ("otp_expiry", "DATETIME NULL")
        ]
        for col_name, col_type in columns_to_add_users:
            try:
                cursor.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}")
                logger.info(f"Migration: Added column {col_name} to users.")
            except Exception:
                pass
            
        conn.commit()
        cursor.close()
        logger.info("Migrations successfully completed/verified.")
    except Exception as e:
        logger.error(f"Migration error: {e}")
    finally:
        conn.close()

# Run database migrations
run_migrations()

app = FastAPI(title="BillBot API")

def get_arin_storage_root():
    return os.environ.get("ARIN_STORAGE_PATH", "/var/arin")


def get_arin_storage_path(date_str: str):
    return os.path.join(get_arin_storage_root(), date_str)

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

class OTPRequest(BaseModel):
    identifier: str

class OTPVerifyRequest(BaseModel):
    identifier: str
    otp: str

class ForgotPasswordRequest(BaseModel):
    identifier: str

class ForgotPasswordResetRequest(BaseModel):
    identifier: str
    otp: str
    newPassword: str

class RegisterRequest(BaseModel):
    username: str
    password: str
    email: Optional[str] = None

class UserCreateRequest(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    role: str = "operator"

class UserUpdateRequest(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None

class PortalCredentialReq(BaseModel):
    username: str
    password: str
    description: Optional[str] = None

class CustomerModel(BaseModel):
    arin_id: Optional[str] = None
    customer_name: str
    contact_number: Optional[str] = "N/A"
    zone: Optional[str] = "Other"
    current_location_link: Optional[str] = ""
    address: Optional[str] = "N/A"
    consumer_number: str
    panel_name: Optional[str] = "Other"
    panel_name_other: Optional[str] = None
    panel_type: Optional[str] = None
    solar_wattpick: Optional[int] = None
    solar_panel_count: Optional[int] = 0
    solar_capacity_kw: Optional[int] = 0
    panel_capacity_kw: Optional[int] = 0
    inverter_name: Optional[str] = "Other"
    inverter_name_other: Optional[str] = None
    inverter_capacity: Optional[int] = 0
    commission_date: Optional[str] = None
    wifi_available: Optional[int] = 0
    wifi_id: Optional[str] = None
    wifi_password: Optional[str] = None
    visits_per_year: Optional[int] = 2
    total_visits_in_5_years: Optional[int] = 10
    maintenance_tenure: Optional[str] = None
    is_blacklisted: Optional[int] = 0
    inverter_warranty_expiry_date: Optional[str] = None
    panel_warranty_expiry_date: Optional[str] = None
    system_warranty_expiry_date: Optional[str] = None
    general_warranty_expiry_date: Optional[str] = None
    blacklisted_reason: Optional[str] = None
    portal_username: Optional[str] = None
    portal_password: Optional[str] = None

@app.post("/api/auth/login")
async def login(request: LoginRequest, req: Request):
    """Login with SQL user validation, database lockout, and rate limiting."""
    # 1. Check Rate Limits
    client_ip = req.client.host
    if not check_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Too many failed attempts. Try again later.")

    # 2. Verify SQL user existence and check database lockout status
    user = get_user_from_db(request.username)
    if user and user.get("locked_until"):
        from datetime import datetime
        now = datetime.utcnow()
        if user["locked_until"] > now:
            remaining = int((user["locked_until"] - now).total_seconds())
            remaining_mins = max(1, remaining // 60)
            raise HTTPException(
                status_code=403,
                detail=f"This account is temporarily locked due to multiple failed login attempts. Try again in {remaining_mins} minutes."
            )

    # 3. Verify password
    if not user or not verify_password(request.password, user["password_hash"]):
        record_failed_attempt(client_ip)
        if user:
            from datetime import datetime, timedelta
            new_count = user.get("failed_attempts", 0) + 1
            locked_until = None
            if new_count >= 5:
                locked_until = datetime.utcnow() + timedelta(minutes=15)
            update_user_failed_attempts(user["username"], new_count, locked_until)
            
        attempts = get_remaining_attempts(client_ip)
        raise HTTPException(status_code=401, detail=f"Invalid username or password. {attempts} attempts left.")

    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="User account is inactive")

    # 4. Success
    reset_user_failed_attempts(user["username"])
    record_successful_login(user["username"], client_ip)
    
    token = create_access_token({
        "sub": user["username"],
        "role": user.get("role", "operator")
    })
    
    logger.info(f"✓ Login successful: {user['username']}")
    
    return {
        "status": "success",
        "token": token,
        "username": user["username"],
        "role": user.get("role", "operator")
    }

@app.get("/api/auth/verify")
async def verify_token(user=Depends(get_current_user)):
    """Verify if the current JWT token is valid."""
    return {"status": "valid", "user": user}

@app.post("/api/auth/register")
async def register_user(request: RegisterRequest):
    """Public endpoint for operator account self-registration."""
    from processing import get_db_connection
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed.")
    try:
        cursor = conn.cursor(dictionary=True)
        # 1. Clean inputs
        clean_user = request.username.strip()
        clean_email = request.email.strip() if request.email else None
        
        # Validation checks
        if not clean_user:
            raise HTTPException(status_code=400, detail="Username cannot be empty.")
        if len(request.password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
            
        # 2. Check duplicate username
        cursor.execute("SELECT id FROM users WHERE username = %s", (clean_user,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Username already exists.")
            
        # 3. Check duplicate email
        if clean_email:
            cursor.execute("SELECT id FROM users WHERE email = %s", (clean_email,))
            if cursor.fetchone():
                raise HTTPException(status_code=400, detail="Email already registered.")
                
        # 4. Insert operator
        pwd_hash = hash_password(request.password)
        cursor.execute(
            "INSERT INTO users (username, password_hash, email, role, is_active) VALUES (%s, %s, %s, 'operator', 1)",
            (clean_user, pwd_hash, clean_email)
        )
        conn.commit()
        cursor.close()
        logger.info(f"✓ New operator registered: {clean_user}")
        return {"status": "success", "message": "Account created successfully. You can now log in."}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

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

# ═══════════════════════════════════════════════════════════════════════════════
# EMAIL SENDER HELPER
# ═══════════════════════════════════════════════════════════════════════════════
def send_otp_email(to_email: str, otp: str, subject_prefix: str = "Verification Code") -> bool:
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    
    email_user = os.getenv("EMAIL_USER")
    email_pass = os.getenv("EMAIL_PASS")
    email_host = os.getenv("EMAIL_HOST", "smtp.gmail.com")
    email_port_str = os.getenv("EMAIL_PORT", "587")
    email_use_tls_str = os.getenv("EMAIL_USE_TLS", "True")
    
    logger.info(f"Generating email. To: {to_email}, Subject Prefix: {subject_prefix}, OTP: {otp}")
    
    if not email_user or not email_pass:
        logger.warning("======================================================================")
        logger.warning("⚠️  [MOCK EMAIL SENDER] SMTP credentials not set in .env")
        logger.warning("To send real emails, set EMAIL_USER and EMAIL_PASS in your .env file.")
        logger.warning(f"OTP Verification code for {to_email} is: {otp}")
        logger.warning("======================================================================")
        return True

    try:
        email_port = int(email_port_str)
    except ValueError:
        email_port = 587
        
    use_tls = email_use_tls_str.lower() in ("true", "1", "yes")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Arin Energy - {subject_prefix}"
    msg["From"] = email_user
    msg["To"] = to_email

    html = f"""
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #f4f6f9; padding: 20px; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <h2 style="color: #2563eb; text-align: center;">Arin Energy Billing Automation</h2>
          <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p>Hello,</p>
          <p>You requested a verification code. Please use the following One-Time Password (OTP) to proceed:</p>
          <div style="text-align: center; margin: 30px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #1e3a8a; background-color: #eff6ff; padding: 10px 20px; border-radius: 6px; border: 1px solid #bfdbfe;">
              {otp}
            </span>
          </div>
          <p>This verification code is valid for <strong>5 minutes</strong>. If you did not request this, please ignore this email or secure your account.</p>
          <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="font-size: 12px; color: #6b7280; text-align: center;">This is an automated message, please do not reply.</p>
        </div>
      </body>
    </html>
    """
    msg.attach(MIMEText(html, "html"))

    try:
        if email_port == 465:
            server = smtplib.SMTP_SSL(email_host, email_port, timeout=10)
        else:
            server = smtplib.SMTP(email_host, email_port, timeout=10)
            if use_tls:
                server.starttls()
                
        server.login(email_user, email_pass)
        server.sendmail(email_user, to_email, msg.as_string())
        server.quit()
        logger.info(f"✓ Verification code successfully sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to send verification email: {str(e)}"
        )


# ═══════════════════════════════════════════════════════════════════════════════
# OTP & FORGOT PASSWORD ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/api/auth/login-otp-request")
async def login_otp_request(request: OTPRequest):
    from processing import get_db_connection
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed.")
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT id, username, email, is_active FROM users WHERE username = %s OR email = %s",
            (request.identifier, request.identifier)
        )
        user = cursor.fetchone()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found.")
            
        if not user.get("is_active", True):
            raise HTTPException(status_code=403, detail="User account is inactive.")
            
        if not user.get("email"):
            raise HTTPException(status_code=400, detail="No email address registered for this user. Please contact an administrator.")
            
        # Generate 6 digit OTP
        import random
        otp = f"{random.randint(100000, 999999)}"
        # Expiration in 5 minutes
        from datetime import datetime, timedelta
        expiry = datetime.utcnow() + timedelta(minutes=5)
        
        cursor.execute(
            "UPDATE users SET otp_code = %s, otp_expiry = %s WHERE id = %s",
            (otp, expiry, user["id"])
        )
        conn.commit()
        
        # Send OTP
        send_otp_email(user["email"], otp, "Login Verification Code")
        
        return {"status": "success", "message": "OTP sent successfully to registered email."}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OTP Login request failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.post("/api/auth/login-otp-verify")
async def login_otp_verify(request: OTPVerifyRequest):
    from processing import get_db_connection
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed.")
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT id, username, email, role, is_active, otp_code, otp_expiry FROM users WHERE username = %s OR email = %s",
            (request.identifier, request.identifier)
        )
        user = cursor.fetchone()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found.")
            
        if not user.get("is_active", True):
            raise HTTPException(status_code=403, detail="User account is inactive.")
            
        if not user.get("otp_code") or user["otp_code"] != request.otp:
            raise HTTPException(status_code=401, detail="Invalid OTP code.")
            
        from datetime import datetime
        if not user.get("otp_expiry") or user["otp_expiry"] < datetime.utcnow():
            raise HTTPException(status_code=401, detail="OTP code has expired. Please request a new one.")
            
        # Success - Clear OTP and generate token
        cursor.execute(
            "UPDATE users SET otp_code = NULL, otp_expiry = NULL WHERE id = %s",
            (user["id"],)
        )
        conn.commit()
        
        # Reset failed attempts
        reset_user_failed_attempts(user["username"])
        
        # Generate token
        token = create_access_token({
            "sub": user["username"],
            "role": user.get("role", "operator")
        })
        
        logger.info(f"✓ OTP Login successful for: {user['username']}")
        
        return {
            "status": "success",
            "token": token,
            "username": user["username"],
            "role": user.get("role", "operator")
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OTP Login verification failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.post("/api/auth/forgot-password-request")
async def forgot_password_request(request: ForgotPasswordRequest):
    from processing import get_db_connection
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed.")
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT id, username, email, is_active FROM users WHERE username = %s OR email = %s",
            (request.identifier, request.identifier)
        )
        user = cursor.fetchone()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found.")
            
        if not user.get("is_active", True):
            raise HTTPException(status_code=403, detail="User account is inactive.")
            
        if not user.get("email"):
            raise HTTPException(status_code=400, detail="No email address registered for this user. Please contact an administrator.")
            
        # Generate 6 digit OTP
        import random
        otp = f"{random.randint(100000, 999999)}"
        # Expiration in 10 minutes
        from datetime import datetime, timedelta
        expiry = datetime.utcnow() + timedelta(minutes=10)
        
        cursor.execute(
            "UPDATE users SET otp_code = %s, otp_expiry = %s WHERE id = %s",
            (otp, expiry, user["id"])
        )
        conn.commit()
        
        # Send OTP
        send_otp_email(user["email"], otp, "Password Reset Code")
        
        return {"status": "success", "message": "Password reset code sent to registered email."}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Forgot password request failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.post("/api/auth/forgot-password-reset")
async def forgot_password_reset(request: ForgotPasswordResetRequest):
    from processing import get_db_connection
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed.")
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT id, username, email, is_active, otp_code, otp_expiry FROM users WHERE username = %s OR email = %s",
            (request.identifier, request.identifier)
        )
        user = cursor.fetchone()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found.")
            
        if not user.get("is_active", True):
            raise HTTPException(status_code=403, detail="User account is inactive.")
            
        if not user.get("otp_code") or user["otp_code"] != request.otp:
            raise HTTPException(status_code=401, detail="Invalid OTP code.")
            
        from datetime import datetime
        if not user.get("otp_expiry") or user["otp_expiry"] < datetime.utcnow():
            raise HTTPException(status_code=401, detail="OTP code has expired. Please request a new one.")
            
        if len(request.newPassword) < 6:
            raise HTTPException(status_code=400, detail="New password must be at least 6 characters.")
            
        # Hash new password
        new_hash = hash_password(request.newPassword)
        
        # Reset password and clear OTP
        cursor.execute(
            "UPDATE users SET password_hash = %s, otp_code = NULL, otp_expiry = NULL, failed_attempts = 0, locked_until = NULL WHERE id = %s",
            (new_hash, user["id"])
        )
        conn.commit()
        
        logger.info(f"✓ Password successfully reset via OTP for user: {user['username']}")
        
        return {"status": "success", "message": "Password reset successfully. You can now log in."}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Password reset failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════════════════════
# ADMIN USER MANAGEMENT CRUD ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/admin/users")
async def admin_get_users(user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")
        
    from processing import get_db_connection
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed.")
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id, username, email, role, is_active, created_at FROM users ORDER BY username ASC")
        users_list = cursor.fetchall()
        for u in users_list:
            if u.get("created_at") and hasattr(u["created_at"], "isoformat"):
                u["created_at"] = u["created_at"].isoformat()
        return {"status": "success", "data": users_list}
    except Exception as e:
        logger.error(f"Failed to fetch users: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.post("/api/admin/users")
async def admin_create_user(request: UserCreateRequest, user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")
        
    if len(request.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
        
    from processing import get_db_connection
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed.")
    try:
        cursor = conn.cursor(dictionary=True)
        
        # Check if username exists
        cursor.execute("SELECT id FROM users WHERE username = %s", (request.username,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Username already exists.")
            
        # Check if email exists
        if request.email:
            cursor.execute("SELECT id FROM users WHERE email = %s", (request.email,))
            if cursor.fetchone():
                raise HTTPException(status_code=400, detail="Email already registered.")
                
        # Hash password
        pwd_hash = hash_password(request.password)
        
        cursor.execute(
            "INSERT INTO users (username, password_hash, email, role, is_active) VALUES (%s, %s, %s, %s, %s)",
            (request.username, pwd_hash, request.email, request.role, True)
        )
        conn.commit()
        return {"status": "success", "message": f"User {request.username} created successfully."}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create user: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.put("/api/admin/users/{user_id}")
async def admin_update_user(user_id: int, request: UserUpdateRequest, user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")
        
    from processing import get_db_connection
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed.")
    try:
        cursor = conn.cursor(dictionary=True)
        
        # Fetch target user
        cursor.execute("SELECT id, username, role FROM users WHERE id = %s", (user_id,))
        target_user = cursor.fetchone()
        if not target_user:
            raise HTTPException(status_code=404, detail="User not found.")
            
        # If updating email, check for duplicate
        if request.email:
            cursor.execute("SELECT id FROM users WHERE email = %s AND id != %s", (request.email, user_id))
            if cursor.fetchone():
                raise HTTPException(status_code=400, detail="Email already registered to another user.")
                
        updates = []
        params = []
        
        if request.email is not None:
            updates.append("email = %s")
            params.append(request.email if request.email.strip() != "" else None)
            
        if request.role is not None:
            if target_user["username"] == "admin" and request.role != "admin":
                raise HTTPException(status_code=400, detail="Cannot change role of primary admin.")
            updates.append("role = %s")
            params.append(request.role)
            
        if request.is_active is not None:
            if not request.is_active:
                if target_user["username"] == "admin":
                    raise HTTPException(status_code=400, detail="Cannot deactivate the primary admin user.")
                if target_user["username"] == user["username"]:
                    raise HTTPException(status_code=400, detail="Cannot deactivate your own active account.")
            updates.append("is_active = %s")
            params.append(request.is_active)
            
        if request.password is not None and request.password.strip() != "":
            if len(request.password) < 6:
                raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
            updates.append("password_hash = %s")
            params.append(hash_password(request.password))
            
        if not updates:
            return {"status": "success", "message": "No fields to update."}
            
        params.append(user_id)
        query = f"UPDATE users SET {', '.join(updates)} WHERE id = %s"
        cursor.execute(query, tuple(params))
        conn.commit()
        return {"status": "success", "message": f"User {target_user['username']} updated successfully."}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update user: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.delete("/api/admin/users/{user_id}")
async def admin_delete_user(user_id: int, user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")
        
    from processing import get_db_connection
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed.")
    try:
        cursor = conn.cursor(dictionary=True)
        
        # Fetch target user
        cursor.execute("SELECT id, username FROM users WHERE id = %s", (user_id,))
        target_user = cursor.fetchone()
        if not target_user:
            raise HTTPException(status_code=404, detail="User not found.")
            
        # Safety restrictions
        if target_user["username"] == "admin":
            raise HTTPException(status_code=400, detail="Cannot delete the primary admin user.")
            
        if target_user["username"] == user["username"]:
            raise HTTPException(status_code=400, detail="Cannot delete your own active admin account.")
            
        cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
        conn.commit()
        return {"status": "success", "message": f"User {target_user['username']} deleted successfully."}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete user: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.get("/api/portal-credentials")
def get_portal_credentials(user=Depends(get_current_user)):
    from processing import get_db_connection
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed.")
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id, username, password, description FROM portal_credentials ORDER BY username ASC")
        res = cursor.fetchall()
        return {"status": "success", "data": res}
    except Exception as e:
        logger.error(f"Failed to fetch portal credentials: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/api/portal-credentials")
def save_portal_credential(req: PortalCredentialReq, user=Depends(get_current_user)):
    from processing import get_db_connection
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed.")
    try:
        cursor = conn.cursor()
        query = """
            INSERT INTO portal_credentials (username, password, description)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE
                password = VALUES(password),
                description = VALUES(description)
        """
        cursor.execute(query, (req.username.strip(), req.password.strip(), req.description))
        conn.commit()
        return {"status": "success", "message": f"Saved credentials for {req.username.strip()}."}
    except Exception as e:
        logger.error(f"Failed to save portal credential: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.delete("/api/portal-credentials/{username}")
def delete_portal_credential(username: str, user=Depends(get_current_user)):
    from processing import get_db_connection
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed.")
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM portal_credentials WHERE username = %s", (username.strip(),))
        conn.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Credential not found.")
        return {"status": "success", "message": f"Deleted credentials for {username.strip()}."}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete portal credential: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

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
                
                storage_path = get_arin_storage_path(date_str)
                
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
    data: List[dict]
    dateStr: str

@app.post("/api/save-reports")
async def save_reports(request: ReportRequest, user=Depends(get_current_user)):
    """Saves batch reports (CSV, XLSX, PDF) to local desktop and uploads to Google Drive."""
    try:
        desktop_path = get_arin_storage_root()
        
        # 1. Standardize and Format Date for Folder Name
        date_folder_name = request.dateStr
        formatted_date = date_folder_name
        try:
            from datetime import datetime
            dt = datetime.strptime(date_folder_name, "%Y-%m-%d")
            formatted_date = dt.strftime("%d %B %Y").lstrip('0') # e.g. 6 April 2026
        except: pass

        # Centralized local path: arin/Report/[Date]/
        target_dir = os.path.join(desktop_path, 'Report', formatted_date)
        os.makedirs(target_dir, exist_ok=True)

        # Implement non-overwriting filename increment logic
        base, ext = os.path.splitext(request.filename)
        # Append timestamp to the filename base
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename_with_timestamp = f"{base}_{timestamp}{ext}"
        file_path = os.path.join(target_dir, filename_with_timestamp)
        counter = 1
        while os.path.exists(file_path):
            file_path = os.path.join(target_dir, f"{base}_{timestamp} ({counter}){ext}")
            counter += 1
            
        final_filename = os.path.basename(file_path)
        ext = ext.lower()
        
        # Standardize data for processing
        df_list = []
        if request.data:
            for row in request.data:
                df_list.append({
                    "Arin ID": row.get("arin_id") or "N/A",
                    "Consumer Number": row.get("consumer_no") or row.get("consumer_number") or row.get("number") or row.get("consumerNumber") or "N/A",
                    "Consumer Name": row.get("consumer_name") or row.get("customer_name") or row.get("name") or row.get("consumerName") or "N/A",
                    "Generation": row.get("generated") or row.get("generation") or 0,
                    "Capacity": row.get("capacity") or 0,
                    "Export": row.get("export") or 0,
                    "Bill Amount (Rs)": row.get("amount") or row.get("billing_amount") or row.get("billingAmount") or row.get("Bill Amount (Rs)") or 0
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
            title_text = final_filename.replace("_", " ").replace(".pdf", "").upper()
            pdf.cell(0, 10, title_text, ln=True, align='C')
            pdf.ln(10)
            
            # Check if dataset contains Export data (non-zero exports exist)
            has_export = any("Export" in row and row["Export"] > 0 for row in df_list) or "export" in request.filename.lower()
            
            # Header
            pdf.set_font("Arial", 'B', 9)
            pdf.set_fill_color(240, 240, 240)
            if has_export:
                pdf.cell(20, 10, "Arin ID", 1, 0, 'C', True)
                pdf.cell(30, 10, "Consumer No", 1, 0, 'C', True)
                pdf.cell(65, 10, "Consumer Name", 1, 0, 'C', True)
                pdf.cell(25, 10, "Generation", 1, 0, 'C', True)
                pdf.cell(25, 10, "Capacity", 1, 0, 'C', True)
                pdf.cell(25, 10, "Export", 1, 0, 'C', True)
            else:
                pdf.cell(25, 10, "Arin ID", 1, 0, 'C', True)
                pdf.cell(35, 10, "Consumer No", 1, 0, 'C', True)
                pdf.cell(75, 10, "Consumer Name", 1, 0, 'C', True)
                pdf.cell(25, 10, "Gen", 1, 0, 'C', True)
                pdf.cell(30, 10, "Cap (KW)", 1, 0, 'C', True)
            pdf.ln()
            
            # Rows
            pdf.set_font("Arial", '', 8)
            for _, row in df.iterrows():
                if has_export:
                    pdf.cell(20, 10, str(row.get("Arin ID", "N/A")), 1)
                    pdf.cell(30, 10, str(row.get("Consumer Number", "N/A")), 1)
                    pdf.cell(65, 10, str(row.get("Consumer Name", "N/A"))[:32], 1)
                    pdf.cell(25, 10, str(row.get("Generation", "0")), 1, 0, 'R')
                    pdf.cell(25, 10, str(row.get("Capacity", "0")), 1, 0, 'R')
                    pdf.cell(25, 10, str(row.get("Export", "0")), 1, 0, 'R')
                else:
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
            if "Export" in df.columns and "export" not in request.filename.lower():
                df = df.drop(columns=["Export"])
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
                    bill_gen_root_id = get_or_create_date_folder(service, "billing_automation", drive_root_id)
                    report_root_id = get_or_create_date_folder(service, "Report", bill_gen_root_id)
                    report_date_folder_id = get_or_create_date_folder(service, formatted_date, report_root_id)
                    
                    if report_date_folder_id:
                        success, g_msg = upload_file_to_drive(service, file_path, final_filename, report_date_folder_id)
                        if success:
                            drive_status = f"Successfully uploaded to Drive: {formatted_date}/{final_filename}"
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


@app.get("/api/reports/list")
async def list_reports(user=Depends(get_current_user)):
    try:
        root = os.path.join(get_arin_storage_root(), 'Report')
        if not os.path.exists(root):
            return {"status": "success", "reports": []}
            
        reports = []
        for root_dir, dirs, files in os.walk(root):
            for file in files:
                if file.startswith('.'):
                    continue
                full_path = os.path.join(root_dir, file)
                rel_path = os.path.relpath(full_path, root)
                parts = rel_path.split(os.sep)
                # Structure: [DateFolder, filename]
                date_folder = parts[0] if len(parts) > 1 else "General"
                filename = parts[-1]
                stat = os.stat(full_path)
                reports.append({
                    "date": date_folder,
                    "filename": filename,
                    "size": stat.st_size,
                    "modified": stat.st_mtime,
                    "path": rel_path
                })
        # Sort by modified time descending
        reports.sort(key=lambda x: x["modified"], reverse=True)
        return {"status": "success", "reports": reports}
    except Exception as e:
        logger.error(f"Failed to list reports: {e}")
        raise HTTPException(status_code=500, detail=str(e))


from fastapi.responses import FileResponse

@app.get("/api/reports/download")
async def download_report(path: str, user=Depends(get_current_user)):
    try:
        # Prevent Directory Traversal
        root = os.path.abspath(os.path.join(get_arin_storage_root(), 'Report'))
        target_file = os.path.abspath(os.path.join(root, path))
        if not target_file.startswith(root) or not os.path.exists(target_file) or os.path.isdir(target_file):
            raise HTTPException(status_code=404, detail="File not found")
            
        return FileResponse(target_file, filename=os.path.basename(target_file))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to download report: {e}")
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
                
        # Deduplicate records
        seen = set()
        deduped_data = []
        for item in data:
            key = (item["consumerNumber"], item["date"])
            if key not in seen:
                seen.add(key)
                deduped_data.append(item)
                
        logger.info(f"Excel parsed: Found {len(data)} consumer entries (deduplicated to {len(deduped_data)}).")
        return {"status": "success", "data": deduped_data}
    except Exception as e:
        logger.error(f"Excel error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process Excel: {str(e)}")

@app.post("/api/import-consumers")
async def import_consumers(file: UploadFile = File(...), user=Depends(get_current_user)):
    """Parses Excel/CSV file to insert or update consumer profiles in the customers table."""
    try:
        filename = file.filename.lower()
        content = await file.read()
        
        if filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(content))
        elif filename.endswith(('.xlsx', '.xls')):
            df = pd.read_excel(io.BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Please upload an Excel (.xlsx/.xls) or CSV (.csv) file.")
        
        # Define mappings from possible Excel headers to database columns
        mappings = {
            'arin_id': ['arin id', 'arin_id', 'arin_identifier', 'id'],
            'customer_name': ['customer name', 'customer_name', 'name', 'consumer name', 'consumer_name'],
            'contact_number': ['contact number', 'contact_number', 'phone', 'contact', 'mobile', 'mobile number', 'mobile_number'],
            'zone': ['zone', 'area', 'region'],
            'current_location_link': ['location link', 'current_location_link', 'location', 'link', 'map link', 'map_link'],
            'address': ['address', 'addr'],
            'consumer_number': ['consumer number', 'consumer_number', 'consumer no', 'consumer_no', 'consumer no.', 'number', 'msedcl no'],
            'panel_name': ['panel name', 'panel_name', 'panel'],
            'panel_name_other': ['panel name other', 'panel_name_other', 'panel_other'],
            'panel_type': ['panel type', 'panel_type', 'type of panel'],
            'solar_wattpick': ['solar wattpick', 'solar_wattpick', 'wattpick', 'solar watt peak', 'solar_wattpeak'],
            'solar_panel_count': ['solar panel count', 'solar_panel_count', 'panel count', 'panels', 'no of panels', 'number of panels'],
            'solar_capacity_kw': ['solar capacity kw', 'solar_capacity_kw', 'capacity', 'capacity kw', 'solar capacity', 'capacity_kw', 'system size'],
            'panel_capacity_kw': ['panel capacity kw', 'panel_capacity_kw', 'panel capacity', 'panel_capacity_kw_value'],
            'inverter_name': ['inverter name', 'inverter_name', 'inverter'],
            'inverter_name_other': ['inverter name other', 'inverter_name_other', 'inverter_other'],
            'inverter_capacity': ['inverter capacity', 'inverter_capacity', 'inverter capacity kw', 'inverter_capacity_kw'],
            'commission_date': ['commission date', 'commission_date', 'commissioning date', 'date of commission', 'date_of_commission'],
            'wifi_available': ['wifi available', 'wifi_available', 'wifi', 'wifi_enabled'],
            'wifi_id': ['wifi id', 'wifi_id', 'wifi name', 'wifi_name'],
            'wifi_password': ['wifi password', 'wifi_password', 'wifi pass'],
            'visits_per_year': ['visits per year', 'visits_per_year', 'visits'],
            'total_visits_in_5_years': ['total visits in 5 years', 'total_visits_in_5_years', 'total visits', 'total_visits'],
            'maintenance_tenure': ['maintenance tenure', 'maintenance_tenure', 'tenure of maintenance', 'tenure'],
            'is_blacklisted': ['is blacklisted', 'is_blacklisted', 'blacklisted'],
            'inverter_warranty_expiry_date': ['inverter warranty expiry date', 'inverter_warranty_expiry_date', 'warranty expiry', 'inverter warranty expiry'],
            'panel_warranty_expiry_date': ['panel warranty expiry date', 'panel_warranty_expiry_date', 'panel warranty', 'panel_warranty'],
            'system_warranty_expiry_date': ['system warranty expiry date', 'system_warranty_expiry_date', 'system warranty', 'system_warranty'],
            'general_warranty_expiry_date': ['general warranty expiry date', 'general_warranty_expiry_date', 'general warranty', 'general_warranty', 'warranty'],
            'blacklisted_reason': ['blacklisted reason', 'blacklisted_reason', 'blacklist reason', 'blacklist_reason'],
            'portal_username': ['portal username', 'portal_username', 'portal id', 'portal_id', 'username'],
            'portal_password': ['portal password', 'portal_password', 'password']
        }
        
        # Clean DataFrame column names: lowercase, strip spaces and underscores for mapping
        df_cols_clean = {str(c).lower().replace(" ", "").replace("_", "").replace(".", ""): c for c in df.columns}
        
        # Map DataFrame columns to target DB columns
        mapped_columns = {}
        for db_col, variations in mappings.items():
            for var in variations:
                clean_var = var.lower().replace(" ", "").replace("_", "").replace(".", "")
                if clean_var in df_cols_clean:
                    mapped_columns[db_col] = df_cols_clean[clean_var]
                    break
        
        # Check if consumer_number is mapped
        if 'consumer_number' not in mapped_columns:
            raise HTTPException(status_code=400, detail="Missing required column: 'consumer_number' (or variations like 'Consumer No', 'Consumer Number') was not found in the file.")
        
        # Deduplicate dataframe based on normalized consumer number
        consumer_col = mapped_columns['consumer_number']
        def _normalize_excel_cnum(val):
            if pd.isna(val):
                return ""
            return str(val).split('.')[0].replace(" ", "").strip()
            
        df['_normalized_cnum'] = df[consumer_col].apply(_normalize_excel_cnum)
        df = df[df['_normalized_cnum'] != ""]
        df = df.drop_duplicates(subset=['_normalized_cnum'], keep='first')

        from processing import get_db_connection
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=500, detail="Failed to connect to database.")
            
        cursor = conn.cursor()
        
        records_imported = 0
        records_updated = 0
        records_skipped = 0
        warnings = []
        
        # Parse and process row by row
        for index, row in df.iterrows():
            # Get consumer number
            raw_c_num = row[mapped_columns['consumer_number']]
            if pd.isna(raw_c_num):
                records_skipped += 1
                warnings.append(f"Row {index+2}: Skipped due to missing Consumer Number.")
                continue
                
            # Normalize consumer number: convert float to string, remove '.0' if parsed as float, remove spaces
            c_num = str(raw_c_num).split('.')[0].replace(" ", "").strip()
            if not c_num:
                records_skipped += 1
                warnings.append(f"Row {index+2}: Skipped due to empty Consumer Number.")
                continue
                
            # Extract other values with fallbacks
            def get_val(db_key, default_val=None, is_int=False, is_float=False, is_date=False, is_bool=False):
                if db_key not in mapped_columns:
                    return default_val
                val = row[mapped_columns[db_key]]
                if pd.isna(val):
                    return default_val
                    
                if is_int:
                    try:
                        return int(float(str(val).replace(",", "").strip()))
                    except:
                        return default_val
                elif is_float:
                    try:
                        return float(str(val).replace(",", "").strip())
                    except:
                        return default_val
                elif is_bool:
                    val_str = str(val).strip().lower()
                    if val_str in ('1', 'true', 'yes', 'y', 'enabled', 'active'):
                        return 1
                    elif val_str in ('0', 'false', 'no', 'n', 'disabled', 'inactive'):
                        return 0
                    return default_val
                elif is_date:
                    if isinstance(val, (datetime, pd.Timestamp)):
                        return val.strftime("%Y-%m-%d")
                    # Try parsing date string
                    val_str = str(val).strip()
                    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%Y/%m/%d', '%b %Y', '%B %Y', '%b-%Y', '%B-%Y'):
                        try:
                            return datetime.strptime(val_str, fmt).strftime('%Y-%m-%d')
                        except:
                            pass
                    return default_val
                else:
                    return str(val).strip()

            arin_id = get_val('arin_id')
            customer_name = get_val('customer_name', 'Unknown')
            contact_number = get_val('contact_number', 'N/A')
            zone = get_val('zone', 'Other')
            current_location_link = get_val('current_location_link', '')
            address = get_val('address', 'N/A')
            
            panel_name = get_val('panel_name', 'Other')
            panel_name_other = get_val('panel_name_other')
            panel_type = get_val('panel_type')
            solar_wattpick = get_val('solar_wattpick', is_int=True)
            solar_panel_count = get_val('solar_panel_count', 0, is_int=True)
            solar_capacity_kw = get_val('solar_capacity_kw', 0, is_int=True)
            panel_capacity_kw = get_val('panel_capacity_kw', 0, is_int=True)
            
            inverter_name = get_val('inverter_name', 'Other')
            inverter_name_other = get_val('inverter_name_other')
            inverter_capacity = get_val('inverter_capacity', 0, is_int=True)
            
            commission_date = get_val('commission_date', datetime.now().strftime("%Y-%m-%d"), is_date=True)
            
            wifi_available = get_val('wifi_available', 0, is_bool=True)
            wifi_id = get_val('wifi_id')
            wifi_password = get_val('wifi_password')
            
            visits_per_year = get_val('visits_per_year', 2, is_int=True)
            total_visits_in_5_years = get_val('total_visits_in_5_years', 10, is_int=True)
            maintenance_tenure = get_val('maintenance_tenure')
            is_blacklisted = get_val('is_blacklisted', 0, is_bool=True)
            
            inverter_warranty_expiry_date = get_val('inverter_warranty_expiry_date', is_date=True)
            panel_warranty_expiry_date = get_val('panel_warranty_expiry_date', is_date=True)
            system_warranty_expiry_date = get_val('system_warranty_expiry_date', is_date=True)
            general_warranty_expiry_date = get_val('general_warranty_expiry_date', is_date=True)
            blacklisted_reason = get_val('blacklisted_reason')
            portal_username = get_val('portal_username')
            portal_password = get_val('portal_password')

            # Upsert into customers table
            query = """
                INSERT INTO customers (
                    arin_id, customer_name, contact_number, zone, current_location_link, address, 
                    consumer_number, panel_name, panel_name_other, panel_type, solar_wattpick, 
                    solar_panel_count, solar_capacity_kw, panel_capacity_kw, inverter_name, 
                    inverter_name_other, inverter_capacity, commission_date, wifi_available, 
                    wifi_id, wifi_password, visits_per_year, total_visits_in_5_years, maintenance_tenure, is_blacklisted, 
                    inverter_warranty_expiry_date, panel_warranty_expiry_date, system_warranty_expiry_date,
                    general_warranty_expiry_date, blacklisted_reason, portal_username, portal_password
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                ) ON DUPLICATE KEY UPDATE 
                    arin_id = VALUES(arin_id),
                    customer_name = VALUES(customer_name),
                    contact_number = VALUES(contact_number),
                    zone = VALUES(zone),
                    current_location_link = VALUES(current_location_link),
                    address = VALUES(address),
                    panel_name = VALUES(panel_name),
                    panel_name_other = VALUES(panel_name_other),
                    panel_type = VALUES(panel_type),
                    solar_wattpick = VALUES(solar_wattpick),
                    solar_panel_count = VALUES(solar_panel_count),
                    solar_capacity_kw = VALUES(solar_capacity_kw),
                    panel_capacity_kw = VALUES(panel_capacity_kw),
                    inverter_name = VALUES(inverter_name),
                    inverter_name_other = VALUES(inverter_name_other),
                    inverter_capacity = VALUES(inverter_capacity),
                    commission_date = VALUES(commission_date),
                    wifi_available = VALUES(wifi_available),
                    wifi_id = VALUES(wifi_id),
                    wifi_password = VALUES(wifi_password),
                    visits_per_year = VALUES(visits_per_year),
                    total_visits_in_5_years = VALUES(total_visits_in_5_years),
                    maintenance_tenure = VALUES(maintenance_tenure),
                    is_blacklisted = VALUES(is_blacklisted),
                    inverter_warranty_expiry_date = VALUES(inverter_warranty_expiry_date),
                    panel_warranty_expiry_date = VALUES(panel_warranty_expiry_date),
                    system_warranty_expiry_date = VALUES(system_warranty_expiry_date),
                    general_warranty_expiry_date = VALUES(general_warranty_expiry_date),
                    blacklisted_reason = VALUES(blacklisted_reason),
                    portal_username = VALUES(portal_username),
                    portal_password = VALUES(portal_password)
            """
            
            try:
                cursor.execute(query, (
                    arin_id, customer_name, contact_number, zone, current_location_link, address,
                    c_num, panel_name, panel_name_other, panel_type, solar_wattpick,
                    solar_panel_count, solar_capacity_kw, panel_capacity_kw, inverter_name,
                    inverter_name_other, inverter_capacity, commission_date, wifi_available,
                    wifi_id, wifi_password, visits_per_year, total_visits_in_5_years, maintenance_tenure, is_blacklisted,
                    inverter_warranty_expiry_date, panel_warranty_expiry_date, system_warranty_expiry_date,
                    general_warranty_expiry_date, blacklisted_reason, portal_username, portal_password
                ))
                # Check if it was an insert or update
                if cursor.rowcount == 1:
                    records_imported += 1
                elif cursor.rowcount == 2:
                    records_updated += 1
                else:
                    # Rowcount can be 0 if it exists but no values changed
                    records_updated += 1
            except Exception as row_err:
                records_skipped += 1
                warnings.append(f"Row {index+2} (Consumer {c_num}): Error saving to database: {row_err}")
                logger.error(f"Error importing row {index+2}: {row_err}")
        
        conn.commit()
        cursor.close()
        conn.close()
        
        logger.info(f"Consumer import complete. Imported: {records_imported}, Updated: {records_updated}, Skipped: {records_skipped}")
        
        return {
            "status": "success",
            "imported": records_imported,
            "updated": records_updated,
            "skipped": records_skipped,
            "warnings": warnings[:50]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error importing consumers: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to process file: {str(e)}")

@app.post("/api/save-customer")
def save_customer_endpoint(customer: CustomerModel, user=Depends(get_current_user)):
    """Inserts or updates a single customer profile."""
    from processing import get_db_connection
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Failed to connect to database.")
    try:
        cursor = conn.cursor()
        
        # Convert dates if present
        comm_date = customer.commission_date
        if not comm_date:
            comm_date = datetime.now().strftime("%Y-%m-%d")
            
        query = """
            INSERT INTO customers (
                arin_id, customer_name, contact_number, zone, current_location_link, address, 
                consumer_number, panel_name, panel_name_other, panel_type, solar_wattpick, 
                solar_panel_count, solar_capacity_kw, panel_capacity_kw, inverter_name, 
                inverter_name_other, inverter_capacity, commission_date, wifi_available, 
                wifi_id, wifi_password, visits_per_year, total_visits_in_5_years, maintenance_tenure, is_blacklisted, 
                inverter_warranty_expiry_date, panel_warranty_expiry_date, system_warranty_expiry_date,
                general_warranty_expiry_date, blacklisted_reason, portal_username, portal_password
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            ) ON DUPLICATE KEY UPDATE 
                arin_id = VALUES(arin_id),
                customer_name = VALUES(customer_name),
                contact_number = VALUES(contact_number),
                zone = VALUES(zone),
                current_location_link = VALUES(current_location_link),
                address = VALUES(address),
                panel_name = VALUES(panel_name),
                panel_name_other = VALUES(panel_name_other),
                panel_type = VALUES(panel_type),
                solar_wattpick = VALUES(solar_wattpick),
                solar_panel_count = VALUES(solar_panel_count),
                solar_capacity_kw = VALUES(solar_capacity_kw),
                panel_capacity_kw = VALUES(panel_capacity_kw),
                inverter_name = VALUES(inverter_name),
                inverter_name_other = VALUES(inverter_name_other),
                inverter_capacity = VALUES(inverter_capacity),
                commission_date = VALUES(commission_date),
                wifi_available = VALUES(wifi_available),
                wifi_id = VALUES(wifi_id),
                wifi_password = VALUES(wifi_password),
                visits_per_year = VALUES(visits_per_year),
                total_visits_in_5_years = VALUES(total_visits_in_5_years),
                maintenance_tenure = VALUES(maintenance_tenure),
                is_blacklisted = VALUES(is_blacklisted),
                inverter_warranty_expiry_date = VALUES(inverter_warranty_expiry_date),
                panel_warranty_expiry_date = VALUES(panel_warranty_expiry_date),
                system_warranty_expiry_date = VALUES(system_warranty_expiry_date),
                general_warranty_expiry_date = VALUES(general_warranty_expiry_date),
                blacklisted_reason = VALUES(blacklisted_reason),
                portal_username = VALUES(portal_username),
                portal_password = VALUES(portal_password)
        """
        
        cursor.execute(query, (
            customer.arin_id, customer.customer_name, customer.contact_number, customer.zone,
            customer.current_location_link, customer.address, customer.consumer_number,
            customer.panel_name, customer.panel_name_other, customer.panel_type,
            customer.solar_wattpick, customer.solar_panel_count, customer.solar_capacity_kw,
            customer.panel_capacity_kw, customer.inverter_name, customer.inverter_name_other,
            customer.inverter_capacity, comm_date, customer.wifi_available,
            customer.wifi_id, customer.wifi_password, customer.visits_per_year,
            customer.total_visits_in_5_years, customer.maintenance_tenure, customer.is_blacklisted,
            customer.inverter_warranty_expiry_date, customer.panel_warranty_expiry_date,
            customer.system_warranty_expiry_date, customer.general_warranty_expiry_date,
            customer.blacklisted_reason, customer.portal_username, customer.portal_password
        ))
        
        conn.commit()
        cursor.close()
        conn.close()
        
        return {"status": "success", "message": "Customer profile saved successfully."}
    except Exception as e:
        logger.error(f"Error saving customer: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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
    Blocks generation if customer is blacklisted.
    """
    # Check if blacklisted in database first
    from processing import get_db_connection
    conn = get_db_connection()
    if conn:
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT is_blacklisted, blacklisted_reason FROM customers WHERE consumer_number = %s", (consumerNumber,))
            cust_row = cursor.fetchone()
            if cust_row and cust_row.get("is_blacklisted"):
                reason = cust_row.get("blacklisted_reason") or "No reason provided"
                raise HTTPException(
                    status_code=400, 
                    detail=f"Bill analysis cannot be generated: Customer is blacklisted. Reason: {reason}"
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error checking blacklist status: {e}")
        finally:
            conn.close()

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
            "customer_name": "N/A",
            "is_blacklisted": 0,
            "blacklisted_reason": ""
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
        "bill_status": target_bill.get("bill_status") or "Normal",
        "reading_date": target_bill.get("reading_date"),
        "capacity": target_bill.get("solar_capacity_kw") or target_bill.get("capacity", 0),
        "commission_date": target_bill.get("commission_date"),
        "is_blacklisted": target_bill.get("is_blacklisted") or 0,
        "blacklisted_reason": target_bill.get("blacklisted_reason") or "",
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

@app.delete("/api/customers/{consumer_number}")
def delete_customer_endpoint(consumer_number: str, user=Depends(get_current_user)):
    """Deletes a customer profile and their associated bills from the database."""
    try:
        from processing import delete_customer_from_db
        success, message = delete_customer_from_db(consumer_number)
        if not success:
            raise HTTPException(status_code=500, detail=message)
        return {"status": "success", "message": message}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete customer: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/customers/deduplicate")
def deduplicate_customers_endpoint(user=Depends(get_current_user)):
    """Resolves and removes duplicate consumer profiles keeping the oldest entry."""
    try:
        from processing import deduplicate_database_profiles
        success, message = deduplicate_database_profiles()
        if not success:
            raise HTTPException(status_code=500, detail=message)
        return {"status": "success", "message": message}
    except Exception as e:
        logger.error(f"Failed to deduplicate customers: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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
    # print(f"Fetched consumers: {data}")
    if not success:
        raise HTTPException(status_code=500, detail=data)
        
    # Auto-insert missing consumers with "Data yet to fill"
    try:
        from processing import get_db_connection
        conn = get_db_connection()
        if conn:
            cursor = conn.cursor(dictionary=True)
            # Ensure columns exist dynamically
            try:
                cursor.execute("ALTER TABLE customers ADD COLUMN billing_unit VARCHAR(50) DEFAULT NULL")
            except Exception: pass
            try:
                cursor.execute("ALTER TABLE customers ADD COLUMN label VARCHAR(50) DEFAULT NULL")
            except Exception: pass
            
            for consumer in data:
                cnum = consumer.get("consumerNumber")
                cname = consumer.get("name")
                bu = consumer.get("bu")
                if cnum:
                    cursor.execute("SELECT id FROM customers WHERE consumer_number = %s", (cnum,))
                    if not cursor.fetchone():
                        # Also check backup
                        try:
                            cursor.execute("SELECT id FROM customers_backup WHERE consumer_number = %s", (cnum,))
                            if cursor.fetchone(): continue
                        except Exception: pass
                        
                        logger.info(f"Adding missing consumer {cnum} from portal to database.")
                        cursor.execute(
                            "INSERT INTO customers (consumer_number, customer_name, billing_unit, label) VALUES (%s, %s, %s, %s)",
                            (cnum, cname, bu, "Data yet to fill")
                        )
            conn.commit()
            conn.close()
    except Exception as e:
        logger.error(f"Error saving missing consumers: {e}")
        
    return data

@app.post("/api/close")
def close_browser(user=Depends(get_current_user)):
    """Closes the primary browser session."""
    primary_automation.close()
    return {"status": "success", "message": "Browser closed."}

@app.post("/api/refresh-tab")
def refresh_tab(user=Depends(get_current_user)):
    """Refreshes the current active page in the primary browser session."""
    if not primary_automation.driver:
        raise HTTPException(status_code=400, detail="Primary browser not active.")
    try:
        primary_automation.driver.refresh()
        return {"status": "success", "message": "Tab refreshed successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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

from fastapi.responses import StreamingResponse
import asyncio
import base64

class LoginStartReq(BaseModel):
    username: str
    password: str
    dateStr: Optional[str] = None
    customId: Optional[str] = None

class CaptchaSubmitReq(BaseModel):
    captcha: str

class OtpSubmitReq(BaseModel):
    otp: str

# Global state to pass date to primary_automation after playwright login
active_login_date = None
active_login_custom_id = None

def handoff_to_selenium(res):
    if res.get("status") == "SUCCESS" and "session" in res:
        # Launch the old selenium headless to do the actual scraping.
        success, msg = primary_automation.launch_browser(active_login_date)
        if not success:
            logger.error(f"Selenium handoff failed after login: {msg}")
            return {"status": "ERROR", "message": f"Login succeeded, but browser handoff failed: {msg}"}

        sel_cookies = []
        for c in res["session"]:
            sc = {"name": c["name"], "value": c["value"], "domain": c["domain"], "path": c["path"]}
            sel_cookies.append(sc)

        if not primary_automation.set_cookies(sel_cookies):
            logger.error("Selenium handoff failed while restoring cookies after login")
            primary_automation.close()
            return {"status": "ERROR", "message": "Login succeeded, but browser session could not be restored."}

        # Store customId if needed
        primary_automation.custom_id = active_login_custom_id

    return res

@app.post("/api/start-login")
async def api_start_login(req: LoginStartReq, user=Depends(get_current_user)):
    global active_login_date, active_login_custom_id
    active_login_date = req.dateStr
    active_login_custom_id = req.customId
    
    password_to_use = req.password
    if req.password == req.username:
        from processing import get_db_connection
        conn = get_db_connection()
        if conn:
            try:
                cursor = conn.cursor()
                cursor.execute("SELECT password FROM portal_credentials WHERE username = %s", (req.username.strip(),))
                row = cursor.fetchone()
                if row:
                    password_to_use = row[0]
                    logger.info(f"Using database password for portal user {req.username}")
            except Exception as e:
                logger.error(f"Error looking up portal password for {req.username}: {e}")
            finally:
                conn.close()

    res = await login_automator.start_login(req.username, password_to_use)
    handoff_res = handoff_to_selenium(res)
    if handoff_res is not res and handoff_res.get("status") == "ERROR":
        return handoff_res
    return res

@app.post("/api/submit-captcha")
async def api_submit_captcha(req: CaptchaSubmitReq, user=Depends(get_current_user)):
    res = await login_automator.submit_captcha(req.captcha)
    handoff_res = handoff_to_selenium(res)
    if handoff_res is not res and handoff_res.get("status") == "ERROR":
        return handoff_res
    return res

@app.post("/api/submit-otp")
async def api_submit_otp(req: OtpSubmitReq, user=Depends(get_current_user)):
    res = await login_automator.submit_otp(req.otp)
    handoff_res = handoff_to_selenium(res)
    if handoff_res is not res and handoff_res.get("status") == "ERROR":
        return handoff_res
    return res

@app.post("/api/reset")
async def api_reset(user=Depends(get_current_user)):
    await login_automator.close_browser()
    # also reset old automation if present
    primary_automation.close()
    
    # Delete saved session cookie files so next login is guaranteed to be fresh
    try:
        import glob
        files = glob.glob("backend/secrets/session_cookies_*.json")
        for f in files:
            try:
                os.remove(f)
                logger.info(f"Deleted saved session cookie file {f} on reset request")
            except Exception as fe:
                logger.warning(f"Failed to remove file {f}: {fe}")
    except Exception as e:
        logger.error(f"Failed to delete session cookie files on reset: {e}")
        
    return {"status": "success"}


class AddConsumerRequest(BaseModel):
    consumerNumber: str
    billingUnit: str
    consumerType: Optional[str] = "1"


class AddConsumerCaptchaReq(BaseModel):
    captcha: str


class AddConsumerOtpReq(BaseModel):
    otp: str


@app.post("/api/portal/add-consumer/start")
async def add_consumer_start(request: AddConsumerRequest, user=Depends(get_current_user)):
    cnum = request.consumerNumber.strip()
    bu = request.billingUnit.strip()
    ctype = (request.consumerType or "1").strip()
    
    if not cnum or not bu:
        raise HTTPException(status_code=400, detail="Consumer Number and Billing Unit are required.")
    
    try:
        res = await login_automator.start_add_consumer(cnum, bu, ctype)
        return res
    except Exception as e:
        logger.error(f"Failed to start add consumer: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/portal/add-consumer/options")
async def add_consumer_options(consumerType: Optional[str] = "1", user=Depends(get_current_user)):
    try:
        res = await login_automator.get_add_consumer_options(consumerType)
        return res
    except Exception as e:
        logger.error(f"Failed to get add consumer options: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/portal/add-consumer/cancel")
async def add_consumer_cancel(user=Depends(get_current_user)):
    try:
        res = await login_automator.return_to_dashboard()
        return res
    except Exception as e:
        logger.error(f"Failed to cancel add consumer navigation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/portal/add-consumer/captcha")
async def add_consumer_captcha(request: AddConsumerCaptchaReq, user=Depends(get_current_user)):
    try:
        res = await login_automator.submit_add_consumer_captcha(request.captcha.strip())
        return res
    except Exception as e:
        logger.error(f"Failed to submit add consumer captcha: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/portal/add-consumer/otp")
async def add_consumer_otp(request: AddConsumerOtpReq, user=Depends(get_current_user)):
    try:
        res = await login_automator.submit_add_consumer_otp(request.otp.strip())
        return res
    except Exception as e:
        logger.error(f"Failed to submit add consumer otp: {e}")
        raise HTTPException(status_code=500, detail=str(e))




class ProcessRequest(BaseModel):
    threshold: Optional[int] = 75


def process_data_task(storage_path, threshold=75):
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
        results = process_downloads(storage_path, progress_callback=progress_callback, threshold=threshold)
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
def process_data(background_tasks: BackgroundTasks, request: Optional[ProcessRequest] = None, user=Depends(get_current_user)):
    """Triggers PDF processing and MySQL storage asynchronously."""
    threshold = 75
    if request:
        threshold = request.threshold or 75
        
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
        
    storage_path = get_arin_storage_path(date_str)
    
    background_tasks.add_task(process_data_task, storage_path, threshold)
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
            
        target_dir = get_arin_storage_path(date_str)
        
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

def _build_download_status():
    date_str = primary_automation.process_date if primary_automation.process_date else "unknown_date"

    # Standardize date to YYYY-MM-DD to match automation.py folder structure.
    try:
        from datetime import datetime, timedelta
        if "T" in date_str:
            dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            dt = dt + timedelta(hours=5, minutes=30)
            date_str = dt.strftime("%Y-%m-%d")
        else:
            dt = datetime.strptime(date_str, "%Y-%m-%d")
            date_str = dt.strftime("%Y-%m-%d")
    except Exception:
        pass

    storage_path = get_arin_storage_path(date_str)
    total_bills = global_total_bills
    completed = 0
    filenames = []
    success_list = []

    # PDFs can be deleted from local storage after Drive upload, so count cache first.
    cache_path = os.path.join(storage_path, "extracted_cache.json")
    if os.path.exists(cache_path):
        import json
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                cache_data = json.load(f)
            success_list = [str(c.get("consumer_number", "Unknown")) for c in cache_data]
            filenames = [f"{consumer}.pdf" for consumer in success_list]
            completed = len(set(success_list))
        except Exception as e:
            logger.warning(f"Could not read download cache at {cache_path}: {e}")

    if os.path.exists(storage_path):
        import re
        pdf_files = glob.glob(os.path.join(storage_path, "*.pdf"))
        for file_path in pdf_files:
            filename = os.path.basename(file_path)
            if filename not in filenames:
                filenames.append(filename)
            match = re.search(r"(\d{10,12})", filename)
            if match and match.group(1) not in success_list:
                success_list.append(match.group(1))
        completed = len(set(success_list))

    failed = 0
    if not download_in_progress and total_bills > 0:
        failed = max(0, total_bills - completed)

    return {
        "completed": completed,
        "total": total_bills if total_bills > 0 else completed,
        "failed": failed,
        "in_progress": download_in_progress,
        "filenames": filenames,
        "success_list": success_list,
    }


@app.get("/api/download-status")
async def get_download_status(user=Depends(get_current_user)):
    """Returns current download status without waiting behind download workers."""
    return await asyncio.to_thread(_build_download_status)


@app.get("/api/remote-view")
async def get_remote_view(user=Depends(get_current_user)):
    """Returns a screenshot of the currently active browser session."""
    try:
        if login_automator.page:
            screenshot = await login_automator.page.screenshot(full_page=False)
            image_b64 = base64.b64encode(screenshot).decode("utf-8")
            page_title = await login_automator.page.title()
            return {
                "status": "success",
                "image": f"data:image/png;base64,{image_b64}",
                "title": page_title,
                "url": login_automator.page.url,
                "mode": "playwright",
            }

        driver = primary_automation.driver
        if driver:
            screenshot = await asyncio.to_thread(driver.get_screenshot_as_png)
            image_b64 = base64.b64encode(screenshot).decode("utf-8")
            return {
                "status": "success",
                "image": f"data:image/png;base64,{image_b64}",
                "title": driver.title,
                "url": driver.current_url,
                "mode": "selenium",
            }

        return {"status": "error", "message": "No active browser session is available."}
    except Exception as e:
        logger.error(f"Failed to capture remote view screenshot: {e}")
        return {"status": "error", "message": str(e)}

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
    
    # Check if the file exists in the static build output
    file_path = os.path.join(FRONTEND_DIST_DIR, full_path)
    if os.path.isfile(file_path):
        return FileResponse(file_path)

    if os.path.isfile(FRONTEND_INDEX_FILE):
        return FileResponse(FRONTEND_INDEX_FILE)
    raise HTTPException(status_code=404, detail="Not Found")
