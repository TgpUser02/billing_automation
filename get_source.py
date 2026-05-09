from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
import time

def get_source():
    try:
        options = webdriver.ChromeOptions()
        options.add_argument("--start-maximized")
        # options.add_argument("--headless") # Keep visible to verify
        
        driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
        
        url = "https://wss.mahadiscom.in/wss/wss?uiActionName=getCustAccountLogin"
        print(f"Navigating to {url}...")
        driver.get(url)
        
        time.sleep(10) # Wait for load
        
        with open("login_page.html", "w", encoding="utf-8") as f:
            f.write(driver.page_source)
            
        print("Successfully saved login_page.html")
        driver.quit()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    get_source()
