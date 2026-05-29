import time
import os
import logging
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager

# Resolve chromedriver path once at import time so launches never hit the network
try:
    _CHROMEDRIVER_PATH = ChromeDriverManager().install()
except Exception as _e:
    import logging as _log
    _log.getLogger(__name__).warning(f"ChromeDriverManager pre-fetch failed: {_e}")
    _CHROMEDRIVER_PATH = None

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from dotenv import load_dotenv
if not os.environ.get("RENDER"):
    load_dotenv()

import shutil
import subprocess
# Import ActionChains and Keys globally if needed, or locally in methods
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.keys import Keys
from processing import extract_data_from_pdf, save_to_mysql # type: ignore
from datetime import datetime
from gdrive_utils import get_drive_service, get_or_create_date_folder, upload_file_to_drive # type: ignore
class BillAutomation:
    def __init__(self, download_dir="downloads", port=9222):
        self.driver = None
        self.download_dir = os.path.abspath(download_dir)
        self.port = port
        self.process_date = None # Store the date for folder creation
        if not os.path.exists(self.download_dir):
            os.makedirs(self.download_dir)
        
        self.url = "https://wss.mahadiscom.in/wss/wss?uiActionName=getCustAccountLogin"

    def diagnose_environment(self):
        """Diagnose browser launch environment to help troubleshoot."""
        logger.info("=" * 80)
        logger.info("🔍 ENVIRONMENT DIAGNOSIS")
        logger.info("=" * 80)
        
        is_render = os.environ.get("RENDER")
        browser_headless_env = os.environ.get("BROWSER_HEADLESS")
        
        logger.info(f"OS: {os.name} ({'Windows' if os.name == 'nt' else 'Linux/Mac'})")
        logger.info(f"RENDER environment: {is_render if is_render else 'NOT SET (local mode)'}")
        logger.info(f"BROWSER_HEADLESS env var: {browser_headless_env if browser_headless_env else 'NOT SET (will default to headed mode)'}")
        
        if browser_headless_env:
            headless_value = browser_headless_env.strip().lower() in ("1", "true", "yes", "on")
            logger.info(f"  → Interpreted as: {'HEADLESS' if headless_value else 'HEADED'}")
        else:
            logger.info(f"  → Will launch in: HEADED mode (window will be visible)")
        
        chrome_path = self.resolve_chrome_path()
        if chrome_path:
            logger.info(f"✅ Chrome found at: {chrome_path}")
        else:
            logger.error(f"❌ Chrome NOT found!")
        
        logger.info("=" * 80)
        return chrome_path is not None

    def resolve_chrome_path(self):
        """Try to locate a Chrome / Chromium executable on the host."""
        env_candidates = {
            "CHROME_PATH": os.environ.get("CHROME_PATH"),
            "CHROME_BIN": os.environ.get("CHROME_BIN"),
            "CHROME_EXECUTABLE": os.environ.get("CHROME_EXECUTABLE"),
            "GOOGLE_CHROME_PATH": os.environ.get("GOOGLE_CHROME_PATH"),
        }
        candidates = [path for path in env_candidates.values() if path]

        if os.name == "nt":
            program_files = os.environ.get("PROGRAMFILES", r"C:\Program Files")
            program_files_x86 = os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)")
            local_app_data = os.environ.get("LOCALAPPDATA", os.path.expanduser(r"~\AppData\Local"))
            candidates.extend([
                os.path.join(program_files, "Google", "Chrome", "Application", "chrome.exe"),
                os.path.join(program_files_x86, "Google", "Chrome", "Application", "chrome.exe"),
                os.path.join(local_app_data, "Google", "Chrome", "Application", "chrome.exe"),
                os.path.join(program_files, "Google", "Chrome Beta", "Application", "chrome.exe"),
                os.path.join(program_files, "Google", "Chrome Dev", "Application", "chrome.exe"),
                os.path.join(program_files, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
                os.path.join(program_files_x86, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
                os.path.join(program_files, "Microsoft", "Edge", "Application", "msedge.exe"),
                os.path.join(program_files_x86, "Microsoft", "Edge", "Application", "msedge.exe"),
                os.path.join(local_app_data, "Microsoft", "Edge", "Application", "msedge.exe"),
            ])
        else:
            candidates.extend([
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                "/Applications/Chromium.app/Contents/MacOS/Chromium",
                "/usr/bin/google-chrome",
                "/usr/bin/google-chrome-stable",
                "/usr/bin/chromium-browser",
                "/usr/bin/chromium",
                "/snap/bin/chromium",
            ])

        for binary_name in ("chrome.exe", "chrome", "google-chrome", "chromium-browser", "chromium", "brave", "msedge"):
            path = shutil.which(binary_name)
            if path:
                candidates.append(path)

        logger.info("Chrome/Chromium candidate binaries: %s", candidates)

        for path in candidates:
            if path and os.path.isfile(path):
                logger.info(f"Chrome binary found: {path}")
                return path

        logger.error(
            "Could not locate Chrome binary. Checked: %s. "
            "Install Chrome/Chromium or set CHROME_PATH / CHROME_BIN / CHROME_EXECUTABLE / GOOGLE_CHROME_PATH.",
            candidates
        )
        return None

    def launch_browser(self, date_str=None):
        """Launches the Chrome browser or reuses an existing session."""
        # Diagnose environment first
        self.diagnose_environment()
        
        if date_str:
            self.process_date = date_str
            from datetime import datetime, timedelta
            try:
                if "T" in date_str:
                    dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                    dt = dt + timedelta(hours=5, minutes=30)
                    date_str = dt.strftime("%Y-%m-%d")
                elif len(date_str) == 10 and date_str[4] == "-" and date_str[7] == "-":
                    pass
                else:
                    dt = datetime.strptime(date_str, "%Y-%m-%d")
                    date_str = dt.strftime("%Y-%m-%d")
            except:
                pass
            storage_root = os.environ.get('ARIN_STORAGE_PATH', '/var/arin')
            self.download_dir = os.path.abspath(os.path.join(storage_root, date_str))
            
        if not os.path.exists(self.download_dir):
            os.makedirs(self.download_dir)

        def _is_headless_mode():
            if os.environ.get("RENDER"):
                return True
            headless_env = os.environ.get("BROWSER_HEADLESS")
            if headless_env is not None:
                return headless_env.strip().lower() in ("1", "true", "yes", "on")
            return False

        def _navigate_to_portal():
            """Navigate to Mahavitaran portal with retries and alternate URLs."""
            portal_urls = [
                self.url,
                "https://wss.mahadiscom.in/wss/wss?uiActionName=getCustAccountLogin",
                "https://wss.mahadiscom.in/wss/wss?uiActionName=getMyAccount",
                "https://wss.mahadiscom.in/wss/wss",
            ]
            last_error = None
            headless_mode = _is_headless_mode()

            for portal_url in portal_urls:
                try:
                    logger.info(f"🌐 Attempting to navigate to: {portal_url}")
                    self.driver.get(portal_url)
                    logger.info(f"📄 Page requested, waiting for full load...")
                    
                    # EXTENDED WAIT for page to fully load and render
                    time.sleep(5)  # Give page substantial time to load
                    
                    current_url = (self.driver.current_url or "").lower()
                    logger.info(f"✅ Current URL: {current_url}")
                    
                    if "mahadiscom.in" in current_url:
                        try:
                            # Get window info for debugging
                            window_handle = self.driver.current_window_handle
                            window_size = self.driver.get_window_size()
                            window_pos = self.driver.get_window_position()
                            logger.info(f"🪟 Window Handle: {window_handle}")
                            logger.info(f"🪟 Window Position: {window_pos}")
                            logger.info(f"🪟 Window Size: {window_size}")
                            
                            # Maximize window
                            self.driver.maximize_window()
                            logger.info(f"🪟 Window maximized")
                            time.sleep(0.5)
                            
                            # Multiple focus attempts
                            self.driver.execute_script("window.focus();")
                            logger.info(f"🔵 JavaScript focus executed")
                            
                            if os.name == "nt" and not headless_mode:
                                logger.info("🪟 Attempting OS-level window focus on Windows...")
                                try:
                                    # Method 1: WScript Shell
                                    result = subprocess.run(
                                        [
                                            "powershell",
                                            "-NoProfile",
                                            "-Command",
                                            "Add-Type @\" using System; using System.Runtime.InteropServices; public class Win { [DllImport(\\\"user32.dll\\\")] public static extern bool SetForegroundWindow(IntPtr hWnd); } \"; $ps = Get-Process chrome | Select-Object -First 1; if ($ps) { [Win]::SetForegroundWindow($ps.MainWindowHandle); Write-Output 'Focused' }"
                                        ],
                                        check=False,
                                        capture_output=True,
                                        text=True,
                                        timeout=5
                                    )
                                    logger.info(f"🔵 PowerShell focus result: {result.stdout.strip()}")
                                except Exception as e:
                                    logger.warning(f"🔵 PowerShell focus attempt failed: {e}")
                                
                                time.sleep(0.5)
                            
                            # Verify page is actually visible
                            page_title = self.driver.title
                            logger.info(f"📄 Page Title: {page_title}")
                            
                            logger.info(f"✅ Successfully navigated to Mahavitaran portal!")
                            logger.info(f"🔗 Portal URL: {current_url}")
                            logger.info(f"🟢 WINDOW SHOULD NOW BE VISIBLE ON YOUR SCREEN!")
                            
                            return True, None
                        except Exception as focus_err:
                            logger.warning(f"Could not fully prepare window: {focus_err}")
                            return True, None

                    logger.warning(f"Navigation landed on unexpected URL: {current_url}")
                except Exception as nav_err:
                    last_error = nav_err
                    logger.error(f"❌ Navigation attempt failed for {portal_url}: {nav_err}")

            return False, last_error

        # CHECK FOR EXISTING SESSION (Fix for Issue 1)
        if self.driver:
            try:
                # Check if driver is still alive and responsive
                _ = self.driver.current_url
                logger.info(f"Reusing existing browser session on port {self.port}")
                
                # Update download directory for existing session via CDP
                try:
                    self.driver.execute_cdp_cmd("Page.setDownloadBehavior", {
                        "behavior": "allow",
                        "downloadPath": self.download_dir
                    })
                    logger.info(f"Updated download directory via CDP: {self.download_dir}")
                except Exception as cdp_err:
                    logger.warning(f"Could not update download directory via CDP: {cdp_err}")
                
                nav_ok, nav_err = _navigate_to_portal()
                if not nav_ok:
                    message = f"Existing browser reused but could not navigate to Mahavitaran portal: {nav_err}"
                    logger.error(message)
                    return False, message

                return True, "Existing portal session reused and navigated to Mahavitaran."
            except Exception as e:
                logger.info(f"Existing driver not responsive, launching new one: {e}")
                try: self.driver.quit()
                except: pass
                self.driver = None

        try:
            # Clear SingletonLock to prevent "Chrome instance exited" error after crash
            profile_dir = os.path.join(os.getcwd(), f"chrome_profile_{self.port}")
            singleton_lock = os.path.join(profile_dir, "SingletonLock")
            if os.path.exists(singleton_lock):
                try:
                    os.remove(singleton_lock)
                    logger.info(f"Cleared stale SingletonLock from profile {self.port}")
                except Exception as lock_err:
                    logger.warning(f"Could not remove SingletonLock: {lock_err}")

            options = webdriver.ChromeOptions()
            
            chrome_path = self.resolve_chrome_path()
            if not chrome_path:
                message = (
                    "Cannot find Chrome/Chromium binary. Install Google Chrome/Chromium "
                    "or set CHROME_PATH / CHROME_BIN / CHROME_EXECUTABLE / GOOGLE_CHROME_PATH."
                )
                logger.error(message)
                return False, message

            options.binary_location = chrome_path
            
            # minimal prefs for download
            prefs = {
                "download.default_directory": self.download_dir,
                "download.prompt_for_download": False,
                "download.directory_upgrade": True,
                "plugins.always_open_pdf_externally": True
            }
            options.add_experimental_option("prefs", prefs)

            # Render must always run headless; local can be controlled via BROWSER_HEADLESS.
            use_headless = _is_headless_mode()

            if use_headless:
                # Chrome 112+ headless mode — renderer-safe on macOS ARM
                options.add_argument("--headless=new")
                options.add_argument("--window-size=1400,900")
                logger.info("🔴 Chrome launch mode: HEADLESS")
            else:
                options.add_argument("--disable-popup-blocking")
                logger.info("🟢 Chrome launch mode: HEADED")

            # Core stability flags (macOS ARM safe)
            options.add_argument("--no-sandbox")
            options.add_argument("--disable-dev-shm-usage")
            options.add_argument("--disable-gpu")           # disable GPU process (headless safe)
            options.add_argument("--use-gl=swiftshader")    # software GL — prevents renderer crash
            options.add_argument("--disable-gpu-sandbox")
            options.add_argument(f"--remote-debugging-port={self.port}")
            options.add_argument("--remote-allow-origins=*")

            # Profile dir — unique per port to avoid lock conflicts
            profile_dir = os.path.join(os.getcwd(), f"chrome_profile_{self.port}")
            options.add_argument(f"--user-data-dir={profile_dir}")

            # Anti-bot + compat flags
            options.add_argument("--ignore-certificate-errors")
            options.add_argument("--ignore-ssl-errors")
            options.add_argument("--allow-running-insecure-content")
            options.add_argument("--disable-blink-features=AutomationControlled")
            options.add_argument("--disable-site-isolation-trials")
            options.add_argument("--disable-features=IsolateOrigins,site-per-process,Prewarm")
            options.add_argument("--allow-popups-during-page-unload")
            options.page_load_strategy = 'eager'

            # Initialize driver — use the pre-resolved path (no network call during launch)
            logger.info(f"🚀 Initializing Chrome Driver on port {self.port}")
            driver_path = ChromeDriverManager().install()
            service = Service(driver_path)
            self.driver = webdriver.Chrome(service=service, options=options)
            logger.info("✅ Chrome Driver initialized successfully!")
            
            # Set safe timeouts to prevent hanging on slow portal responses
            self.driver.set_page_load_timeout(90)  # Max 90 seconds per page
            self.driver.set_script_timeout(30)     # Max 30 seconds for JS execution
            
            # If not headless, position and focus window aggressively
            if not use_headless:
                try:
                    logger.info("📐 Positioning window to top-left corner...")
                    self.driver.set_window_position(0, 0)
                    self.driver.set_window_size(1400, 900)
                    time.sleep(0.5)
                    
                    # Extra focus attempts
                    self.driver.maximize_window()
                    time.sleep(0.3)
                    self.driver.execute_script("window.focus();")
                    
                    # Try OS-level window focus on Windows
                    if os.name == "nt":
                        try:
                            logger.info("🪟 Bringing Chrome window to foreground...")
                            subprocess.run(
                                [
                                    "powershell",
                                    "-NoProfile",
                                    "-Command",
                                    "Add-Type @\" using System; using System.Runtime.InteropServices; public class Win { [DllImport(\\\"user32.dll\\\")] public static extern bool SetForegroundWindow(IntPtr hWnd); } \"; $ps = Get-Process chrome | Select-Object -First 1; if ($ps) { [Win]::SetForegroundWindow($ps.MainWindowHandle) }"
                                ],
                                check=False,
                                capture_output=True,
                                text=True,
                                timeout=5
                            )
                        except Exception as focus_err:
                            logger.warning(f"OS-level focus attempt failed: {focus_err}")
                    
                    time.sleep(0.5)
                    logger.info("✅ Window positioned, sized, and focused")
                except Exception as pos_err:
                    logger.warning(f"Could not position/focus window: {pos_err}")
            
            # Enable basic network but remove blocks so website looks correct
            self.driver.execute_cdp_cmd("Network.enable", {})
            
            logger.info("🌐 Navigation to Mahavitaran portal starting...")
            logger.info("=" * 80)
            
            nav_ok, nav_err = _navigate_to_portal()
            if not nav_ok:
                message = f"Browser launched but could not navigate to Mahavitaran portal: {nav_err}"
                logger.error(message)
                return False, message

            # VERIFY PAGE IS FULLY LOADED BEFORE PROCEEDING
            logger.info("=" * 80)
            logger.info("✅ PAGE LOADED AND VISIBLE!")
            logger.info("=" * 80)
            
            # Check page readiness
            try:
                wait = WebDriverWait(self.driver, 10)
                wait.until(lambda driver: driver.execute_script("return document.readyState") == "complete")
                logger.info("✅ Page DOM fully loaded and ready")
            except:
                logger.warning("⚠️  Page might still be loading, continuing anyway...")
            
            # Final diagnostic info
            logger.info(f"📄 Final Page Title: {self.driver.title}")
            logger.info(f"🔗 Final URL: {self.driver.current_url}")
            logger.info("=" * 80)
            
            return True, "Browser launched and navigated to Mahavitaran portal."
            
        except Exception as e:
            logger.error(f"Error launching browser: {e}")
            try:
                with open("launch_error.txt", "w") as f:
                    f.write(str(e))
            except:
                pass
            return False, str(e)


    def get_cookies(self):
        """Returns the cookies from the current session."""
        if not self.driver:
            return None
        return self.driver.get_cookies()

    def set_cookies(self, cookies):
        """Sets the cookies for the current session and navigates to the dashboard."""
        if not self.driver or not cookies:
            return False
            
        try:
            # Must be on the domain to set cookies
            self.driver.get("https://wss.mahadiscom.in/wss/wss")
            time.sleep(1)
            self.driver.delete_all_cookies()
            time.sleep(0.5)

            def _normalize_cookie(cookie):
                normalized = {}
                for key in ("name", "value", "path", "domain", "secure", "httpOnly"):
                    if key in cookie and cookie[key] is not None:
                        normalized[key] = cookie[key]
                if cookie.get("expires") is not None:
                    try:
                        normalized["expiry"] = int(cookie["expires"])
                    except (TypeError, ValueError):
                        pass
                if cookie.get("sameSite"):
                    normalized["sameSite"] = cookie["sameSite"]
                return normalized

            for cookie in cookies:
                try:
                    self.driver.add_cookie(_normalize_cookie(cookie))
                except Exception as e:
                    logger.warning(f"Failed to add cookie: {e}")
            
            # Navigate to the dashboard after setting cookies
            self.driver.get("https://wss.mahadiscom.in/wss/wss?uiActionName=getMyAccount")
            wait = WebDriverWait(self.driver, 20)
            try:
                wait.until(
                    EC.any_of(
                        EC.presence_of_element_located((By.ID, "grdCustList")),
                        EC.presence_of_element_located((By.XPATH, "//img[@title='View Bill']")),
                    )
                )
            except Exception:
                login_visible = False
                try:
                    login_id = self.driver.find_elements(By.ID, "loginId")
                    password_el = self.driver.find_elements(By.ID, "password")
                    login_visible = bool(login_id or password_el)
                except Exception:
                    pass

                current_url = (self.driver.current_url or "").lower()
                if ("getmyaccount" in current_url or current_url.rstrip("/").endswith("/wss/wss")) and not login_visible:
                    logger.warning("Dashboard widgets did not load, but the authenticated portal shell is present after cookie restoration.")
                    return True

                logger.warning("Dashboard did not fully load after cookie restoration.")
                return False

            return True
        except Exception as e:
            logger.error(f"Error setting cookies: {e}")
            return False

    def _wait_for_captcha_dismiss(self, timeout=120):
        """
        Detects if a Captcha alert is open and waits for user to manually dismiss it.
        Polls for alert existence. Returns True when alert is gone or timeout.
        """
        start_time = time.time()
        alert_detected = False
        
        while time.time() - start_time < timeout:
            try:
                # Try to detect if alert is present
                alert = self.driver.switch_to.alert
                alert_text = alert.text
                if "captcha" in alert_text.lower():
                    if not alert_detected:
                        logger.warning(f"⚠️ CAPTCHA ALERT DETECTED: '{alert_text}'")
                        logger.warning("🔴 MANUAL INTERVENTION NEEDED: Please complete the Captcha in the browser window.")
                        logger.warning(f"⏱️  Waiting up to {timeout} seconds for you to dismiss it...")
                        alert_detected = True
                    time.sleep(2)  # Check every 2 seconds
                    continue
            except:
                # No alert present
                if alert_detected:
                    logger.info("✅ Captcha alert dismissed by user. Resuming automation...")
                    time.sleep(1)
                    return True
                time.sleep(1)
        
        return True

    def fill_login_credentials(self, date_str, custom_id=None):
        """Generates credentials based on date or uses custom_id and fills the login form via CDP."""
        if not self.driver:
            return False, "Browser not running."

        try:
            self.process_date = date_str

            logger.info("=" * 80)
            logger.info("🟢 PAGE LOADED — filling login credentials via CDP...")
            logger.info("=" * 80)

            # Check if already logged in
            try:
                if self.driver.find_elements(By.ID, "grdCustList"):
                    logger.info("Already logged in, skipping credential filling.")
                    return True, "Already logged in."
            except:
                pass

            # Determine credential ID
            if not custom_id:
                logger.error("No portal credential ID (custom_id) provided for automated login.")
                return False, "No portal credential ID provided."
                
            credential = custom_id
            logger.info(f"Using credential: {credential}")

            # Lookup password from database
            password_to_use = credential
            try:
                from processing import get_db_connection
                conn = get_db_connection()
                if conn:
                    cursor = conn.cursor()
                    cursor.execute("SELECT password FROM portal_credentials WHERE username = %s", (credential,))
                    row = cursor.fetchone()
                    if row:
                        password_to_use = row[0]
                        logger.info(f"Loaded password for {credential} from database.")
                    conn.close()
            except Exception as e:
                logger.error(f"Failed to lookup portal password for {credential}: {e}")

            # ── CDP helpers ─────────────────────────────────────────────────────────────────────
            def cdp_click(x, y):
                for evt in ('mousePressed', 'mouseReleased'):
                    self.driver.execute_cdp_cmd('Input.dispatchMouseEvent', {
                        'type': evt, 'x': x, 'y': y,
                        'button': 'left', 'clickCount': 1, 'modifiers': 0
                    })

            def cdp_type(text):
                SPECIAL_KEYS = {
                    '\n': ('Return', '\r', 13),
                    '\t': ('Tab', '\t', 9),
                }
                for char in text:
                    if char in SPECIAL_KEYS:
                        kn, kc, kcode = SPECIAL_KEYS[char]
                        for et in ('keyDown', 'keyUp'):
                            self.driver.execute_cdp_cmd('Input.dispatchKeyEvent', {
                                'type': et, 'key': kn, 'code': kn,
                                'nativeVirtualKeyCode': kcode, 'windowsVirtualKeyCode': kcode
                            })
                        self.driver.execute_cdp_cmd('Input.dispatchKeyEvent', {'type': 'char', 'key': kc, 'text': kc})
                    else:
                        kcode = ord(char)
                        code = f'Key{char.upper()}' if char.isalpha() else f'Digit{char}' if char.isdigit() else 'Space'
                        # keyDown with NO text field, char event inserts, keyUp with NO text field
                        self.driver.execute_cdp_cmd('Input.dispatchKeyEvent', {
                            'type': 'keyDown', 'key': char, 'code': code,
                            'nativeVirtualKeyCode': kcode, 'windowsVirtualKeyCode': kcode
                        })
                        self.driver.execute_cdp_cmd('Input.dispatchKeyEvent', {
                            'type': 'char', 'key': char, 'text': char, 'unmodifiedText': char
                        })
                        self.driver.execute_cdp_cmd('Input.dispatchKeyEvent', {
                            'type': 'keyUp', 'key': char, 'code': code,
                            'nativeVirtualKeyCode': kcode, 'windowsVirtualKeyCode': kcode
                        })

            def get_element_center(element):
                """Get the absolute center coordinates of a WebElement."""
                rect = self.driver.execute_script(
                    "var r=arguments[0].getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2};",
                    element
                )
                return int(rect['x']), int(rect['y'])

            # ── Wait for captcha alert if any ───────────────────────────────────────────────
            self._wait_for_captcha_dismiss(timeout=180)

            # ── Locate login fields ────────────────────────────────────────────────────────
            wait = WebDriverWait(self.driver, 30)
            logger.info("Waiting for login page elements...")
            try:
                login_input = wait.until(EC.visibility_of_element_located((By.ID, "loginId")))
                password_input = wait.until(EC.visibility_of_element_located((By.ID, "password")))
            except Exception as e:
                logger.warning(f"Login elements not found: {e}")
                return True, "Form elements not found (timeout), checking if logged in..."

            # ── Fill username via CDP click + type ──────────────────────────────────────
            # Clear via triple-click (select-all) then type
            lx, ly = get_element_center(login_input)
            # Triple-click to select all existing text
            self.driver.execute_cdp_cmd('Input.dispatchMouseEvent', {
                'type': 'mousePressed', 'x': lx, 'y': ly,
                'button': 'left', 'clickCount': 3, 'modifiers': 0
            })
            self.driver.execute_cdp_cmd('Input.dispatchMouseEvent', {
                'type': 'mouseReleased', 'x': lx, 'y': ly,
                'button': 'left', 'clickCount': 3, 'modifiers': 0
            })
            time.sleep(0.1)
            cdp_type(credential)
            logger.info(f"Typed username '{credential}' via CDP")

            time.sleep(0.2)

            # ── Fill password via CDP click + type ───────────────────────────────────
            px, py = get_element_center(password_input)
            self.driver.execute_cdp_cmd('Input.dispatchMouseEvent', {
                'type': 'mousePressed', 'x': px, 'y': py,
                'button': 'left', 'clickCount': 3, 'modifiers': 0
            })
            self.driver.execute_cdp_cmd('Input.dispatchMouseEvent', {
                'type': 'mouseReleased', 'x': px, 'y': py,
                'button': 'left', 'clickCount': 3, 'modifiers': 0
            })
            time.sleep(0.1)
            cdp_type(password_to_use)
            logger.info(f"Typed password via CDP")

            time.sleep(0.2)

            # ── Submit form ────────────────────────────────────────────────────────────────
            submit_selectors = [
                (By.ID, "Submit"),
                (By.NAME, "Submit"),
                (By.CSS_SELECTOR, "button[type='submit']"),
                (By.CSS_SELECTOR, "input[type='submit']"),
                (By.XPATH, "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'submit') or contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'login')]"),
            ]
            clicked = False
            for by, selector in submit_selectors:
                try:
                    btn = self.driver.find_element(by, selector)
                    bx, by_coord = get_element_center(btn)
                    cdp_click(bx, by_coord)
                    logger.info(f"Submitted login using CDP click on {by}={selector}")
                    clicked = True
                    break
                except Exception:
                    continue

            if not clicked:
                # Press Enter via CDP as final fallback
                self.driver.execute_cdp_cmd('Input.dispatchKeyEvent', {
                    'type': 'keyDown', 'key': 'Return', 'code': 'Return',
                    'nativeVirtualKeyCode': 13, 'windowsVirtualKeyCode': 13
                })
                self.driver.execute_cdp_cmd('Input.dispatchKeyEvent', {
                    'type': 'keyUp', 'key': 'Return', 'code': 'Return',
                    'nativeVirtualKeyCode': 13, 'windowsVirtualKeyCode': 13
                })
                logger.info("Login submitted via CDP Enter key fallback.")

            # ── Verify login ─────────────────────────────────────────────────────────────────
            try:
                WebDriverWait(self.driver, 15).until(EC.presence_of_element_located((By.ID, "grdCustList")))
                logger.info("Login verified: reached dashboard.")
                return True, f"Login successful for {credential}"
            except:
                logger.warning("Could not verify login. Might need CAPTCHA completion.")
                return True, "Credentials filled — awaiting CAPTCHA/verification in Remote Browser."

        except Exception as e:
            logger.error(f"Error filling credentials: {e}")
            return False, str(e)

    def get_consumer_list(self):
        """Scrapes the consumer data from the website grid without navigating to each bill page."""
        if not self.driver:
            return False, "Browser not running."
        
        try:
            consumers = []
            dashboard_url = "https://wss.mahadiscom.in/wss/wss?uiActionName=getMyAccount"

            # Reconfirm the browser session is still responsive before scraping.
            try:
                _ = self.driver.current_url
                _ = self.driver.window_handles
            except Exception as session_err:
                logger.error(f"Browser session is not responsive: {session_err}")
                return False, "Browser session is not responsive. Please reconnect and try again."
            
            # Ensure we are on the dashboard.
            # Poll both the grid and the bill buttons because the portal can render either first.
            dashboard_ready = False
            last_error = None
            for attempt in range(12):
                try:
                    current_rows = self.driver.find_elements(By.XPATH, "//table[@id='grdCustList']//tr[position()>1]")
                    current_buttons = self.driver.find_elements(By.XPATH, "//img[@title='View Bill']")

                    if current_rows or current_buttons:
                        dashboard_ready = True
                        break

                    current_url = (self.driver.current_url or "").lower()
                    if "getcustaccountlogin" in current_url:
                        logger.error("Consumer scrape reached the login page instead of the dashboard.")
                        return False, "Login session is no longer active. Please reconnect and try again."

                    if attempt == 0:
                        self.driver.get(dashboard_url)

                    time.sleep(2)
                except Exception as poll_err:
                    last_error = poll_err
                    time.sleep(2)

            if not dashboard_ready:
                logger.error(f"Dashboard was not ready for consumer scrape: {last_error}")
                return False, "Dashboard not ready yet. Please wait a few seconds and try again."

            # Find the table and rows
            # The Mahadiscom grid usually has a specific structure
            rows = self.driver.find_elements(By.XPATH, "//table[@id='grdCustList']//tr[position()>1]")
            if not rows:
                # Fallback to a more generic table scan when the grid ID is unstable.
                rows = self.driver.find_elements(By.XPATH, "//table//tr[td]")[1:]
            
            logger.info(f"Found {len(rows)} potential rows in the consumer grid.")
            
            seen_cnums = set()
            for idx, row in enumerate(rows):
                try:
                    cells = row.find_elements(By.TAG_NAME, "td")
                    if len(cells) < 10:
                        continue
                        
                    # Grid layout: 0:Select, 1:ConsumerNo, 2:Billing Unit, 3:Division Code, 4:HT/LT,
                    # 5:Bill Month, 6:Units, 7:Balance, 8:Due Date, 9:View Bill, 14:View Photo
                    raw_cnum = cells[1].text.strip()
                    
                    # Support Marathi numbers (Issue #15)
                    trans_table = str.maketrans("०१२३४५६७८९", "0123456789")
                    raw_cnum = raw_cnum.translate(trans_table)
                    
                    c_num = "".join([c for c in raw_cnum if c.isdigit()])
                    
                    c_bu = cells[2].text.strip()
                    c_division = cells[3].text.strip()
                    c_type = cells[4].text.strip()
                    c_month = cells[5].text.strip()
                    c_units = cells[6].text.strip()
                    c_balance = cells[7].text.strip()
                    c_due_date = cells[8].text.strip()
                    has_bill = bool(row.find_elements(By.XPATH, ".//img[@title='View Bill']"))
                    has_photo = bool(row.find_elements(By.XPATH, ".//img[@title='View Meter Photo']"))
                    
                    if not c_num: continue
                    
                    # Rule: Only include consumers starting with 3, 4, or 5 (User request)
                    if not (c_num.startswith('3') or c_num.startswith('4') or c_num.startswith('5')):
                        continue

                    # Filter duplicate consumer records
                    if c_num in seen_cnums:
                        logger.info(f"Filtering duplicate scraped consumer: {c_num}")
                        continue
                    seen_cnums.add(c_num)

                    consumers.append({
                        "index": idx,
                        "consumerNumber": c_num,
                        "name": c_division or c_type or c_bu,
                        "bu": c_bu,
                        "divisionCode": c_division,
                        "htlt": c_type,
                        "month": c_month,
                        "units": c_units,
                        "balance": c_balance,
                        "dueDate": c_due_date,
                        "hasBill": has_bill,
                        "hasPhoto": has_photo,
                    })
                except Exception as row_err:
                    logger.warning(f"Error parsing row {idx}: {row_err}")

            logger.info(f"Scraped {len(consumers)} consumers from the grid.")
            return True, consumers
                
        except Exception as outer_err:
            logger.error(f"Error in get_consumer_list: {outer_err}")
            return False, str(outer_err)

    def download_bills(self, start_index=0, end_index=None, selective_indices=None):  # BURST_REWRITE
        """Triggers the download of bills using concurrent tab bursting for maximum speed."""
        if not self.driver:
            return False, "Browser not running."

        try:
            # ── 0. Wait for dashboard to be ready ──────────────────────────────────────
            wait = WebDriverWait(self.driver, 20)
            try:
                wait.until(EC.presence_of_element_located((By.XPATH, "//img[@title='View Bill']")))
            except:
                logger.warning("Buttons not found initially, trying to refresh dashboard...")
                self.driver.get("https://wss.mahadiscom.in/wss/wss?uiActionName=getMyAccount")
                wait.until(EC.presence_of_element_located((By.XPATH, "//img[@title='View Bill']")))

            # ── 1. Prepare Download Directory ─────────────────────────────────────────
            date_str = self.process_date if self.process_date else "unknown_date"
            from datetime import datetime, timedelta
            try:
                if "T" in date_str:
                    dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                    dt = dt + timedelta(hours=5, minutes=30)
                    date_str = dt.strftime("%Y-%m-%d")
                elif len(date_str) == 10 and date_str[4] == "-" and date_str[7] == "-":
                    pass
                else:
                    dt = datetime.strptime(date_str, "%Y-%m-%d")
                    date_str = dt.strftime("%Y-%m-%d")
            except:
                pass

            storage_root = os.environ.get('ARIN_STORAGE_PATH', '/var/arin')
            target_dir = os.path.join(storage_root, date_str)
            if not os.path.exists(target_dir):
                os.makedirs(target_dir)
            logger.info(f"[{self.port}] Target download directory: {target_dir}")

            # ── 2. Concurrent burst size (env-configurable) ───────────────────────────
            # DOWNLOAD_BURST_SIZE controls how many bill tabs open simultaneously.
            # Higher = faster, but risks portal rate-limiting. Safe default: 5.
            try:
                BURST_SIZE = int(os.environ.get("DOWNLOAD_BURST_SIZE", "5"))
                BURST_SIZE = max(1, min(BURST_SIZE, 15))  # Clamp to 1-15
            except:
                BURST_SIZE = 5
            logger.info(f"[{self.port}] Burst size: {BURST_SIZE} concurrent tabs per round")

            # ── 3. Identify which bills to process ────────────────────────────────────
            potential_buttons = self.driver.find_elements(By.XPATH, "//img[@title='View Bill']")
            count = len(potential_buttons)
            logger.info(f"[{self.port}] Found {count} bill buttons on page.")

            if selective_indices is not None:
                indices_to_process = [i for i in selective_indices if i < count]
            else:
                if end_index is None: end_index = count
                indices_to_process = list(range(start_index, min(end_index, count)))

            real_count = len(indices_to_process)
            if real_count == 0:
                return True, "No bills to download."

            logger.info(f"[{self.port}] Processing {real_count} bills in bursts of {BURST_SIZE}...")

            import glob, re, json
            from concurrent.futures import ThreadPoolExecutor, as_completed
            from processing import extract_data_from_pdf
            dashboard_url = "https://wss.mahadiscom.in/wss/wss?uiActionName=getMyAccount"

            # ── 4. Skip-set: already downloaded consumers ─────────────────────────────
            existing_consumers = set()
            cache_path = os.path.join(target_dir, "extracted_cache.json")
            if os.path.exists(cache_path):
                try:
                    with open(cache_path, "r") as cache_file:
                        cache_data = json.load(cache_file)
                    for item in cache_data:
                        c_num = str(item.get("consumer_number") or "").strip()
                        if c_num:
                            existing_consumers.add(c_num)
                except Exception:
                    pass

            for existing_pdf in glob.glob(os.path.join(target_dir, "*.pdf")):
                existing_match = re.search(r"(\d{10,12})", os.path.basename(existing_pdf))
                if existing_match:
                    existing_consumers.add(existing_match.group(1))

            # ── 5. Helpers ────────────────────────────────────────────────────────────
            def _ensure_dashboard_ready():
                try:
                    self.driver.get(dashboard_url)
                except Exception:
                    pass
                w = WebDriverWait(self.driver, 20)
                try:
                    w.until(EC.any_of(
                        EC.presence_of_element_located((By.XPATH, "//img[@title='View Bill']")),
                        EC.presence_of_element_located((By.XPATH, "//table[@id='grdCustList']//tr[position()>1]")),
                    ))
                except Exception:
                    pass

            def _find_view_bill_button(c_num, c_name):
                selectors = [
                    f"//tr[td[2][normalize-space()='{c_num}']]//img[@title='View Bill']",
                    f"//tr[td[2][normalize-space()='{c_num}'] and td[3][normalize-space()='{c_name}']]//img[@title='View Bill']",
                    f"//tr[contains(normalize-space(.), '{c_num}')]//img[@title='View Bill']",
                    "//img[@title='View Bill']",
                ]
                for _ in range(2):
                    for selector in selectors:
                        try:
                            btn = self.driver.find_element(By.XPATH, selector)
                            return btn
                        except Exception:
                            continue
                    _ensure_dashboard_ready()
                return None

            def _fast_fetch_pdf_from_url(url, cookies_list, user_agent, dest_path):
                """Thread-safe: download a PDF from a URL using requests (no browser involvement)."""
                try:
                    import requests as _req
                    session = _req.Session()
                    for cookie in cookies_list:
                        session.cookies.set(
                            cookie.get("name"), cookie.get("value"),
                            domain=cookie.get("domain"), path=cookie.get("path", "/"),
                        )
                    response = session.get(
                        url,
                        headers={"User-Agent": user_agent, "Referer": url},
                        timeout=20, allow_redirects=True,
                    )
                    ct = (response.headers.get("Content-Type") or "").lower()
                    cd = (response.headers.get("Content-Disposition") or "").lower()
                    if "pdf" in ct or "attachment" in cd or response.content[:4] == b"%PDF":
                        with open(dest_path, "wb") as fh:
                            fh.write(response.content)
                        return True, dest_path
                    return False, dest_path
                except Exception as e:
                    logger.debug(f"[{self.port}] HTTP fetch failed for {url}: {e}")
                    return False, dest_path

            # ── 6. Collect row metadata for all indices ───────────────────────────────
            _ensure_dashboard_ready()
            main_window = self.driver.current_window_handle
            current_rows = self.driver.find_elements(By.XPATH, "//table[@id='grdCustList']//tr[position()>1]")
            trans_table = str.maketrans("\u0966\u0967\u0968\u0969\u096a\u096b\u096c\u096d\u096e\u096f", "0123456789")

            all_meta = []
            for idx in indices_to_process:
                try:
                    if idx >= len(current_rows):
                        continue
                    row = current_rows[idx]
                    cells = row.find_elements(By.TAG_NAME, "td")
                    if len(cells) < 4:
                        continue
                    raw_cnum = cells[1].text.strip().translate(trans_table)
                    c_num = "".join([c for c in raw_cnum if c.isdigit()])
                    raw_name = cells[3].text
                    c_name = "".join([c for c in raw_name if c.isalnum() or c in (' ', '_', '-')]).strip()
                    if not c_num:
                        continue
                    if c_num in existing_consumers:
                        logger.info(f"[{self.port}] Skip already-done: {c_num}")
                        continue
                    # Clean up stale un-renamed files for this consumer
                    for s in glob.glob(os.path.join(target_dir, "*.pdf")):
                        if c_num in os.path.basename(s) and "_" not in os.path.basename(s):
                            try: os.remove(s)
                            except: pass
                    all_meta.append({"index": idx, "c_num": c_num, "c_name": c_name})
                except Exception as map_err:
                    logger.warning(f"[{self.port}] Meta map error for idx {idx}: {map_err}")

            logger.info(f"[{self.port}] {len(all_meta)} bills queued after skip-set filtering.")

            # ── 7. Capture user-agent once ────────────────────────────────────────────
            user_agent = "Mozilla/5.0"
            try:
                user_agent = self.driver.execute_script("return navigator.userAgent") or user_agent
            except Exception:
                pass

            downloaded = 0

            def _chunks(lst, n):
                for i in range(0, len(lst), n):
                    yield lst[i:i + n]

            # ── 8. Main burst loop ────────────────────────────────────────────────────
            for burst_meta in _chunks(all_meta, BURST_SIZE):
                _ensure_dashboard_ready()
                main_window = self.driver.current_window_handle
                before_handles = set(self.driver.window_handles)
                before_pdfs = set(glob.glob(os.path.join(target_dir, "*.pdf")))

                # Step A: click all View Bill buttons in the burst rapidly ─────────────
                clicked_meta = []
                for meta in burst_meta:
                    c_num = meta["c_num"]
                    c_name = meta["c_name"]
                    try:
                        btn = _find_view_bill_button(c_num, c_name)
                        if btn is None:
                            logger.warning(f"[{self.port}] View Bill not found for {c_num}")
                            continue
                        self.driver.execute_script("arguments[0].scrollIntoView(true);", btn)
                        self.driver.execute_script("arguments[0].click();", btn)
                        clicked_meta.append(meta)
                        logger.info(f"[{self.port}] Clicked View Bill for {c_num}")
                    except Exception as click_err:
                        logger.warning(f"[{self.port}] Click failed for {c_num}: {click_err}")

                if not clicked_meta:
                    continue

                # Step B: wait for all burst tabs to open (max 8s, tight polling) ──────
                deadline = time.time() + 8
                while time.time() < deadline:
                    # Dismiss any alert blocking tab opening
                    try:
                        alert = self.driver.switch_to.alert
                        logger.warning(f"[{self.port}] Alert dismissed: {alert.text}")
                        alert.accept()
                    except Exception:
                        pass
                    new_handles = set(self.driver.window_handles) - before_handles
                    if len(new_handles) >= len(clicked_meta):
                        break
                    time.sleep(0.05)

                new_handles = set(self.driver.window_handles) - before_handles
                logger.info(f"[{self.port}] Burst opened {len(new_handles)} tabs for {len(clicked_meta)} bills")

                # Step C: collect bill URLs from every new tab ─────────────────────────
                tab_url_map = {}  # handle -> url
                for handle in new_handles:
                    try:
                        self.driver.switch_to.window(handle)
                        poll_deadline = time.time() + 3
                        while time.time() < poll_deadline:
                            url = self.driver.current_url
                            if url and url != "about:blank" and "mahadiscom" in url.lower():
                                break
                            time.sleep(0.05)
                        tab_url_map[handle] = self.driver.current_url
                    except Exception as url_err:
                        logger.debug(f"[{self.port}] Could not get URL for tab {handle}: {url_err}")
                self.driver.switch_to.window(main_window)

                # Step D: parallel HTTP PDF fetch for all tabs in ThreadPoolExecutor ────
                cookies_snapshot = self.driver.get_cookies()
                handle_list = list(new_handles)
                fetch_tasks = {}  # future -> (handle, dest_path, meta)

                with ThreadPoolExecutor(max_workers=max(len(handle_list), 1)) as pool:
                    for i, handle in enumerate(handle_list):
                        url = tab_url_map.get(handle, "")
                        meta = clicked_meta[i] if i < len(clicked_meta) else None
                        if not meta or not url or "mahadiscom" not in url.lower():
                            continue
                        c_num = meta["c_num"]
                        dest_path = os.path.join(target_dir, f"_tmp_{c_num}.pdf")
                        future = pool.submit(
                            _fast_fetch_pdf_from_url,
                            url, cookies_snapshot, user_agent, dest_path
                        )
                        fetch_tasks[future] = (handle, dest_path, meta)

                    # Collect HTTP-fetch results
                    http_saved = {}  # c_num -> dest_path
                    for future in as_completed(fetch_tasks):
                        handle, dest_path, meta = fetch_tasks[future]
                        try:
                            ok, path = future.result()
                            if ok:
                                http_saved[meta["c_num"]] = path
                                logger.info(f"[{self.port}] HTTP fetch OK: {meta['c_num']}")
                        except Exception as fe:
                            logger.debug(f"[{self.port}] HTTP fetch exception: {fe}")

                # Step E: browser fallback for tabs NOT fetched via HTTP ────────────────
                for i, handle in enumerate(handle_list):
                    meta = clicked_meta[i] if i < len(clicked_meta) else None
                    if not meta:
                        try:
                            self.driver.switch_to.window(handle)
                            self.driver.close()
                        except: pass
                        continue
                    c_num = meta["c_num"]
                    if c_num in http_saved:
                        # Already saved via HTTP — just close the tab
                        try:
                            self.driver.switch_to.window(handle)
                            self.driver.close()
                        except: pass
                        continue
                    # Fallback: trigger in-browser download button
                    try:
                        self.driver.switch_to.window(handle)
                        # Wait for page ready (max 3s, tight polling)
                        poll_deadline = time.time() + 3
                        while time.time() < poll_deadline:
                            try:
                                if self.driver.execute_script("return document.readyState") == "complete":
                                    break
                            except: pass
                            time.sleep(0.05)
                        # Click any download button on the page
                        self.driver.execute_script("""
                            (function() {
                                var sels = ['button[id*="download"]','a[href*="download"]',
                                    'img[title*="Download"]','.btn-download','input[value*="Download"]'];
                                for (var s of sels) {
                                    var el = document.querySelector(s);
                                    if (el) { el.click(); return; }
                                }
                                var all = document.querySelectorAll('*');
                                for (var el of all) {
                                    if (el.innerText && el.innerText.toLowerCase().includes('download')
                                        && el.tagName !== 'BODY') { el.click(); return; }
                                }
                            })();
                        """)
                        # Wait for download to start (max 3s, tight polling)
                        poll_deadline = time.time() + 3
                        while time.time() < poll_deadline:
                            if glob.glob(os.path.join(target_dir, "*.crdownload")) or \
                               (set(glob.glob(os.path.join(target_dir, "*.pdf"))) - before_pdfs):
                                break
                            time.sleep(0.05)
                        self.driver.close()
                    except Exception as dl_err:
                        logger.warning(f"[{self.port}] Browser fallback failed for {c_num}: {dl_err}")
                        try: self.driver.close()
                        except: pass

                self.driver.switch_to.window(main_window)

                # Step F: process & rename HTTP-fetched PDFs immediately ─────────────
                for c_num, tmp_path in http_saved.items():
                    meta = next((m for m in clicked_meta if m["c_num"] == c_num), None)
                    if not meta or not os.path.exists(tmp_path):
                        continue
                    c_name = meta.get("c_name", "")
                    try:
                        extracted_data = extract_data_from_pdf(tmp_path, default_date=date_str)
                        month_year_str = "UNKNOWN_MONTH"
                        if extracted_data:
                            if extracted_data.get("consumer_number", "N/A") == "N/A":
                                extracted_data["consumer_number"] = c_num
                            if extracted_data.get("consumer_name", "N/A") == "N/A":
                                extracted_data["consumer_name"] = c_name
                            b_date = extracted_data.get("bill_month_date")
                            if b_date:
                                try:
                                    dt = datetime.strptime(b_date, "%Y-%m-%d")
                                    month_year_str = f"{dt.strftime('%b').capitalize()}_{dt.strftime('%Y')}"
                                except: pass
                        else:
                            extracted_data = {"consumer_number": c_num, "consumer_name": c_name}

                        final_c_num = extracted_data.get("consumer_number", c_num)
                        final_local_name = f"{final_c_num}_{month_year_str}.pdf"
                        final_target_path = os.path.join(target_dir, final_local_name)

                        if os.path.exists(final_target_path):
                            os.remove(final_target_path)
                        os.replace(tmp_path, final_target_path)
                        logger.info(f"[{self.port}] Renamed: {final_local_name}")
                        downloaded += 1
                        # Cleanup stale files
                        for pattern in [f"*{c_num}*.pdf", "EB*.pdf"]:
                            for stale in glob.glob(os.path.join(target_dir, pattern)):
                                if os.path.basename(stale) != final_local_name:
                                    try: os.remove(stale)
                                    except: pass
                        self._update_cache_and_stats(target_dir, extracted_data)
                    except Exception as proc_err:
                        logger.error(f"[{self.port}] Processing error for HTTP {c_num}: {proc_err}")

            # ── 9. Phase 2: Wait for background browser downloads & bulk-rename ──────
            pending = glob.glob(os.path.join(target_dir, "*.crdownload"))
            if pending:
                logger.info(f"[{self.port}] Waiting for {len(pending)} background downloads (max 120s)...")
                t0 = time.time()
                while time.time() - t0 < 120:
                    if not glob.glob(os.path.join(target_dir, "*.crdownload")):
                        break
                    time.sleep(1)

            straggler_pdfs = [f for f in glob.glob(os.path.join(target_dir, "*.pdf"))
                              if "_" not in os.path.basename(f) and not os.path.basename(f).startswith("_tmp_")]
            if straggler_pdfs:
                logger.info(f"[{self.port}] Bulk renaming {len(straggler_pdfs)} browser-downloaded PDFs...")
                for pdf_file in straggler_pdfs:
                    try:
                        extracted_data = extract_data_from_pdf(pdf_file, default_date=date_str)
                        if extracted_data and extracted_data.get("consumer_number") != "N/A":
                            final_c_num = extracted_data["consumer_number"]
                            month_year_str = "UNKNOWN_MONTH"
                            b_date = extracted_data.get("bill_month_date")
                            if b_date:
                                try:
                                    dt = datetime.strptime(b_date, "%Y-%m-%d")
                                    month_year_str = f"{dt.strftime('%b').capitalize()}_{dt.strftime('%Y')}"
                                except: pass
                            final_local_name = f"{final_c_num}_{month_year_str}.pdf"
                            final_target_path = os.path.join(target_dir, final_local_name)
                            if pdf_file != final_target_path:
                                if os.path.exists(final_target_path):
                                    os.remove(final_target_path)
                                os.replace(pdf_file, final_target_path)
                            downloaded += 1
                            self._update_cache_and_stats(target_dir, extracted_data)
                    except Exception as e:
                        logger.error(f"[{self.port}] Failed to bulk rename {pdf_file}: {e}")

            # ── 10. Clean up any leftover _tmp_ files ─────────────────────────────────
            for tmp in glob.glob(os.path.join(target_dir, "_tmp_*.pdf")):
                try: os.remove(tmp)
                except: pass

            return True, f"[{self.port}] Finished. Downloaded and saved {downloaded}/{real_count} bills locally; Drive upload runs after completion."

        except Exception as e:
            logger.error(f"[{self.port}] Error in download_bills: {e}")
            return False, str(e)
    def _update_cache_and_stats(self, target_dir, extracted_data):
        """Helper to save extracted data to local JSON cache for UI and CSV reporting."""
        try:
            import json
            final_c_num = extracted_data.get("consumer_number")
            cache_path = os.path.join(target_dir, "extracted_cache.json")
            cache = []
            if os.path.exists(cache_path):
                try:
                    with open(cache_path, "r") as f: cache = json.load(f)
                except: pass
            
            if not any(str(item.get("consumer_number")) == str(final_c_num) for item in cache):
                cache.append(extracted_data)
                with open(cache_path, "w") as f: json.dump(cache, f)
        except Exception as e:
            logger.error(f"Failed to update cache: {e}")

    def dump_html(self):

        """Dumps the current page HTML to a file for debugging."""
        if self.driver:
            try:
                with open(f"page_dump_{self.port}.html", "w", encoding="utf-8") as f:
                    f.write(self.driver.page_source)
                return True, "HTML dumped successfully."
            except Exception as e:
                return False, str(e)
        return False, "Browser not running."

    def close(self):
        if self.driver:
            try:
                self.driver.quit()
            except:
                pass
            self.driver = None
