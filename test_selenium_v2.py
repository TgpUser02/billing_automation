from selenium import webdriver
import time
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    print("Initializing webdriver using Selenium Manager...")
    # Selenium 4.10+ manages drivers automatically if Service is not provided or empty
    options = webdriver.ChromeOptions()
    options.add_argument("--start-maximized")
    options.add_experimental_option("detach", True)
    
    driver = webdriver.Chrome(options=options)
    
    print("Navigating...")
    driver.get("https://www.google.com")
    print("Success! Browser launched.")
    time.sleep(5)
    driver.quit()
except Exception as e:
    print(f"FAILED: {e}")
