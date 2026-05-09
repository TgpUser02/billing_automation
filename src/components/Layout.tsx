import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';

interface LayoutProps {
    children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
    return (
        <div className="flex bg-background min-h-screen">
            <Sidebar />
            <div className="flex-1 ml-64 transition-all duration-300 relative">
                {children}
            </div>
        </div>
    );
};
