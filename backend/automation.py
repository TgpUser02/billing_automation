import time
import os
import logging
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from dotenv import load_dotenv
load_dotenv()

import shutil
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

    def resolve_chrome_path(self):
        """Try to locate a Chrome / Chromium executable on the host."""
        candidates = []
        env_path = os.environ.get("CHROME_PATH") or os.environ.get("CHROME_BIN") or os.environ.get("CHROME_EXECUTABLE") or os.environ.get("GOOGLE_CHROME_PATH")
        if env_path:
            candidates.append(env_path)

        if os.name == "nt":
            program_files = os.environ.get("PROGRAMFILES", r"C:\Program Files")
            program_files_x86 = os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)")
            local_app_data = os.environ.get("LOCALAPPDATA", os.path.expanduser(r"~\AppData\Local"))
            candidates.extend([
                os.path.join(program_files, "Google", "Chrome", "Application", "chrome.exe"),
                os.path.join(program_files_x86, "Google", "Chrome", "Application", "chrome.exe"),
                os.path.join(local_app_data, "Google", "Chrome", "Application", "chrome.exe"),
                os.path.join(program_files, "Microsoft", "Edge", "Application", "msedge.exe"),
                os.path.join(program_files_x86, "Microsoft", "Edge", "Application", "msedge.exe"),
                os.path.join(local_app_data, "Microsoft", "Edge", "Application", "msedge.exe"),
            ])
        else:
            candidates.extend([
                "/usr/bin/google-chrome",
                "/usr/bin/google-chrome-stable",
                "/usr/bin/chromium-browser",
                "/usr/bin/chromium",
                "/snap/bin/chromium",
            ])

        for binary_name in ("chrome", "google-chrome", "chromium-browser", "chromium"):
            path = shutil.which(binary_name)
            if path:
                candidates.append(path)

        for path in candidates:
            if path and os.path.exists(path):
                logger.info(f"Chrome binary found: {path}")
                return path

        logger.warning(
            "Could not locate Chrome binary. Install Google Chrome or Chromium, "
            "or set CHROME_PATH / CHROME_BIN / CHROME_EXECUTABLE to the browser executable."
        )
        return None

    def launch_browser(self, date_str=None):
        """Launches the Chrome browser or reuses an existing session."""
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
            desktop_path = os.path.join(os.environ.get('USERPROFILE', os.path.expanduser("~")), 'Desktop')
            self.download_dir = os.path.abspath(os.path.join(desktop_path, 'arin', date_str))
            
        if not os.path.exists(self.download_dir):
            os.makedirs(self.download_dir)

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
                
                # Navigate to the portal URL only if not already on dashboard
                if not self.driver.find_elements(By.ID, "grdCustList"):
                    self.driver.get(self.url)
                else:
                    logger.info("Already on dashboard, skipping navigation.")
                return True, "Existing portal session reused."
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
            options.add_argument("--start-maximized")
            
            # Minimal crucial args
            options.add_argument("--no-sandbox")
            options.add_argument("--disable-dev-shm-usage")
            options.add_argument(f"--remote-debugging-port={self.port}") 
            options.add_argument("--remote-allow-origins=*")
            # Use a unique profile directory for each port to avoid conflicts
            profile_dir = os.path.join(os.getcwd(), f"chrome_profile_{self.port}")
            options.add_argument(f"--user-data-dir={profile_dir}")
            
            options.add_argument("--ignore-certificate-errors")
            options.add_argument("--ignore-ssl-errors")
            options.add_argument("--allow-running-insecure-content")
            options.add_argument("--disable-blink-features=AutomationControlled")
            options.add_argument("--disable-site-isolation-trials")
            options.add_argument("--disable-features=IsolateOrigins,site-per-process")
            options.add_argument("--disable-gpu")
            options.add_argument("--disable-software-rasterizer")
            options.add_argument("--disable-popup-blocking")
            options.add_argument("--allow-popups-during-page-unload")
            options.page_load_strategy = 'eager' # Balanced speed and stability

            # Initialize driver
            logger.info(f"Initializing Chrome Driver on port {self.port}")
            service = Service(ChromeDriverManager().install())
            self.driver = webdriver.Chrome(service=service, options=options)
            
            # Set aggressive timeouts to prevent hanging
            self.driver.set_page_load_timeout(15)  # Max 15 seconds per page
            self.driver.set_script_timeout(10)     # Max 10 seconds for JS execution
            
            # Enable basic network but remove blocks so website looks correct
            self.driver.execute_cdp_cmd("Network.enable", {})
            
            logger.info("Driver initialized with full visual support. Navigating...")
            
            try:
                self.driver.get(self.url)
            except Exception as nav_e:
                logger.error(f"Navigation failed: {nav_e}")
                return True, f"Launched with warning: {nav_e}"

            return True, "Browser launched with Turbo Speed enabled."
            
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
            for cookie in cookies:
                try:
                    self.driver.add_cookie(cookie)
                except Exception as e:
                    logger.warning(f"Failed to add cookie: {e}")
            
            # Navigate to the dashboard after setting cookies
            self.driver.get("https://wss.mahadiscom.in/wss/wss?uiActionName=getMyAccount")
            return True
        except Exception as e:
            logger.error(f"Error setting cookies: {e}")
            return False

    def fill_login_credentials(self, date_str, custom_id=None):
        """Generates credentials based on date or uses custom_id and fills the login form."""
        if not self.driver:
            return False, "Browser not running."

        try:
            # Store date for download step
            self.process_date = date_str
            
            # Check if already logged in (look for dashboard element)
            try:
                if self.driver.find_elements(By.ID, "grdCustList"):
                    logger.info("Already logged in, skipping credential filling.")
                    return True, "Already logged in."
            except:
                pass

            # If custom_id is provided, use it. Otherwise generate from date.
            if custom_id:
                credential = custom_id
                logger.info(f"Using custom credential: {credential}")
            else:
                # Parse date string (handling ISO format from frontend)
                from datetime import datetime, timedelta
                if "T" in date_str:
                    dt_obj = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                    dt_obj = dt_obj + timedelta(hours=5, minutes=30)
                else:
                    dt_obj = datetime.strptime(date_str, "%Y-%m-%d")
                
                day_num = dt_obj.day
                # Generate credential: e.g., Arin$007 for day 7
                credential = f"Arin${day_num:03d}"
                logger.info(f"Generated credential from date: {credential} for date {date_str}")
            
            # Wait for elements
            wait = WebDriverWait(self.driver, 30)
            logger.info("Waiting for login page elements...")
            try:
                login_input = wait.until(EC.visibility_of_element_located((By.ID, "loginId")))
                password_input = wait.until(EC.visibility_of_element_located((By.ID, "password")))
            except Exception as e:
                logger.warning(f"Login elements not found within timeout: {e}")
                # If elements not found, maybe we are already on a post-login page or needs manual intervention
                return True, "Form elements not found (timeout), checking if logged in..."

            # Clear and fill
            login_input.clear()
            login_input.send_keys(credential)
            
            password_input.clear()
            password_input.send_keys(credential)
            
            # Click Submit button
            try:
                # Common IDs for Mahadiscom login button
                submit_btn = self.driver.find_element(By.ID, "Submit")
                submit_btn.click()
                logger.info("Login form submitted.")
            except:
                try:
                    # Fallback to finding by type if ID fails
                    submit_btn = self.driver.find_element(By.XPATH, "//input[@type='submit']")
                    submit_btn.click()
                    logger.info("Login form submitted via fallback.")
                except Exception as e:
                    logger.warning(f"Could not click submit button: {e}")

            # Verification: Wait to see if we reached the dashboard
            try:
                wait = WebDriverWait(self.driver, 15)
                wait.until(EC.presence_of_element_located((By.ID, "grdCustList")))
                logger.info("Login verified: reached dashboard.")
                return True, f"Login successful for {credential}"
            except:
                logger.warning("Could not verify login. Might be stuck on CAPTCHA or invalid credentials.")
                return True, "Credentials filled, awaiting manual login/verification."
            
        except Exception as e:
            logger.error(f"Error filling credentials: {e}")
            return False, str(e)

    def get_consumer_list(self):
        """Scrapes the consumer data from the website grid without navigating to each bill page."""
        if not self.driver:
            return False, "Browser not running."
        
        try:
            consumers = []
            wait = WebDriverWait(self.driver, 10)
            
            # Ensure we are on the dashboard
            try:
                wait.until(EC.presence_of_element_located((By.ID, "grdCustList")))
            except:
                self.driver.get("https://wss.mahadiscom.in/wss/wss?uiActionName=getMyAccount")
                wait.until(EC.presence_of_element_located((By.ID, "grdCustList")))

            # Find the table and rows
            # The Mahadiscom grid usually has a specific structure
            rows = self.driver.find_elements(By.XPATH, "//table[@id='grdCustList']//tr[position()>1]")
            
            logger.info(f"Found {len(rows)} potential rows in the consumer grid.")
            
            for idx, row in enumerate(rows):
                try:
                    cells = row.find_elements(By.TAG_NAME, "td")
                    if len(cells) < 6:
                        continue
                        
                    # Usually: 0:Select, 1:ConsumerNo, 2:BU, 3:ConsumerName, 4:ConsumerType, 5:BillMonth
                    raw_cnum = cells[1].text.strip()
                    
                    # Support Marathi numbers (Issue #15)
                    trans_table = str.maketrans("०१२३४५६७८९", "0123456789")
                    raw_cnum = raw_cnum.translate(trans_table)
                    
                    c_num = "".join([c for c in raw_cnum if c.isdigit()])
                    
                    c_bu = cells[2].text.strip()
                    c_name = cells[3].text.strip()
                    c_month = cells[5].text.strip()
                    
                    if not c_num: continue
                    
                    # Rule: Only include consumers starting with 3, 4, or 5 (User request)
                    if not (c_num.startswith('3') or c_num.startswith('4') or c_num.startswith('5')):
                        continue


                    consumers.append({
                        "index": idx,
                        "consumerNumber": c_num,
                        "name": c_name,
                        "bu": c_bu,
                        "month": c_month
                    })
                except Exception as row_err:
                    logger.warning(f"Error parsing row {idx}: {row_err}")

            logger.info(f"Scraped {len(consumers)} consumers from the grid.")
            return True, consumers
                
        except Exception as outer_err:
            logger.error(f"Error in get_consumer_list: {outer_err}")
            return False, str(outer_err)

    def download_bills(self, start_index=0, end_index=None, selective_indices=None):
        """Triggers the download of bills. If selective_indices is provided, only those are downloaded."""
        if not self.driver:
            return False, "Browser not running."

        try:
            # 0. Wait for dashboard to be ready
            wait = WebDriverWait(self.driver, 20)
            try:
                wait.until(EC.presence_of_element_located((By.XPATH, "//img[@title='View Bill']")))
            except:
                logger.warning("Buttons not found initially, trying to refresh dashboard...")
                self.driver.get("https://wss.mahadiscom.in/wss/wss?uiActionName=getMyAccount")
                wait.until(EC.presence_of_element_located((By.XPATH, "//img[@title='View Bill']")))

            # 1. Prepare Download Directory
            date_str = self.process_date if self.process_date else "unknown_date"
            from datetime import datetime, timedelta
            try:
                # If it's already YYYY-MM-DD, we use it directly
                # If it's ISO, we parse but keep as local as possible
                if "T" in date_str:
                    dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                    # If coming from frontend with ISO, adjust for IST
                    dt = dt + timedelta(hours=5, minutes=30)
                    date_str = dt.strftime("%Y-%m-%d")
                elif len(date_str) == 10 and date_str[4] == "-" and date_str[7] == "-":
                    # Hardcoded: ensure it's exactly YYYY-MM-DD
                    pass
                else:
                    # Fallback parsing
                    dt = datetime.strptime(date_str, "%Y-%m-%d")
                    date_str = dt.strftime("%Y-%m-%d")
            except:
                pass
                
            desktop_path = os.path.join(os.environ.get('USERPROFILE', os.path.expanduser("~")), 'Desktop')
            target_dir = os.path.join(desktop_path, 'arin', date_str)
            if not os.path.exists(target_dir):
                os.makedirs(target_dir)
            logger.info(f"[{self.port}] Target download directory: {target_dir}")

            # 2. Identify potential bills
            potential_buttons = self.driver.find_elements(By.XPATH, "//img[@title='View Bill']")
            count = len(potential_buttons)
            logger.info(f"[{self.port}] Found {count} bill buttons on page.")
            
            # Determine which indices to process
            if selective_indices is not None:
                indices_to_process = [i for i in selective_indices if i < count]
            else:
                if end_index is None: end_index = count
                indices_to_process = list(range(start_index, min(end_index, count)))

            real_count = len(indices_to_process)
            if real_count == 0:
                return True, "No bills to download."

            logger.info(f"[{self.port}] Processing {real_count} specific bills...")
            
            downloaded = 0
            main_window = self.driver.current_window_handle
            
            # Load Balancing: Each worker handles 5 bills initially for controlled parallel
            BATCH_SIZE = 50 # Each worker processes 5 bills at a time
            
            import glob, time
            from processing import extract_data_from_pdf
            
            for i in range(0, real_count, BATCH_SIZE):
                batch_indices = indices_to_process[i:i+BATCH_SIZE]
                logger.info(f"[{self.port}] Batch: Triggering {len(batch_indices)} downloads...")
                
                # PRE-DOWNLOAD: Build mapping and clean up old duplicates!
                batch_metadata = []
                for idx in batch_indices:
                    try:
                        btn = potential_buttons[idx]
                        row = btn.find_element(By.XPATH, "./ancestor::tr")
                        cells = row.find_elements(By.TAG_NAME, "td")
                        
                        if len(cells) >= 4:
                            raw_cnum = cells[1].text.strip()
                            # Support Marathi numbers (Issue #15)
                            trans_table = str.maketrans("०१२३४५६७८९", "0123456789")
                            raw_cnum = raw_cnum.translate(trans_table)
                            c_num = "".join([c for c in raw_cnum if c.isdigit()])
                            raw_name = cells[3].text
                            c_name = "".join([c for c in raw_name if c.isalnum() or c in (' ', '_', '-')]).strip()
                            
                            target_filename = f"{c_num}_{c_name}.pdf"
                            target_filepath = os.path.join(target_dir, target_filename)
                            
                            # 1. OVERWRITE LOGIC: Delete the target file if it already exists
                            if os.path.exists(target_filepath):
                                try:
                                    os.remove(target_filepath)
                                    logger.info(f"[{self.port}] Overwriting existing file: {target_filename}")
                                except Exception as e:
                                    logger.warning(f"Could not delete existing target {target_filename}: {e}")
                            
                            # 2. OVERWRITE LOGIC: Delete archaic or stale EB raw files for this consumer
                            stale_files = [f for f in glob.glob(os.path.join(target_dir, "*.pdf")) if c_num in os.path.basename(f) and "_" not in os.path.basename(f)]
                            for stale in stale_files:
                                try: os.remove(stale)
                                except: pass
                                    
                            batch_metadata.append({"index": idx, "c_num": c_num, "c_name": c_name, "target": target_filename})
                    except Exception as map_err:
                        logger.warning(f"[{self.port}] Failed to map metadata for index {idx}: {map_err}")
                
                # Sequential Download per consumer — handles new tab popup
                # FAST DOWNLOAD LOGIC: We will trigger downloads rapidly and defer slow renames
                for meta in batch_metadata:
                    idx = meta["index"]
                    c_num = meta["c_num"]
                    c_name = meta["c_name"]
                    target_filename = meta["target"]
                    target_filepath = os.path.join(target_dir, target_filename)
                    
                    try:
                        main_window = self.driver.current_window_handle
                        before_handles = set(self.driver.window_handles)
                        before_pdfs = set(glob.glob(os.path.join(target_dir, "*.pdf")))
                        
                        # Step 1: Click View Bill button
                        btn = self.driver.find_elements(By.XPATH, "//img[@title='View Bill']")[idx]
                        self.driver.execute_script("arguments[0].scrollIntoView(true);", btn)
                        time.sleep(0.3)
                        self.driver.execute_script("arguments[0].click();", btn)
                        
                        # Wait dynamically for a new tab to appear (up to 10 seconds)
                        # Consumers 3 and 5 often take much longer to route on the government portal
                        new_tab_handles = set()
                        for _ in range(20):
                            time.sleep(0.5)
                            try:
                                alert = self.driver.switch_to.alert
                                alert_text = alert.text
                                alert.accept()
                                logger.warning(f"[{self.port}] Alert intercepted for {c_num}: {alert_text}")
                                # If it's a genuine 'not generated' alert, we can stop waiting
                                break
                            except:
                                pass
                                
                            after_handles = set(self.driver.window_handles)
                            new_tab_handles = after_handles - before_handles
                            if new_tab_handles:
                                break
                        
                        if new_tab_handles:
                            # Case A: A new tab opened — switch to it
                            new_tab = list(new_tab_handles)[0]
                            self.driver.switch_to.window(new_tab)
                            logger.info(f"[{self.port}] Switched to bill tab for {c_num}")
                            
                            # Wait for the tab content to be ready
                            try:
                                WebDriverWait(self.driver, 5).until(lambda d: d.execute_script("return document.readyState") == "complete")
                            except: pass
                            
                            # Optimized JS to find and click download button instantly
                            self.driver.execute_script("""
                                function clickDownload() {
                                    const selectors = [
                                        'button[id*="download"]', 'a[href*="download"]', 
                                        'img[title*="Download"]', '.btn-download',
                                        'input[value*="Download"]', 'button:contains("Download")'
                                    ];
                                    for (let s of selectors) {
                                        let el = document.querySelector(s);
                                        if (el) { el.click(); return true; }
                                    }
                                    // Deep search if not found
                                    let all = document.querySelectorAll('*');
                                    for (let el of all) {
                                        if (el.innerText && el.innerText.toLowerCase().includes('download') && el.tagName !== 'BODY') {
                                            el.click(); return true;
                                        }
                                    }
                                    return false;
                                }
                                clickDownload();
                            """)
                            
                            # Wait for download to start (check for crdownload or new pdf)
                            download_started = False
                            for _ in range(10): # Max 5 seconds wait for START
                                time.sleep(0.5)
                                if glob.glob(os.path.join(target_dir, "*.crdownload")) or (set(glob.glob(os.path.join(target_dir, "*.pdf"))) - before_pdfs):
                                    download_started = True
                                    break
                            
                            if download_started:
                                logger.info(f"[{self.port}] Download started for {c_num}, closing tab.")
                                self.driver.close()
                                self.driver.switch_to.window(main_window)
                            else:
                                logger.warning(f"[{self.port}] Download didn't start for {c_num}, keeping tab for a bit...")
                                time.sleep(2)
                                self.driver.close()
                                self.driver.switch_to.window(main_window)
                            
                        else:
                            # Case B: Popup/Download in same window
                            time.sleep(1) # Minimal wait for same-window trigger
                        
                        # FAST QUEUE: Wait max 3 seconds. If it's a large bill (2-3MB), let it download in background!
                        t0 = time.time()
                        download_finished = False
                        while time.time() - t0 < 3:
                            if not glob.glob(os.path.join(target_dir, "*.crdownload")):
                                download_finished = True
                                break
                            time.sleep(0.5)
                            
                        if not download_finished:
                            logger.info(f"[{self.port}] Bill for {c_num} is large. Letting it download in background. Moving to next...")
                            continue # Skip renaming for now, we will bulk-rename at the end!
                        
                        # Find the newly downloaded PDF and rename it
                        all_current_pdfs = set(glob.glob(os.path.join(target_dir, "*.pdf")))
                        new_pdfs = all_current_pdfs - before_pdfs
                        
                        # Also try matching by consumer number in existing files
                        if not new_pdfs:
                            new_pdfs = {f for f in all_current_pdfs if c_num in os.path.basename(f) and f != target_filepath}
                        
                        if new_pdfs:
                            # Pick newest file
                            new_pdfs_list = sorted(list(new_pdfs), key=os.path.getmtime, reverse=True)
                            current_file = new_pdfs_list[0]
                            
                            try:
                                # 1. Extract data from the newly downloaded file (might be EB... or something similar)
                                extracted_data = extract_data_from_pdf(current_file, default_date=date_str)
                                
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
                                    logger.warning(f"[{self.port}] Extraction failed for {c_num}, using defaults.")
                                
                                # 2. Determine final local name: [RealConsumerNum]_MMM_YYYY.pdf (Rule #3)
                                # This name allows batch_drive_upload.py to find the real consumer folder
                                final_c_num = extracted_data.get("consumer_number", c_num)
                                final_local_name = f"{final_c_num}_{month_year_str}.pdf"
                                final_target_path = os.path.join(target_dir, final_local_name)
                                
                                # --- BILL FILTERING REMOVED (User requested ALL bills) ---
                                # Previous filter for Zero/Normal generation has been disabled.

                                # 3. Perform the rename (Only reached if it's Poor Generation)
                                try:

                                    if current_file != final_target_path:
                                        # If final target already exists, delete it first
                                        if os.path.exists(final_target_path):
                                            os.remove(final_target_path)
                                        os.replace(current_file, final_target_path)
                                    logger.info(f"[{self.port}] Final Rename: {final_local_name}")
                                    
                                    # Update count for progress reporting (Rule #9)
                                    downloaded += 1
                                    
                                    # Cleanup any other files containing the internal ID or EB prefix
                                    for pattern in [f"*{c_num}*.pdf", "EB*.pdf"]:
                                        for stale in glob.glob(os.path.join(target_dir, pattern)):
                                            if os.path.basename(stale) != final_local_name:
                                                try: os.remove(stale)
                                                except: pass
                                                
                                    # Save to JSON cache for UI progress tracking
                                    self._update_cache_and_stats(target_dir, extracted_data)

                                    
                                except Exception as rename_err:
                                    logger.error(f"[{self.port}] Could not rename/cache {c_num}: {rename_err}")
                                    
                            except Exception as proc_err:
                                logger.error(f"[{self.port}] Processing error for {c_num}: {proc_err}")
                        else:
                            logger.error(f"[{self.port}] NO PDF downloaded for consumer {c_num}")
                            
                    except Exception as e:
                        logger.error(f"[{self.port}] Failed to download for index {idx} ({c_num}): {e}")
                        # Failsafe cleanup: If we crashed in a new tab, force close it and return to main
                        try:
                            curr_handles = self.driver.window_handles
                            if len(curr_handles) > 1 and 'main_window' in locals():
                                for h in curr_handles:
                                    if h != main_window:
                                        self.driver.switch_to.window(h)
                                        self.driver.close()
                                self.driver.switch_to.window(main_window)
                        except: pass
                    
                    time.sleep(0.5)  # Small gap between consumers
                    
                # =====================================================================
                # PHASE 2: BULK RENAME BACKGROUND DOWNLOADS
                # =====================================================================
                pending_crdownloads = glob.glob(os.path.join(target_dir, "*.crdownload"))
                if pending_crdownloads:
                    logger.info(f"[{self.port}] Waiting for {len(pending_crdownloads)} background downloads to finish (Max 120s)...")
                    t0 = time.time()
                    while time.time() - t0 < 120:
                        if not glob.glob(os.path.join(target_dir, "*.crdownload")):
                            break
                        time.sleep(2)
                
                # Find all PDFs that haven't been renamed yet (no underscore in name)
                # and process them just like the fast ones.
                straggler_pdfs = [f for f in glob.glob(os.path.join(target_dir, "*.pdf")) if "_" not in os.path.basename(f)]
                if straggler_pdfs:
                    logger.info(f"[{self.port}] Bulk renaming {len(straggler_pdfs)} background downloads...")
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
                
            return True, f"[{self.port}] Finished. Uploaded {downloaded}/{real_count} bills to Drive."

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
