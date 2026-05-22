# VPS Production Risks

Short list of the major issues that can prevent this system from working correctly on a VPS.

## 1. Third-party login depends on Chromium plus user CAPTCHA/OTP input

- Files: [backend/automation.py](backend/automation.py#L122), [backend/automation.py](backend/automation.py#L304), [backend/automation.py](backend/automation.py#L345), [src/pages/Login.tsx](src/pages/Login.tsx#L45)
- Risk: the portal login cannot be fully automated because CAPTCHA and OTP belong to the third-party site. The app still needs a real Chromium session and user interaction. If the VPS runs without Chromium/desktop support, login can fail. Also, a Chromium window opened on the VPS is not automatically visible on the user's own computer unless you provide remote desktop access, screen sharing, or embed/stream that browser session inside the app.
- Fix: keep Chromium-based login, support headless or remote-desktop operation, and let the user complete CAPTCHA/OTP in the browser session before continuing. If the user must see and control the browser, expose the VPS Chromium session through a remote desktop/VNC page or a streamed browser window inside the UI.

## 2. Frontend still depends on localhost / port 5000

- Files: [src/lib/api.ts](src/lib/api.ts#L1), [src/pages/Index.tsx](src/pages/Index.tsx#L356), [src/pages/Login.tsx](src/pages/Login.tsx#L129)
- Risk: the UI defaults to the same host on port 5000, and one upload call is hardcoded to `http://localhost:5000`. That breaks when the app is behind a reverse proxy, a different host, or a different port.
- Fix: use a required production API base URL and remove the hardcoded localhost call.

## 3. Windows/Desktop paths are baked into the backend flow

- Files: [backend/main.py](backend/main.py#L199), [backend/main.py](backend/main.py#L251), [backend/main.py](backend/main.py#L780), [backend/main.py](backend/main.py#L810), [backend/main.py](backend/main.py#L867), [backend/automation.py](backend/automation.py#L142), [backend/batch_drive_upload.py](backend/batch_drive_upload.py#L12)
- Risk: the backend repeatedly builds paths under `USERPROFILE\\Desktop\\arin\\...`, which is Windows-specific. A Linux VPS usually has no Desktop folder or `USERPROFILE`, so saving, processing, and upload discovery can fail.
- Fix: use a configurable storage root such as `ARIN_STORAGE_PATH`, with a Linux-safe default like `/var/arin`.

## 4. Auto-download is fragile because it relies on in-memory state and subprocess chaining

- Files: [backend/main.py](backend/main.py#L167), [backend/main.py](backend/main.py#L665), [backend/main.py](backend/main.py#L723), [backend/main.py](backend/main.py#L752)
- Risk: download and process progress live in module globals, and later steps are started through background tasks plus subprocess calls. If the process restarts or scales to multiple workers, the job can lose state or skip the upload step.
- Fix: move job state into a persistent queue or database and make download/process/upload steps idempotent.

## 5. Consumer Connect can freeze on large datasets because it renders everything at once

- Files: [backend/main.py](backend/main.py#L797), [src/pages/ConsumerConnect.tsx](src/pages/ConsumerConnect.tsx#L198), [src/components/ConsumerTable.tsx](src/components/ConsumerTable.tsx#L39)
- Risk: the backend returns the full bills list and the table renders every row directly. On a production database this can lag badly or freeze the browser.
- Fix: add server-side pagination or cursoring and virtualize the table rows.

## 6. Remove legacy scaffold and debug files before production deployment

- Files to remove or archive: [vite-project/vite-project/](vite-project/vite-project/), [debug_log.txt](debug_log.txt), [get_source.py](get_source.py), [inspect_dump.py](inspect_dump.py), [page_dump.html](page_dump.html), [post_login_dump.html](post_login_dump.html), [login_page.html](login_page.html), [fail_page_0.html](fail_page_0.html), [bill_page_0.html](bill_page_0.html), [test_selenium.py](test_selenium.py), [test_selenium_v2.py](test_selenium_v2.py), [test_auth_no_mysql.py](test_auth_no_mysql.py), [verify_login.py](verify_login.py), [CREATE_SHAREABLE_ZIP.bat](CREATE_SHAREABLE_ZIP.bat)
- Files to review separately before deleting: the nested scaffold’s [vite-project/vite-project/package.json](vite-project/vite-project/package.json) and [vite-project/vite-project/package-lock.json](vite-project/vite-project/package-lock.json)
- Risk: these files look like development artifacts, dumps, or a duplicate scaffold rather than the deployed app. Keeping them in the production tree adds confusion and makes it harder to identify the real deployment surface.
- Fix: remove or archive the legacy/debug files, and only keep packages that are directly imported by the production app.
