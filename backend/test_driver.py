from selenium import webdriver
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_launch():
    try:
        options = webdriver.ChromeOptions()
        options.add_argument("--start-maximized")
        # Ensure we are not headless so user can see it
        # options.add_argument("--headless") 
        
        logger.info("Attempting to launch Chrome...")
        driver = webdriver.Chrome(options=options)
        
        logger.info("Chrome launched successfully!")
        driver.get("https://google.com")
        logger.info("Navigated to Google.")
        
        import time
        time.sleep(3)
        driver.quit()
        logger.info("Closed browser.")
        return True
    except Exception as e:
        logger.error(f"Failed to launch: {e}")
        return False

if __name__ == "__main__":
    test_launch()
