import base64
import asyncio
import logging
from playwright.async_api import async_playwright

logger = logging.getLogger(__name__)

import json
import os

def get_session_file_path(username):
    # Sanitize username to avoid path traversal
    safe_name = "".join([c for c in username if c.isalnum() or c in ("-", "_")]).strip()
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(backend_dir, "secrets", f"portal_session_{safe_name}.json")

def save_session_cookies(username, cookies):
    try:
        path = get_session_file_path(username)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            json.dump(cookies, f)
        logger.info(f"Saved portal session cookies for {username} to {path}")
    except Exception as e:
        logger.error(f"Failed to save session cookies for {username}: {e}")

def load_session_cookies(username):
    try:
        path = get_session_file_path(username)
        if os.path.exists(path):
            with open(path, "r") as f:
                return json.load(f)
    except Exception as e:
        logger.error(f"Failed to load session cookies for {username}: {e}")
    return None

def delete_session_file(username):
    try:
        path = get_session_file_path(username)
        if os.path.exists(path):
            os.remove(path)
            logger.info(f"Deleted expired session file at {path}")
    except Exception as e:
        logger.error(f"Failed to delete session file for {username}: {e}")

class LoginAutomation:
    def __init__(self):
        self.playwright = None
        self.browser = None
        self.context = None
        self.page = None
        self.login_url = "https://wss.mahadiscom.in/wss/wss?uiActionName=getCustAccountLogin"
        self.status = "IDLE"
        self.last_alert_msg = None
        self.current_login_username = None
        self._operation_lock = asyncio.Lock()

    async def _handle_dialog(self, dialog):
        logger.warning(f"Browser Alert: {dialog.message}")
        self.last_alert_msg = dialog.message
        await dialog.dismiss()

    async def init_browser(self):
        if self.playwright is not None:
            return

        try:
            self.playwright = await async_playwright().start()
            self.browser = await self.playwright.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--disable-gpu-sandbox"
                ]
            )
            self.context = await self.browser.new_context(viewport={"width": 1400, "height": 900})
            self.page = await self.context.new_page()
            self.page.on("dialog", self._handle_dialog)
        except Exception:
            await self.close_browser()
            raise

    async def close_browser(self):
        try:
            if self.page:
                await self.page.close()
            if self.context:
                await self.context.close()
            if self.browser:
                await self.browser.close()
            if self.playwright:
                await self.playwright.stop()
        except Exception as e:
            logger.error(f"Error closing browser: {e}")
        finally:
            self.playwright = None
            self.browser = None
            self.context = None
            self.page = None
            self.status = "IDLE"
            self.current_login_username = None

    async def start_login(self, username, password):
        await self.close_browser()  # Clean up any existing session
        
        # Try to reuse an existing stored cookie session
        cookies = load_session_cookies(username)
        if cookies:
            logger.info(f"Attempting to reuse stored session cookies for {username}...")
            await self.init_browser()
            try:
                # Add cookies to context
                await self.context.add_cookies(cookies)
                
                # Navigate directly to login url (it should auto-redirect to getMyAccount if authenticated)
                logger.info(f"Navigating to login URL to verify session cookies...")
                await self.page.goto(self.login_url, wait_until="networkidle")
                
                # Wait a moment for load and check status
                await asyncio.sleep(3)
                
                # Verify if we are logged in successfully
                state_res = await self.check_post_login_state()
                if state_res.get("status") == "SUCCESS":
                    logger.info(f"✓ Stored session cookies are valid! Login skipped for {username}.")
                    self.status = "SUCCESS"
                    self.current_login_username = username
                    return {
                        "status": "SUCCESS",
                        "message": "Logged in using saved session cookies.",
                        "session": state_res.get("session")
                    }
                else:
                    logger.info(f"Session cookies expired or invalid for {username}. Performing fresh login.")
                    delete_session_file(username)
            except Exception as e:
                logger.error(f"Error restoring cookie session: {e}")
                delete_session_file(username)
            
            # Reset browser state before starting fresh login
            await self.close_browser()

        # Fresh login
        await self.init_browser()
        self.last_alert_msg = None
        
        try:
            logger.info(f"Navigating to {self.login_url}")
            await self.page.goto(self.login_url, wait_until="networkidle")

            # Fill username and password
            await self.page.fill("#loginId", username)
            await self.page.fill("#password", password)

            # Wait a moment for captcha image to load
            await asyncio.sleep(1)

            # Check for captcha
            captcha_element = self.page.locator("canvas#captcha")
            if await captcha_element.count() == 0:
                return {"status": "ERROR", "message": "CAPTCHA image not found on page"}
                
            captcha_buffer = await captcha_element.screenshot()
            captcha_b64 = base64.b64encode(captcha_buffer).decode("utf-8")
            
            self.status = "CAPTCHA_REQUIRED"
            self.current_login_username = username
            return {
                "status": "CAPTCHA_REQUIRED", 
                "captchaImage": f"data:image/png;base64,{captcha_b64}"
            }
            
        except Exception as e:
            logger.error(f"Error in start_login: {e}")
            await self.close_browser()
            return {"status": "ERROR", "message": str(e)}

    async def submit_captcha(self, captcha_text):
        if self.status != "CAPTCHA_REQUIRED":
            return {"status": "ERROR", "message": "Not expecting CAPTCHA"}
            
        self.last_alert_msg = None
        try:
            await self.page.fill("#txtInput", captcha_text)
            await self.page.click("#loginButton")
            
            # Wait for AJAX or page reload
            await asyncio.sleep(3)
            
            if self.last_alert_msg:
                msg = self.last_alert_msg
                self.last_alert_msg = None
                return {"status": "ERROR", "message": msg}
            
            return await self.check_post_login_state()
        except Exception as e:
            return {"status": "ERROR", "message": str(e)}

    async def submit_otp(self, otp_text):
        if self.status != "OTP_REQUIRED":
            return {"status": "ERROR", "message": "Not expecting OTP"}
            
        self.last_alert_msg = None
        try:
            await self.page.fill("#txtOTP", otp_text)
            await self.page.click("#loginButtonOTP")
            
            # Wait for network idle or dashboard load
            await asyncio.sleep(4)
            
            if self.last_alert_msg:
                msg = self.last_alert_msg
                self.last_alert_msg = None
                return {"status": "ERROR", "message": msg}
            
            return await self.check_post_login_state()
        except Exception as e:
            return {"status": "ERROR", "message": str(e)}

    async def check_post_login_state(self):
        try:
            # Check if OTP table is visible
            tbl_otp = await self.page.query_selector("#tblOTP")
            if tbl_otp:
                is_visible = await tbl_otp.is_visible()
                if is_visible:
                    self.status = "OTP_REQUIRED"
                    
                    email_msg = ""
                    mob_msg = ""
                    try:
                        email_el = await self.page.query_selector("#lblMaskedEmail1")
                        if email_el: email_msg = (await email_el.text_content()).strip()
                        mob_el = await self.page.query_selector("#lblMaskedMobNo1")
                        if mob_el: mob_msg = (await mob_el.text_content()).strip()
                    except:
                        pass
                        
                    return {
                        "status": "OTP_REQUIRED",
                        "otpEmail": email_msg,
                        "otpMobile": mob_msg
                    }

            # If the portal keeps the base shell URL, inspect the DOM before treating it as an error.
            try:
                await self.page.wait_for_load_state("networkidle", timeout=5000)
            except:
                pass

            dashboard_ready = False
            try:
                grd_cust_list = await self.page.query_selector("#grdCustList")
                if grd_cust_list and await grd_cust_list.is_visible():
                    dashboard_ready = True
            except:
                pass

            if not dashboard_ready:
                try:
                    view_bill_btn = await self.page.query_selector("img[title='View Bill']")
                    if view_bill_btn and await view_bill_btn.is_visible():
                        dashboard_ready = True
                except:
                    pass

            # Check if login was successful (we reach dashboard)
            # Dashboard URL is typically getMyAccount
            url = self.page.url
            if dashboard_ready or "getMyAccount" in url or "Home" in url:
                self.status = "SUCCESS"
                cookies = await self.context.cookies()
                username = getattr(self, "current_login_username", None)
                if username:
                    save_session_cookies(username, cookies)
                return {"status": "SUCCESS", "session": cookies}

            if url.rstrip("/").endswith("/wss/wss"):
                login_visible = False
                try:
                    login_id = await self.page.query_selector("#loginId")
                    password_el = await self.page.query_selector("#password")
                    login_visible = bool((login_id and await login_id.is_visible()) or (password_el and await password_el.is_visible()))
                except:
                    pass

                if not login_visible:
                    self.status = "SUCCESS"
                    cookies = await self.context.cookies()
                    username = getattr(self, "current_login_username", None)
                    if username:
                        save_session_cookies(username, cookies)
                    return {"status": "SUCCESS", "session": cookies}

                return {"status": "ERROR", "message": "Portal stayed on the base page with the login form still visible."}
                
            # If we are still on the login page but no OTP, maybe wrong credentials?
            if "getCustAccountLogin" in url:
                # Check for error labels
                return {"status": "ERROR", "message": "Login failed, returned to login page"}

            # Unknown state
            return {"status": "ERROR", "message": f"Unexpected state: {url}"}
        except Exception as e:
            return {"status": "ERROR", "message": f"State check failed: {str(e)}"}

    async def start_add_consumer(self, consumer_number, billing_unit):
        if not self.page:
            return {"status": "ERROR", "message": "No active browser session. Please login first."}
        
        self.last_alert_msg = None
        try:
            logger.info(f"Navigating to Add Consumer page...")
            await self.page.goto("https://wss.mahadiscom.in/wss/wss?uiActionName=getAddConsumer", wait_until="networkidle")
            
            # Select Consumer Type (LT Consumer)
            for selector in ["select#consumerType", "select", "select[name='consumerType']"]:
                try:
                    await self.page.select_option(selector, label="LT Consumer")
                    break
                except:
                    try:
                        await self.page.select_option(selector, value="1") # 1 is LT Consumer
                        break
                    except:
                        pass

            # Fill Consumer Number
            await self.page.fill("#consumerNo", consumer_number)

            # Select BU / Subdivision
            selected_bu = False
            for selector in ["#subdivision", "select#billingUnit", "select#subdivision"]:
                el = await self.page.query_selector(selector)
                if el:
                    # Try selecting by value (e.g. "4151")
                    try:
                        await self.page.select_option(selector, value=billing_unit)
                        selected_bu = True
                        logger.info(f"Selected BU {billing_unit} in {selector} by value")
                        break
                    except:
                        pass
                    
                    # Try selecting by matching label
                    try:
                        options = await self.page.locator(f"{selector} option").all()
                        for opt in options:
                            label_text = await opt.text_content()
                            opt_value = await opt.get_attribute("value")
                            if billing_unit.lower() in label_text.lower() or (opt_value and billing_unit == opt_value):
                                await self.page.select_option(selector, value=opt_value)
                                selected_bu = True
                                logger.info(f"Selected BU in {selector} by matching label: {label_text}")
                                break
                        if selected_bu:
                            break
                    except:
                        pass

            # Wait a moment for captcha image to load
            await asyncio.sleep(1)

            # Look for captcha element
            captcha_el = None
            for selector in ["#captchaImage", "img#captchaImage", "img#captcha", "canvas#captcha", "#imgCaptcha"]:
                el = await self.page.query_selector(selector)
                if el and await el.is_visible():
                    captcha_el = el
                    break

            if not captcha_el:
                return {"status": "ERROR", "message": "CAPTCHA image not found on Add Consumer page"}

            captcha_buffer = await captcha_el.screenshot()
            captcha_b64 = base64.b64encode(captcha_buffer).decode("utf-8")

            self.status = "ADD_CONSUMER_CAPTCHA_REQUIRED"
            return {
                "status": "CAPTCHA_REQUIRED",
                "captchaImage": f"data:image/png;base64,{captcha_b64}"
            }

        except Exception as e:
            logger.error(f"Error in start_add_consumer: {e}")
            return {"status": "ERROR", "message": str(e)}

    async def submit_add_consumer_captcha(self, captcha_text):
        if self.status != "ADD_CONSUMER_CAPTCHA_REQUIRED":
            return {"status": "ERROR", "message": "Not expecting Add Consumer CAPTCHA"}

        self.last_alert_msg = None
        try:
            # Fill CAPTCHA
            filled = False
            for selector in ["#captchaInput", "#txtInput", "#txtCaptcha", "input[name='captcha']"]:
                if await self.page.query_selector(selector):
                    await self.page.fill(selector, captcha_text)
                    filled = True
                    break
            if not filled:
                await self.page.fill("#captchaInput", captcha_text)

            # Click submit/request OTP button
            clicked = False
            for selector in ["#submitBtn", "#submitButton", "input[type='submit']", "#Submit"]:
                btn = self.page.locator(selector)
                if await btn.count() > 0:
                    await btn.click()
                    clicked = True
                    break
            if not clicked:
                await self.page.click("input[type='submit'], button[type='submit']")

            # Wait for AJAX response
            await asyncio.sleep(4)

            # Check if alert was triggered
            if self.last_alert_msg:
                msg = self.last_alert_msg
                self.last_alert_msg = None
                return {"status": "ERROR", "message": msg}

            # Check if OTP input is visible
            otp_visible = False
            for selector in ["#otpField", "#txtOTP", "#otp", "input[name='otp']"]:
                el = await self.page.query_selector(selector)
                if el and await el.is_visible():
                    otp_visible = True
                    break

            if otp_visible:
                self.status = "ADD_CONSUMER_OTP_REQUIRED"
                return {
                    "status": "OTP_REQUIRED",
                    "message": "OTP has been successfully sent to registered mobile/email."
                }
            
            err_msg = "Failed to proceed to OTP stage. Please check Captcha or Subdivision."
            try:
                for err_sel in [".errorMessage", "#lblMessage", "#errorLabel", ".text-danger"]:
                    err_el = await self.page.query_selector(err_sel)
                    if err_el and await err_el.is_visible():
                        err_msg = (await err_el.text_content()).strip()
                        break
            except:
                pass

            return {"status": "ERROR", "message": err_msg}

        except Exception as e:
            logger.error(f"Error in submit_add_consumer_captcha: {e}")
            return {"status": "ERROR", "message": str(e)}

    async def submit_add_consumer_otp(self, otp_text):
        if self.status != "ADD_CONSUMER_OTP_REQUIRED":
            return {"status": "ERROR", "message": "Not expecting Add Consumer OTP"}

        self.last_alert_msg = None
        try:
            # Fill OTP
            filled = False
            for selector in ["#otpField", "#txtOTP", "#otp"]:
                if await self.page.query_selector(selector):
                    await self.page.fill(selector, otp_text)
                    filled = True
                    break
            if not filled:
                await self.page.fill("#otpField", otp_text)

            # Click verify/add button
            clicked = False
            for selector in ["#verifyOtpBtn", "#btnVerifyOTP", "#loginButtonOTP", "#submitOTP"]:
                btn = self.page.locator(selector)
                if await btn.count() > 0:
                    await btn.click()
                    clicked = True
                    break
            if not clicked:
                await self.page.click("input[type='submit'], button[type='submit']")

            # Wait for AJAX response
            await asyncio.sleep(4)

            # Check if alert was triggered
            if self.last_alert_msg:
                msg = self.last_alert_msg
                self.last_alert_msg = None
                
                if "success" in msg.lower() or "added" in msg.lower() or "linked" in msg.lower() or "complete" in msg.lower():
                    self.status = "SUCCESS"
                    try:
                        await self.page.goto("https://wss.mahadiscom.in/wss/wss?uiActionName=getMyAccount")
                    except:
                        pass
                    return {"status": "SUCCESS", "message": msg}
                else:
                    return {"status": "ERROR", "message": msg}

            url = self.page.url
            if "getMyAccount" in url:
                self.status = "SUCCESS"
                return {"status": "SUCCESS", "message": "Consumer connection linked successfully."}

            return {"status": "ERROR", "message": "Verification completed, but could not confirm if consumer was added. Check Remote View."}

        except Exception as e:
            logger.error(f"Error in submit_add_consumer_otp: {e}")
            return {"status": "ERROR", "message": str(e)}

# Global instance for the FastAPI app to use
login_automator = LoginAutomation()
