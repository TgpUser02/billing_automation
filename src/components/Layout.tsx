import { ReactNode, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LayoutProps {
    children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
        return localStorage.getItem("arin_sidebar_collapsed") === "true";
    });

    const toggleSidebar = () => {
        const newValue = !isSidebarCollapsed;
        setIsSidebarCollapsed(newValue);
        localStorage.setItem("arin_sidebar_collapsed", String(newValue));
    };

    return (
        <div className="flex bg-background min-h-screen overflow-x-hidden">
            <Sidebar isCollapsed={isSidebarCollapsed} onToggle={toggleSidebar} />
            <div className={cn(
                "flex-1 transition-all duration-300 relative min-w-0",
                isSidebarCollapsed ? "ml-0" : "ml-64"
            )}>
                {/* Floating toggle button when sidebar is collapsed */}
                {isSidebarCollapsed && (
                    <button
                        onClick={toggleSidebar}
                        className="fixed top-4 left-4 z-40 p-2.5 bg-sidebar hover:bg-sidebar-accent text-white rounded-xl shadow-lg border border-sidebar-border/20 flex items-center justify-center group"
                        title="Show Sidebar"
                    >
                        <Menu className="w-5 h-5 group-hover:scale-110 transition-transform text-white" />
                    </button>
                )}
                <div className={cn(isSidebarCollapsed && "pt-12 md:pt-0")}>
                    {children}
                </div>
            </div>
        </div>
    );
};
