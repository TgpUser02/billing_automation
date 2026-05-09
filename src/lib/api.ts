const API_BASE_URL = `http://${window.location.hostname}:5000/api`;

// ═══════════════════════════════════════════════════════════════════════════════
// JWT TOKEN MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

function getToken(): string | null {
    return sessionStorage.getItem("arin_jwt_token");
}

function setToken(token: string): void {
    sessionStorage.setItem("arin_jwt_token", token);
}

function clearToken(): void {
    sessionStorage.removeItem("arin_jwt_token");
    sessionStorage.removeItem("arin_auth");
    sessionStorage.removeItem("arin_current_user");
}

function isTokenExpired(): boolean {
    const token = getToken();
    if (!token) return true;
    
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const exp = payload.exp * 1000;
        return Date.now() >= exp;
    } catch {
        return true;
    }
}

function shouldRefreshToken(): boolean {
    const token = getToken();
    if (!token) return false;
    
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const exp = payload.exp * 1000;
        // Refresh if it expires in less than 15 minutes, or is already expired
        // (Our backend refresh endpoint allows refreshing slightly expired tokens)
        const fifteenMinutes = 15 * 60 * 1000;
        return Date.now() >= (exp - fifteenMinutes);
    } catch {
        return false;
    }
}

let refreshPromise: Promise<any> | null = null;

// ═══════════════════════════════════════════════════════════════════════════════
// HTTP HELPERS WITH AUTH
// ═══════════════════════════════════════════════════════════════════════════════

function getAuthHeaders(): Record<string, string> {
    const token = getToken();
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
}

async function checkResponse(response: Response) {
    if (response.status === 401) {
        // Token expired or invalid — force logout
        clearToken();
        window.location.href = "/login";
        throw new Error("Session expired. Please login again.");
    }
    if (!response.ok) {
        let detail = `Server error ${response.status}`;
        try {
            const err = await response.json();
            detail = err.detail || err.message || detail;
        } catch { /* ignore parse error */ }
        throw new Error(detail);
    }
    return response.json();
}

async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
    // 1. If token is near expiration or expired, try to refresh it silently
    if (shouldRefreshToken() && !url.includes("/auth/")) {
        try {
            if (!refreshPromise) {
                refreshPromise = api.refreshToken();
            }
            await refreshPromise;
            refreshPromise = null;
        } catch (err) {
            refreshPromise = null;
            console.error("Silent refresh failed:", err);
            // If refresh fails and token is truly expired, logout
            if (isTokenExpired()) {
                clearToken();
                window.location.href = "/login";
                throw new Error("Session expired");
            }
        }
    }
    
    // 2. Final check: if still no token or expired (and refresh failed), force login
    if (isTokenExpired() && !url.includes("/auth/")) {
        // Redirect disabled to prevent loop in dev context
        // clearToken();
        // window.location.href = "/login";
        // throw new Error("Session expired");
    }
    
    // Records session activity - REMOVED
    
    const headers = {
        ...getAuthHeaders(),
        ...(options.headers || {}),
    };
    
    return fetch(url, { ...options, headers });
}

// ═══════════════════════════════════════════════════════════════════════════════
// API METHODS
// ═══════════════════════════════════════════════════════════════════════════════

