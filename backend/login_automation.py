import base64
import asyncio
import logging
from playwright.async_api import async_playwright

logger = logging.getLogger(__name__)

class LoginAutomation:
    def __init__(self):
        self.playwright = None
        self.browser = None
        self.context = None
        self.page = None
        self.login_url = "https://wss.mahadiscom.in/wss/wss?uiActionName=getCustAccountLogin"
        self.status = "IDLE"
        self.last_alert_msg = None
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

    async def start_login(self, username, password):
        await self.close_browser()  # Clean up any existing session
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
                # Fallback to grabbing the area where captcha usually is, or just return an error
                return {"status": "ERROR", "message": "CAPTCHA image not found on page"}
                
            captcha_buffer = await captcha_element.screenshot()
            captcha_b64 = base64.b64encode(captcha_buffer).decode("utf-8")
            
            self.status = "CAPTCHA_REQUIRED"
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
                # We can store cookies to use for requests or return them
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

# Global instance for the FastAPI app to use
login_automator = LoginAutomation()
