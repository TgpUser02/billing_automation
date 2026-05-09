import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
import logging
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Email Configuration
EMAIL_USER = os.getenv("EMAIL_USER")
EMAIL_PASS = os.getenv("EMAIL_PASS")
EMAIL_RECEIVER = EMAIL_USER # Default to sending to self if not specified

def send_automation_summary(success_count, failed_count, failed_list=None):
    """Sends an email summary of the billing automation process."""
    if not EMAIL_USER or not EMAIL_PASS:
        logger.warning("Email credentials not configured. Skipping email notification.")
        return False

    try:
        msg = MIMEMultipart()
        msg['From'] = f"Arin Billbot <{EMAIL_USER}>"
        msg['To'] = EMAIL_RECEIVER
        msg['Subject'] = f"Billing Automation Summary - {success_count} Success, {failed_count} Failed"

        body = f"""
        <h2>Arin Billing Automation Summary</h2>
        <p>The billing automation process has completed.</p>
        <ul>
            <li><b>Total Processed:</b> {success_count + failed_count}</li>
            <li><b>Successfully Saved to DB:</b> {success_count}</li>
            <li><b>Failed:</b> {failed_count}</li>
        </ul>
        """

        if failed_list:
            body += "<h3>Failed Consumer Numbers:</h3><ul>"
            for cnum in failed_list:
                body += f"<li>{cnum}</li>"
            body += "</ul>"

        body += "<p>This is an automated notification from your Billbot system.</p>"

        msg.attach(MIMEText(body, 'html'))

        # Standard Gmail SMTP configuration
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(EMAIL_USER, EMAIL_PASS)
        server.send_message(msg)
        server.quit()

        logger.info(f"Summary email sent to {EMAIL_RECEIVER}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email: {e}")
        return False
