from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
import time

try:
    print("Installing driver...")
    service = Service(ChromeDriverManager().install())
    print("Driver installed. Creating options...")
    options = webdriver.ChromeOptions()
    options.add_argument("--start-maximized")
    options.add_experimental_option("detach", True)
    
    print("Initializing webdriver...")
    driver = webdriver.Chrome(service=service, options=options)
    
    print("Navigating...")
    driver.get("https://www.google.com")
    print("Success! Browser launched.")
    time.sleep(5)
    driver.quit()
except Exception as e:
    print(f"FAILED: {e}")
