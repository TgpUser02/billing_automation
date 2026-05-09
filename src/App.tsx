import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { api } from "@/lib/api";
import Index from "./pages/Index";
import ArinBillGenerator from "./pages/ArinBillGenerator";
import ConsumerConnect from "./pages/ConsumerConnect";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import { Layout } from "./components/Layout";
import { ProtectedLayout } from "./components/ProtectedRoute";
import Login from "./pages/Login";
const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    // Browser persistence logic
    console.log("Portal Initialized");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            <Route path="/" element={<ProtectedLayout><Dashboard /></ProtectedLayout>} />
            <Route path="/download" element={<ProtectedLayout><Index /></ProtectedLayout>} />
            <Route path="/bill-buddy" element={<ProtectedLayout><ArinBillGenerator /></ProtectedLayout>} />
            <Route path="/consumer-connect" element={<ProtectedLayout><ConsumerConnect /></ProtectedLayout>} />
            <Route path="/consumerconnect" element={<ProtectedLayout><ConsumerConnect /></ProtectedLayout>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<ProtectedLayout><NotFound /></ProtectedLayout>} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
