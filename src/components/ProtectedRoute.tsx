import { useEffect, useRef, useCallback } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Layout } from "./Layout";
import { isTokenExpired, clearToken, getToken } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

export const ProtectedLayout = ({ children }: { children: React.ReactNode }) => {
    const navigate = useNavigate();
    const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const handleLogout = useCallback(() => {
        clearToken();
        toast({
            title: "Session Expired",
            description: "You have been logged out. Please login again.",
            variant: "destructive",
        });
        navigate("/login", { replace: true });
    }, [navigate]);

    // Check for token expiry every 30 seconds and attempt silent refresh
    useEffect(() => {
        const checkAuth = async () => {
            if (isTokenExpired()) {
                handleLogout();
            }
        };

        // Initial check
        checkAuth();

        // Setup interval
        checkIntervalRef.current = setInterval(checkAuth, 30000);

        return () => {
            if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
        };
    }, [handleLogout]);

    const isAuthed = !isTokenExpired();
    const hasToken = !!getToken();
    
    // Guard: If not authenticated, redirect to login
    if (!isAuthed || !hasToken) {
        return <Navigate to="/login" replace />;
    }

    return <Layout>{children}</Layout>;
};
