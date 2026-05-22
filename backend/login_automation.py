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

    async def _handle_dialog(self, dialog):
        logger.warning(f"Browser Alert: {dialog.message}")
        self.last_alert_msg = dialog.message
        await dialog.dismiss()

    async def init_browser(self):
        if self.playwright is None:
            self.playwright = await async_playwright().start()
            self.browser = await self.playwright.chromium.launch(headless=True)
            self.context = await self.browser.new_context(viewport={"width": 1400, "height": 900})
            self.page = await self.context.new_page()
            self.page.on("dialog", self._handle_dialog)

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

            # Check if login was successful (we reach dashboard)
            # Dashboard URL is typically getMyAccount
            url = self.page.url
            if "getMyAccount" in url or "Home" in url:
                self.status = "SUCCESS"
                cookies = await self.context.cookies()
                # We can store cookies to use for requests or return them
                return {"status": "SUCCESS", "session": cookies}
                
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
