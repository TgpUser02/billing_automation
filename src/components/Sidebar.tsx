import { FileText, Sun, Home, DownloadCloud, Database, Settings, Trash2, Key } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { clearToken, api } from '@/lib/api';

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [showSettings, setShowSettings] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [portalUsers, setPortalUsers] = useState<any[]>(() => {
    const saved = localStorage.getItem("arin_portal_users");
    return saved ? JSON.parse(saved) : [{ username: "admin", password: "Arin@2026" }];
  });
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState(""); // This is for 'Add User'
  
  // For 'Change Own Password'
  const [currentPassword, setCurrentPassword] = useState("");
  const [ownNewPassword, setOwnNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChanging, setIsChanging] = useState(false);

  const handleLogout = () => {
    clearToken();
    toast({ title: "Logged Out", description: "Session cleared successfully." });
    navigate("/login", { replace: true });
  };

  const handlePasswordChange = async () => {
    if (!currentPassword || !ownNewPassword || !confirmPassword) {
      toast({ title: "Error", description: "All fields are required", variant: "destructive" });
      return;
    }
    if (ownNewPassword !== confirmPassword) {
      toast({ title: "Error", description: "New passwords do not match", variant: "destructive" });
      return;
    }
    if (ownNewPassword.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }

    setIsChanging(true);
    try {
      await api.changePassword(currentPassword, ownNewPassword);
      toast({ title: "Success", description: "Password changed successfully." });
      setShowChangePassword(false);
      setCurrentPassword("");
      setOwnNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      toast({ 
        title: "Change Failed", 
        description: error.message || "Failed to update password", 
        variant: "destructive" 
      });
    } finally {
      setIsChanging(false);
    }
  };

  const handleAddUser = () => {
    if (!newUsername.trim() || !newPassword.trim()) {
      toast({ title: "Error", description: "Username and password cannot be empty", variant: "destructive" });
      return;
    }
    if (portalUsers.find(u => u.username.toLowerCase() === newUsername.trim().toLowerCase())) {
      toast({ title: "Error", description: "Username already exists", variant: "destructive" });
      return;
    }
    const updatedUsers = [...portalUsers, { username: newUsername.trim(), password: newPassword.trim() }];
    setPortalUsers(updatedUsers);
    localStorage.setItem("arin_portal_users", JSON.stringify(updatedUsers));
    setNewUsername("");
    setNewPassword("");
    toast({ title: "Success", description: `Added login access for ${newUsername.trim()}` });
  };

  const handleRemoveUser = (usernameToRemove: string) => {
    if (portalUsers.length <= 1) {
      toast({ title: "Error", description: "System must have at least one valid user", variant: "destructive" });
      return;
    }
    const updatedUsers = portalUsers.filter(u => u.username !== usernameToRemove);
    setPortalUsers(updatedUsers);
    localStorage.setItem("arin_portal_users", JSON.stringify(updatedUsers));
  };

  const navItems = [
    { icon: Home, label: 'Dashboard', path: '/' },
    { icon: DownloadCloud, label: 'Auto Downloader', path: '/download' },
    { icon: FileText, label: 'Bill Analysis Generation', path: '/bill-buddy' },
    { icon: Database, label: 'Consumer Connect', path: '/consumer-connect' },
  ];

  return (
    <>
    <aside className="w-64 min-h-screen bg-sidebar flex flex-col fixed left-0 top-0 bottom-0 z-50 shadow-2xl transition-all duration-300">
      {/* Logo Header */}
      <div className="p-6 border-b border-sidebar-border/20 bg-sidebar-accent/10">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shadow-lg shadow-arin-green/20 overflow-hidden p-1">
            <img src="/arin_logo.jpg" alt="Arin Energy Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-white font-bold text-lg leading-tight tracking-tight">Arin Energy</h1>
            <p className="text-sidebar-foreground text-[10px] font-medium opacity-70 uppercase tracking-widest">Billing Automation</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 flex flex-col gap-2 mt-4">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative overflow-hidden",
                isActive
                  ? "bg-gradient-to-r from-arin-green to-arin-teal text-white shadow-md font-semibold"
                  : "text-sidebar-foreground hover:bg-white/10 hover:text-white"
              )}
            >
              <item.icon className={cn("w-5 h-5", isActive ? "animate-pulse" : "group-hover:scale-110 transition-transform")} />
              <span className="flex-1 z-10">{item.label}</span>
              {isActive && (
                <div className="absolute inset-0 bg-white/10 mix-blend-overlay" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border/20 bg-black/20 backdrop-blur-sm">
        <div className="flex flex-col gap-2 mb-4">
          <div className="flex gap-2">
            <button
              onClick={() => setShowSettings(true)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-slate-300 hover:bg-white/10 transition-colors font-bold text-sm tracking-wide bg-white/5"
              title="Manage Users"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowChangePassword(true)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-slate-300 hover:bg-white/10 transition-colors font-bold text-sm tracking-wide bg-white/5"
              title="Change Password"
            >
              <Key className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors font-bold text-sm tracking-wide bg-red-400/5"
          >
            Logout
          </button>
        </div>
        <div className="flex items-center justify-between text-xs text-sidebar-foreground opacity-60 mb-2">
          <span>System Status</span>
          <span className="flex items-center gap-1.5 text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Online
          </span>
        </div>
        <p className="text-sidebar-foreground/40 text-[10px] text-center font-mono">
          v2.5.0 • Arin Automation
        </p>
      </div>
    </aside>

    {/* Change Password Dialog */}
    <Dialog open={showChangePassword} onOpenChange={setShowChangePassword}>
      <DialogContent className="glass-card shadow-2xl border-white/20 sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-arin-teal to-arin-green flex items-center gap-2">
            <Key className="w-5 h-5 text-arin-teal" /> Change Your Password
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          <div className="flex flex-col gap-3">
             <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Current Password</label>
             <Input 
               type="password"
               placeholder="Current Password"
               value={currentPassword} 
               onChange={e => setCurrentPassword(e.target.value)} 
               className="bg-white h-12 border-slate-200 rounded-xl text-sm" 
             />
             
             <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">New Password</label>
             <Input 
               type="password"
               placeholder="New Password (min 6 chars)"
               value={ownNewPassword} 
               onChange={e => setOwnNewPassword(e.target.value)} 
               className="bg-white h-12 border-slate-200 rounded-xl text-sm" 
             />
             
             <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Confirm New Password</label>
             <Input 
               type="password"
               placeholder="Confirm New Password"
               value={confirmPassword} 
               onChange={e => setConfirmPassword(e.target.value)} 
               className="bg-white h-12 border-slate-200 rounded-xl text-sm" 
             />
             
             <Button 
               onClick={handlePasswordChange} 
               disabled={isChanging}
               className="w-full h-12 bg-gradient-to-r from-arin-green to-arin-teal hover:opacity-90 text-white font-black rounded-xl shadow-lg shadow-arin-green/20 text-sm mt-2"
             >
               {isChanging ? "Updating..." : "Update Password"}
             </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={showSettings} onOpenChange={setShowSettings}>
      <DialogContent className="glass-card shadow-2xl border-white/20 sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-arin-teal to-arin-green flex items-center gap-2">
            <Settings className="w-5 h-5 text-arin-teal" /> Manage Portal Users
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
             <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Add New User</h3>
             <div className="flex flex-col gap-3">
                <Input 
                  placeholder="Username"
                  value={newUsername} 
                  onChange={e => setNewUsername(e.target.value)} 
                  className="bg-white h-10 border-slate-200 rounded-lg text-sm" 
                />
                <Input 
                  type="text"
                  placeholder="Password"
                  value={newPassword} 
                  onChange={e => setNewPassword(e.target.value)} 
                  className="bg-white h-10 border-slate-200 rounded-lg text-sm" 
                />
                <Button 
                  onClick={handleAddUser} 
                  className="w-full h-10 bg-gradient-to-r from-arin-green to-arin-teal hover:opacity-90 text-white font-bold rounded-lg shadow-sm text-sm"
                >
                  Create User Login
                </Button>
             </div>
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 sticky top-0 bg-white py-1">Active Accounts</h3>
            {portalUsers.map((u, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-white shadow-sm">
                <div className="flex flex-col">
                  <span className="text-sm font-black text-slate-800">{u.username}</span>
                  <span className="text-[10px] font-mono text-slate-400">••••••••</span>
                </div>
                <button 
                  onClick={() => handleRemoveUser(u.username)}
                  className="p-2 rounded-md hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