export const api = {
    // ── AUTH (No JWT required) ──
    login: async (username: string, password: string, captchaToken?: string) => {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password, captchaToken }),
        });
        const data = await checkResponse(response);
        if (data.token) {
            setToken(data.token);
            sessionStorage.setItem("arin_auth", "true");
            sessionStorage.setItem("arin_current_user", data.username);
        }
        return data;
    },

    refreshToken: async () => {
        const token = getToken();
        if (!token) throw new Error("No token to refresh");
        
        try {
            const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}` 
                },
            });
            
            if (!response.ok) throw new Error("Refresh failed");
            
            const data = await response.json();
            if (data.token) {
                setToken(data.token);
                console.log("Token refreshed automatically");
                return data;
            }
            throw new Error("No token returned");
        } catch (err) {
            console.error("Refresh request error:", err);
            throw err;
        }
    },

    verifyToken: async () => {
        const token = getToken();
        if (!token || isTokenExpired()) return { status: "invalid" };
        
        try {
            const response = await fetch(`${API_BASE_URL}/auth/verify`, {
                headers: { "Authorization": `Bearer ${token}` },
            });
            if (!response.ok) return { status: "invalid" };
            return await response.json();
        } catch {
            return { status: "invalid" };
        }
    },

    changePassword: async (currentPassword: string, newPassword: string) => {
        const response = await authFetch(`${API_BASE_URL}/auth/change-password`, {
            method: "POST",
            body: JSON.stringify({ currentPassword, newPassword }),
        });
        return checkResponse(response);
    },

    getRecaptchaConfig: async () => {
        const response = await fetch(`${API_BASE_URL}/auth/recaptcha-config`);
        return response.json();
    },

    logout: () => {
        clearToken();
        window.location.href = "/login";
    },

    // ── PROTECTED ENDPOINTS ──
    launch: async (date: string, customId?: string) => {
        const response = await authFetch(`${API_BASE_URL}/launch`, {
            method: "POST",
            body: JSON.stringify({ date, customId }),
        });
        return checkResponse(response);
    },

    fetchConsumers: async () => {
        const response = await authFetch(`${API_BASE_URL}/consumers`);
        return checkResponse(response);
    },

    startDownload: async (workers: number, selectedIndices: number[], customId?: string) => {
        const response = await authFetch(`${API_BASE_URL}/download`, {
            method: "POST",
            body: JSON.stringify({ workers, selectedIndices, customId }),
        });
        return checkResponse(response);
    },

    processData: async () => {
        const response = await authFetch(`${API_BASE_URL}/process`, {
            method: "POST",
        });
        return checkResponse(response);
    },

    getProcessStatus: async () => {
        const response = await authFetch(`${API_BASE_URL}/process-status`);
        return checkResponse(response);
    },

    getBillingAnalysis: async (consumerNumber: string, month: string) => {
        const response = await authFetch(`${API_BASE_URL}/billing-analysis?consumerNumber=${encodeURIComponent(consumerNumber)}&month=${encodeURIComponent(month)}`);
        return checkResponse(response);
    },

    saveBillImage: async (consumerNumber: string, dateStr: string, imageBase64: string) => {
        const response = await authFetch(`${API_BASE_URL}/save-bill-images`, {
            method: "POST",
            body: JSON.stringify({ consumerNumber, dateStr, imageBase64 }),
        });
        return checkResponse(response);
    },

    saveReports: async (filename: string, data: any[], dateStr: string) => {
        const response = await authFetch(`${API_BASE_URL}/save-reports`, {
            method: "POST",
            body: JSON.stringify({ filename, data, dateStr }),
        });
        return checkResponse(response);
    },

    saveBillData: async (data: any) => {
        const response = await authFetch(`${API_BASE_URL}/save-bill-data`, {
            method: "POST",
            body: JSON.stringify(data),
        });
        return checkResponse(response);
    },

    getConsumersForDate: async (dateStr: string) => {
        const response = await authFetch(`${API_BASE_URL}/consumers-for-date?date_str=${encodeURIComponent(dateStr)}`);
        return checkResponse(response);
    },

    searchConsumersDB: async (consumerNumbers: string[]) => {
        const response = await authFetch(`${API_BASE_URL}/search-consumers-db`, {
            method: "POST",
            body: JSON.stringify({ consumerNumbers }),
        });
        return checkResponse(response);
    },

    getBills: async () => {
        const response = await authFetch(`${API_BASE_URL}/bills`);
        return checkResponse(response);
    },

    getDownloadStatus: async () => {
        const response = await authFetch(`${API_BASE_URL}/download-status`);
        return checkResponse(response);
    },

    getStats: async () => {
        const response = await authFetch(`${API_BASE_URL}/stats`);
        return checkResponse(response);
    },

    getCustomerDetails: async (consumerNumber: string) => {
        const response = await authFetch(`${API_BASE_URL}/customer-details?consumerNumber=${encodeURIComponent(consumerNumber)}`);
        return checkResponse(response);
    },

    getAllCustomersDB: async () => {
        const response = await authFetch(`${API_BASE_URL}/all-customers`);
        return checkResponse(response);
    },

    closeBrowser: async () => {
        const response = await authFetch(`${API_BASE_URL}/close`, {
            method: "POST",
        });
        return checkResponse(response);
    },
    
    uploadZeroGenReport: async () => {
        return authFetch(`${API_BASE_URL}/drive/upload-zero-gen`, {
            method: 'POST'
        });
    }
};

// Export token utilities for use in ProtectedRoute
export { getToken, clearToken, isTokenExpired };
