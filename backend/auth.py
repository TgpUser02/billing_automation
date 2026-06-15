"""
Authentication Module — Arin Energy Billing Automation
Handles: bcrypt password hashing, JWT tokens, rate limiting, reCAPTCHA verification.
SQL-backed user authentication only.
"""

import os
import time
import logging
from datetime import datetime, timedelta
from typing import Optional
from collections import defaultdict

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
import httpx

from dotenv import load_dotenv
load_dotenv(override=True)
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'), override=True)

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "arin-energy-super-secret-key-change-in-production-2026")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRATION_MINUTES = int(os.getenv("JWT_EXPIRATION_MINUTES", "1440")) # Default to 24 hours

RECAPTCHA_SECRET_KEY = os.getenv("RECAPTCHA_SECRET_KEY", "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe")  # Test key
RECAPTCHA_SITE_KEY = os.getenv("RECAPTCHA_SITE_KEY", "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI")    # Test key

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION_MINUTES = 15

# ═══════════════════════════════════════════════════════════════════════════════
# PASSWORD HASHING (bcrypt)
# ═══════════════════════════════════════════════════════════════════════════════

import bcrypt

def hash_password(plain_password: str) -> str:
    """Hash a password using bcrypt."""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(plain_password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its bcrypt hash."""
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

# ═══════════════════════════════════════════════════════════════════════════════
# JWT TOKEN MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════

security = HTTPBearer(auto_error=False)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=JWT_EXPIRATION_MINUTES))
    to_encode.update({"exp": expire, "iat": datetime.utcnow()})
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    """Decode and validate a JWT token."""
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError as e:
        logger.warning(f"JWT decode failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalid or expired",
            headers={"WWW-Authenticate": "Bearer"}
        )

def refresh_access_token(token: str) -> str:
    """Issue a new token based on an existing one, even if the existing one is expired."""
    try:
        # Decode without verifying expiration so we can refresh an expired session
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM], options={"verify_exp": False})
        username = payload.get("sub")
        role = payload.get("role", "operator")
        
        if not username:
            raise ValueError("Token payload missing subject")
            
        return create_access_token({"sub": username, "role": role})
    except Exception as e:
        logger.error(f"Token refresh failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session could not be refreshed. Please login again.",
        )

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """FastAPI dependency to extract and validate current user from JWT."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    try:
        payload = decode_token(credentials.credentials)
        username = payload.get("sub")
        if not username:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return {"username": username, "role": payload.get("role", "operator")}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

# ═══════════════════════════════════════════════════════════════════════════════
# RATE LIMITING (In-Memory)
# ═══════════════════════════════════════════════════════════════════════════════

# Track: { "username_or_ip": { "count": int, "locked_until": float } }
_rate_limit_store: dict = defaultdict(lambda: {"count": 0, "locked_until": 0.0})

def check_rate_limit(identifier: str) -> bool:
    """
    Check if the identifier (username or IP) is rate-limited.
    Returns True if allowed, False if locked.
    """
    entry = _rate_limit_store[identifier]
    
    # Check if currently locked
    if entry["locked_until"] > time.time():
        return False
    
    # Reset if lock has expired
    if entry["locked_until"] > 0 and entry["locked_until"] <= time.time():
        entry["count"] = 0
        entry["locked_until"] = 0.0
    return True

def record_failed_attempt(identifier: str) -> None:
    """Record a failed login attempt. Lock after MAX_FAILED_ATTEMPTS."""
    entry = _rate_limit_store[identifier]
    entry["count"] += 1
    logger.warning(f"Failed login attempt #{entry['count']} for: {identifier}")
    
    if entry["count"] >= MAX_FAILED_ATTEMPTS:
        entry["locked_until"] = time.time() + (LOCKOUT_DURATION_MINUTES * 60)
        logger.warning(f"LOCKED OUT: {identifier} for {LOCKOUT_DURATION_MINUTES} minutes")

def record_successful_login(*identifiers: str) -> None:
    """Reset rate limit counter on successful login for all provided identifiers."""
    for identifier in identifiers:
        if identifier:
            _rate_limit_store[identifier] = {"count": 0, "locked_until": 0.0}

def get_remaining_attempts(identifier: str) -> int:
    """Get remaining login attempts before lockout."""
    entry = _rate_limit_store[identifier]
    return max(0, MAX_FAILED_ATTEMPTS - entry["count"])

# ═══════════════════════════════════════════════════════════════════════════════
# reCAPTCHA VERIFICATION
# ═══════════════════════════════════════════════════════════════════════════════

async def verify_recaptcha(token: str) -> bool:
    """Server-side verification of Google reCAPTCHA v2 token."""
    if not token:
        return False
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://www.google.com/recaptcha/api/siteverify",
                data={
                    "secret": RECAPTCHA_SECRET_KEY,
                    "response": token
                }
            )
            result = resp.json()
            success = result.get("success", False)
            if not success:
                logger.warning(f"reCAPTCHA verification failed: {result.get('error-codes', [])}")
            return success
    except Exception as e:
        logger.error(f"reCAPTCHA verification error: {e}")
        # Fail open during development (test keys always pass)
        return True

# ═══════════════════════════════════════════════════════════════════════════════
# SQL USER DATABASE
# ═══════════════════════════════════════════════════════════════════════════════

def get_user_from_db(username: str) -> Optional[dict]:
    """Fetch user from SQL users table by username or email."""
    try:
        from processing import get_db_connection
        conn = get_db_connection()
        if not conn:
            logger.error("MySQL connection unavailable for user lookup")
            return None

        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT id, username, password_hash, role, is_active, failed_attempts, locked_until FROM users WHERE username = %s OR email = %s",
            (username, username)
        )
        user = cursor.fetchone()
        cursor.close()
        conn.close()
        return user
    except Exception as e:
        logger.error(f"MySQL lookup failed for {username}: {e}")
    
    return None

def update_user_failed_attempts(username: str, count: int, locked_until=None) -> None:
    """Update failed attempt counter in SQL."""
    try:
        from processing import get_db_connection
        conn = get_db_connection()
        if not conn:
            logger.error("MySQL connection unavailable for failed-attempt update")
            return

        cursor = conn.cursor()
        cursor.execute(
            "UPDATE users SET failed_attempts = %s, locked_until = %s WHERE username = %s",
            (count, locked_until, username)
        )
        conn.commit()
        cursor.close()
        conn.close()
    except Exception as e:
        logger.error(f"Could not update DB for {username}: {e}")

def reset_user_failed_attempts(username: str) -> None:
    """Reset failed attempts on successful login."""
    update_user_failed_attempts(username, 0, None)

def change_user_password(username: str, new_password: str) -> bool:
    """Change user password in SQL."""
    new_hash = hash_password(new_password)

    try:
        from processing import get_db_connection
        conn = get_db_connection()
        if not conn:
            logger.error("MySQL connection unavailable for password change")
            return False

        cursor = conn.cursor()
        cursor.execute(
            "UPDATE users SET password_hash = %s WHERE username = %s",
            (new_hash, username)
        )
        conn.commit()
        updated = cursor.rowcount > 0
        cursor.close()
        conn.close()
        if updated:
            logger.info(f"Password changed for user: {username}")
            return True

        logger.warning(f"Password change failed; user not found: {username}")
    except Exception as e:
        logger.error(f"Could not update password in DB: {e}")
    
    return False
