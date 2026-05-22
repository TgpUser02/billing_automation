import json
import os
from threading import Lock

STATE_FILE = "job_state.json"
_lock = Lock()

def _load_state():
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "global_total_bills": 0,
        "active_download_tasks": 0,
        "download_in_progress": False,
        "process_in_progress": False,
        "total_process_count": 0,
        "current_process_count": 0,
        "process_results": {"success": [], "failed": [], "not_in_db": []}
    }

def _save_state(state):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f)

def get_state():
    with _lock:
        return _load_state()

def update_state(updates):
    with _lock:
        state = _load_state()
        state.update(updates)
        _save_state(state)
        return state
