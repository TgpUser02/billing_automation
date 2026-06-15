const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
export const API_BASE_URL = isLocalhost 
  ? (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api') 
  : '/api';

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
    sessionStorage.removeItem("arin_user_role");
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

function redirectToLogin(): void {
    window.location.href = "/login";
}

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
        redirectToLogin();
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
                redirectToLogin();
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
            sessionStorage.setItem("arin_user_role", data.role || "operator");
        }
        return data;
    },

    register: async (username: string, password: string, email?: string) => {
        const response = await fetch(`${API_BASE_URL}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password, email: email || undefined }),
        });
        return checkResponse(response);
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
        redirectToLogin();
    },

    // ── PROTECTED ENDPOINTS ──
    startLogin: async (username?: string, password?: string, dateStr?: string, customId?: string) => {
        const response = await authFetch(`${API_BASE_URL}/start-login`, {
            method: "POST",
            body: JSON.stringify({ username, password, dateStr, customId }),
        });
        return checkResponse(response);
    },
    
    submitCaptcha: async (captcha: string) => {
        const response = await authFetch(`${API_BASE_URL}/submit-captcha`, {
            method: "POST",
            body: JSON.stringify({ captcha }),
        });
        return checkResponse(response);
    },
    
    submitOtp: async (otp: string) => {
        const response = await authFetch(`${API_BASE_URL}/submit-otp`, {
            method: "POST",
            body: JSON.stringify({ otp }),
        });
        return checkResponse(response);
    },

    fetchRemoteView: async () => {
        const response = await authFetch(`${API_BASE_URL}/remote-view`);
        return checkResponse(response);
    },
    
    resetSystem: async () => {
        const response = await authFetch(`${API_BASE_URL}/reset`, {
            method: "POST",
        });
        return checkResponse(response);
    },

    fetchConsumers: async () => {
        const response = await authFetch(`${API_BASE_URL}/consumers`);
        return checkResponse(response);
    },

    refreshTab: async () => {
        const response = await authFetch(`${API_BASE_URL}/refresh-tab`, {
            method: "POST",
        });
        return checkResponse(response);
    },

    startDownload: async (workers: number, selectedIndices: number[], customId?: string) => {
        const response = await authFetch(`${API_BASE_URL}/download`, {
            method: "POST",
            body: JSON.stringify({ workers, selectedIndices, customId }),
        });
        return checkResponse(response);
    },

    processData: async (threshold?: number) => {
        const response = await authFetch(`${API_BASE_URL}/process`, {
            method: "POST",
            body: threshold !== undefined ? JSON.stringify({ threshold }) : undefined,
        });
        return checkResponse(response);
    },

    startAddConsumer: async (consumerNumber: string, billingUnit: string, consumerType: string = "1") => {
        const response = await authFetch(`${API_BASE_URL}/portal/add-consumer/start`, {
            method: "POST",
            body: JSON.stringify({ consumerNumber, billingUnit, consumerType }),
        });
        return checkResponse(response);
    },

    submitAddConsumerCaptcha: async (captcha: string) => {
        const response = await authFetch(`${API_BASE_URL}/portal/add-consumer/captcha`, {
            method: "POST",
            body: JSON.stringify({ captcha }),
        });
        return checkResponse(response);
    },

    submitAddConsumerOtp: async (otp: string) => {
        const response = await authFetch(`${API_BASE_URL}/portal/add-consumer/otp`, {
            method: "POST",
            body: JSON.stringify({ otp }),
        });
        return checkResponse(response);
    },

    getAddConsumerOptions: async (consumerType?: string) => {
        const url = consumerType 
            ? `${API_BASE_URL}/portal/add-consumer/options?consumerType=${encodeURIComponent(consumerType)}`
            : `${API_BASE_URL}/portal/add-consumer/options`;
        const response = await authFetch(url);
        return checkResponse(response);
    },

    cancelAddConsumer: async () => {
        const response = await authFetch(`${API_BASE_URL}/portal/add-consumer/cancel`, {
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

    listReports: async () => {
        const response = await authFetch(`${API_BASE_URL}/reports/list`);
        return checkResponse(response);
    },

    downloadReport: async (path: string) => {
        const response = await authFetch(`${API_BASE_URL}/reports/download?path=${encodeURIComponent(path)}`);
        if (!response.ok) throw new Error("Failed to download file");
        return response.blob();
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

    saveCustomer: async (customerData: any) => {
        const response = await authFetch(`${API_BASE_URL}/save-customer`, {
            method: "POST",
            body: JSON.stringify(customerData),
        });
        return checkResponse(response);
    },

    deleteCustomer: async (consumerNumber: string) => {
        const response = await authFetch(`${API_BASE_URL}/customers/${encodeURIComponent(consumerNumber)}`, {
            method: "DELETE",
        });
        return checkResponse(response);
    },

    deduplicateCustomers: async () => {
        const response = await authFetch(`${API_BASE_URL}/customers/deduplicate`, {
            method: "POST",
        });
        return checkResponse(response);
    },

    importConsumers: async (file: File) => {
        const token = getToken();
        const formData = new FormData();
        formData.append("file", file);
        
        const headers: Record<string, string> = {};
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }
        
        const response = await fetch(`${API_BASE_URL}/import-consumers`, {
            method: "POST",
            headers,
            body: formData,
        });
        return checkResponse(response);
    },

    closeBrowser: async () => {
        const response = await authFetch(`${API_BASE_URL}/close`, {
            method: "POST",
        });
        return checkResponse(response);
    },
    
    uploadZeroGenReport: async () => {
        const response = await authFetch(`${API_BASE_URL}/drive/upload-zero-gen`, {
            method: 'POST'
        });
        return checkResponse(response);
    },
    getPortalCredentials: async () => {
        const response = await authFetch(`${API_BASE_URL}/portal-credentials`);
        return checkResponse(response);
    },
    savePortalCredential: async (username: string, password_hash: string, description?: string) => {
        const response = await authFetch(`${API_BASE_URL}/portal-credentials`, {
            method: "POST",
            body: JSON.stringify({ username, password: password_hash, description }),
        });
        return checkResponse(response);
    },
    deletePortalCredential: async (username: string) => {
        const response = await authFetch(`${API_BASE_URL}/portal-credentials/${encodeURIComponent(username)}`, {
            method: "DELETE",
        });
        return checkResponse(response);
    },

    // ── OTP & Forgot Password ──
    loginOtpRequest: async (identifier: string) => {
        const response = await fetch(`${API_BASE_URL}/auth/login-otp-request`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identifier }),
        });
        return checkResponse(response);
    },
    loginOtpVerify: async (identifier: string, otp: string) => {
        const response = await fetch(`${API_BASE_URL}/auth/login-otp-verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identifier, otp }),
        });
        const data = await checkResponse(response);
        if (data.token) {
            setToken(data.token);
            sessionStorage.setItem("arin_auth", "true");
            sessionStorage.setItem("arin_current_user", data.username);
            sessionStorage.setItem("arin_user_role", data.role || "operator");
        }
        return data;
    },
    forgotPasswordRequest: async (identifier: string) => {
        const response = await fetch(`${API_BASE_URL}/auth/forgot-password-request`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identifier }),
        });
        return checkResponse(response);
    },
    forgotPasswordReset: async (identifier: string, otp: string, newPassword: string) => {
        const response = await fetch(`${API_BASE_URL}/auth/forgot-password-reset`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identifier, otp, newPassword }),
        });
        return checkResponse(response);
    },

    // ── ADMIN USER CRUD ──
    getUsers: async () => {
        const response = await authFetch(`${API_BASE_URL}/admin/users`);
        return checkResponse(response);
    },
    createUser: async (userData: any) => {
        const response = await authFetch(`${API_BASE_URL}/admin/users`, {
            method: "POST",
            body: JSON.stringify(userData),
        });
        return checkResponse(response);
    },
    updateUser: async (userId: number, userData: any) => {
        const response = await authFetch(`${API_BASE_URL}/admin/users/${userId}`, {
            method: "PUT",
            body: JSON.stringify(userData),
        });
        return checkResponse(response);
    },
    deleteUser: async (userId: number) => {
        const response = await authFetch(`${API_BASE_URL}/admin/users/${userId}`, {
            method: "DELETE",
        });
        return checkResponse(response);
    }
};

// Export token utilities for use in ProtectedRoute
export { getToken, clearToken, isTokenExpired };
