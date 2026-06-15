import { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Users, UserPlus, Edit3, Trash2, Shield, Lock, Mail, ShieldAlert, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from "@/components/ui/button";
import { toast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { confirmAction } from '@/lib/swal';
import { Switch } from "@/components/ui/switch";

export default function UserManagement() {
  const navigate = useNavigate();
  const userRole = sessionStorage.getItem("arin_user_role");
  const currentUsername = sessionStorage.getItem("arin_current_user") || "";

  // Guard: Only admins can view this page
  if (userRole !== "admin") {
    return <Navigate to="/" replace />;
  }

  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Create User States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createUsername, setCreateUsername] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState("operator");
  const [isCreating, setIsCreating] = useState(false);

  // Edit User States
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState("operator");
  const [editIsActive, setEditIsActive] = useState(true);
  const [editPassword, setEditPassword] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await api.getUsers();
      if (res.status === "success" && res.data) {
        setUsers(res.data);
      }
    } catch (err: any) {
      console.error("Failed to load users:", err);
      toast({
        title: "Error loading users",
        description: err.message || "Could not retrieve user list.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createUsername.trim() || !createPassword.trim()) {
      toast({
        title: "Validation Error",
        description: "Username and Password are required.",
        variant: "destructive",
      });
      return;
    }
    if (createPassword.length < 6) {
      toast({
        title: "Validation Error",
        description: "Password must be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    try {
      const res = await api.createUser({
        username: createUsername.trim(),
        email: createEmail.trim() || undefined,
        password: createPassword,
        role: createRole,
      });

      if (res.status === "success") {
        toast({
          title: "User Created",
          description: `Successfully created user "${createUsername}".`,
        });
        setShowCreateModal(false);
        setCreateUsername("");
        setCreateEmail("");
        setCreatePassword("");
        setCreateRole("operator");
        fetchUsers();
      }
    } catch (err: any) {
      toast({
        title: "Creation Failed",
        description: err.message || "Failed to create user.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const openEditModal = (user: any) => {
    setSelectedUser(user);
    setEditEmail(user.email || "");
    setEditRole(user.role || "operator");
    setEditIsActive(u => {
      // In SQLite/MySQL, status is usually 1/0 or true/false
      return user.is_active === 1 || user.is_active === true || user.is_active === "1";
    });
    setEditPassword("");
    setShowEditModal(true);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    if (editPassword && editPassword.length < 6) {
      toast({
        title: "Validation Error",
        description: "New password must be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }

    setIsUpdating(true);
    try {
      const res = await api.updateUser(selectedUser.id, {
        email: editEmail.trim(),
        role: editRole,
        is_active: editIsActive,
        password: editPassword.trim() || undefined,
      });

      if (res.status === "success") {
        toast({
          title: "User Updated",
          description: `Successfully updated user "${selectedUser.username}".`,
        });
        setShowEditModal(false);
        setSelectedUser(null);
        fetchUsers();
      }
    } catch (err: any) {
      toast({
        title: "Update Failed",
        description: err.message || "Failed to update user.",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteUser = async (user: any) => {
    if (user.username === "admin") {
      toast({
        title: "Restricted Action",
        description: "The primary admin account cannot be deleted.",
        variant: "destructive",
      });
      return;
    }
    if (user.username === currentUsername) {
      toast({
        title: "Restricted Action",
        description: "You cannot delete your own logged-in account.",
        variant: "destructive",
      });
      return;
    }

    const confirm = await confirmAction({
      title: "Delete User Account?",
      text: `Are you sure you want to permanently delete user "${user.username}"? This action is irreversible.`,
      icon: "warning",
      confirmButtonText: "Yes, Delete Account",
      cancelButtonText: "Cancel",
    });

    if (!confirm) return;

    try {
      const res = await api.deleteUser(user.id);
      if (res.status === "success") {
        toast({
          title: "User Deleted",
          description: `User "${user.username}" deleted successfully.`,
        });
        fetchUsers();
      }
    } catch (err: any) {
      toast({
        title: "Deletion Failed",
        description: err.message || "Failed to delete user.",
        variant: "destructive",
      });
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-transparent p-4 lg:p-8 text-slate-800">
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-arin-teal rounded-2xl shadow-lg shadow-arin-teal/20">
              <Users className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-arin-orange to-arin-teal">
                System User Management
              </h1>
              <p className="text-slate-500 font-bold text-xs uppercase tracking-widest mt-1">Admin User Control Console</p>
            </div>
          </div>

          <Button
            onClick={() => setShowCreateModal(true)}
            className="h-11 bg-gradient-to-r from-arin-green to-arin-teal hover:opacity-90 font-black rounded-xl uppercase tracking-wider text-xs gap-2 animate-in fade-in"
          >
            <UserPlus className="w-4 h-4" /> Add System User
          </Button>
        </div>

        {/* User Statistics / Info Alert */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Total Accounts</span>
            <h3 className="text-3xl font-black mt-1 text-slate-800">{users.length}</h3>
          </div>
          <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Administrators</span>
            <h3 className="text-3xl font-black mt-1 text-arin-teal">{users.filter(u => u.role === 'admin').length}</h3>
          </div>
          <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Operators</span>
            <h3 className="text-3xl font-black mt-1 text-arin-green">{users.filter(u => u.role === 'operator').length}</h3>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="mb-6 flex gap-4">
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Search by username or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-11 px-4 bg-white border border-slate-200 text-slate-800 rounded-xl placeholder:text-slate-400 focus:outline-none focus:border-arin-teal focus:ring-1 focus:ring-arin-teal/50 transition-all font-medium"
            />
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xl">
          {isLoading ? (
            <div className="p-12 text-center text-slate-500 font-medium">
              <svg className="animate-spin h-8 w-8 text-arin-teal mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Fetching system users...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-12 text-center text-slate-500 font-medium">
              No system users found matching your search.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Username</th>
                    <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Email Address</th>
                    <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">System Role</th>
                    <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Account Status</th>
                    <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Created At</th>
                    <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((u) => {
                    const isActive = u.is_active === 1 || u.is_active === true || u.is_active === "1";
                    return (
                      <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 font-bold text-slate-800">{u.username}</td>
                        <td className="p-4 text-slate-600 font-medium">{u.email || <span className="text-slate-400 italic">Not configured</span>}</td>
                        <td className="p-4">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            u.role === "admin" 
                              ? "bg-arin-teal/10 text-arin-teal border border-arin-teal/20" 
                              : "bg-arin-green/10 text-arin-green border border-arin-green/20"
                          }`}>
                            <Shield className="w-3 h-3" /> {u.role}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            isActive 
                              ? "bg-green-500/10 text-green-600 border border-green-500/20" 
                              : "bg-red-500/10 text-red-650 border border-red-500/20"
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-red-500'}`} />
                            {isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="p-4 text-slate-500 text-xs font-medium">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          }) : "N/A"}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => openEditModal(u)}
                              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-all"
                              title="Edit User"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u)}
                              disabled={u.username === "admin" || u.username === currentUsername}
                              className="p-2 bg-red-550/10 hover:bg-red-550/20 text-red-650 border border-red-200/50 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Delete User"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* CREATE USER DIALOG */}
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogContent className="bg-white border border-slate-200 text-slate-800 sm:max-w-md rounded-2xl shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-arin-teal to-arin-green flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-arin-teal" /> Create System User
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleCreateUser} className="space-y-4 pt-4">
              <div className="space-y-3">
                {/* Username */}
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">
                    Username (Unique)
                  </label>
                  <input
                    type="text"
                    placeholder="Enter unique username"
                    value={createUsername}
                    onChange={(e) => setCreateUsername(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
                    className="w-full h-11 px-4 bg-slate-50 border border-slate-200 text-slate-800 rounded-xl focus:outline-none focus:border-arin-teal focus:ring-1 focus:ring-arin-teal/50 transition-all font-medium placeholder:text-slate-400"
                    required
                    disabled={isCreating}
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">
                    Email Address (For OTP login & recovery)
                  </label>
                  <input
                    type="email"
                    placeholder="Enter user email address"
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    className="w-full h-11 px-4 bg-slate-50 border border-slate-200 text-slate-800 rounded-xl focus:outline-none focus:border-arin-teal focus:ring-1 focus:ring-arin-teal/50 transition-all font-medium placeholder:text-slate-400"
                    disabled={isCreating}
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">
                    Initial Password (Min 6 chars)
                  </label>
                  <input
                    type="password"
                    placeholder="Enter password"
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    className="w-full h-11 px-4 bg-slate-50 border border-slate-200 text-slate-800 rounded-xl focus:outline-none focus:border-arin-teal focus:ring-1 focus:ring-arin-teal/50 transition-all font-medium placeholder:text-slate-400"
                    required
                    disabled={isCreating}
                  />
                </div>

                {/* Role */}
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">
                    System Access Role
                  </label>
                  <select
                    value={createRole}
                    onChange={(e) => setCreateRole(e.target.value)}
                    className="w-full h-11 px-3 bg-slate-50 border border-slate-200 text-slate-800 rounded-xl text-sm focus:outline-none focus:border-arin-teal"
                    disabled={isCreating}
                  >
                    <option value="operator" className="bg-white text-slate-800">Operator (Standard Access)</option>
                    <option value="admin" className="bg-white text-slate-800">Administrator (Full Access)</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 h-11 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-bold rounded-xl"
                  disabled={isCreating}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 h-11 bg-gradient-to-r from-arin-green to-arin-teal hover:opacity-90 text-white font-black rounded-xl uppercase tracking-wider text-xs"
                  disabled={isCreating}
                >
                  {isCreating ? "Creating..." : "Create Account"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* EDIT USER DIALOG */}
        <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
          <DialogContent className="bg-white border border-slate-200 text-slate-800 sm:max-w-md rounded-2xl shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-arin-teal to-arin-green flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-arin-teal" /> Update User Account
              </DialogTitle>
            </DialogHeader>

            {selectedUser && (
              <form onSubmit={handleUpdateUser} className="space-y-4 pt-4">
                <div className="space-y-3">
                  {/* Read-Only Username */}
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">
                      Username (Non-editable)
                    </label>
                    <div className="h-11 px-4 flex items-center bg-slate-50 border border-slate-100 text-slate-500 rounded-xl mt-1 font-bold text-sm">
                      {selectedUser.username}
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">
                      Email Address
                    </label>
                    <input
                      type="email"
                      placeholder="Enter user email address"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="w-full h-11 px-4 bg-slate-50 border border-slate-200 text-slate-800 rounded-xl focus:outline-none focus:border-arin-teal focus:ring-1 focus:ring-arin-teal/50 transition-all font-medium placeholder:text-slate-400"
                      disabled={isUpdating}
                    />
                  </div>

                  {/* New Password Option */}
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">
                      Change Password (Leave blank to keep current)
                    </label>
                    <input
                      type="password"
                      placeholder="Enter new password (optional)"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      className="w-full h-11 px-4 bg-slate-50 border border-slate-200 text-slate-800 rounded-xl focus:outline-none focus:border-arin-teal focus:ring-1 focus:ring-arin-teal/50 transition-all font-medium placeholder:text-slate-400"
                      disabled={isUpdating}
                    />
                  </div>

                  {/* Role */}
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">
                      System Access Role
                    </label>
                    <select
                      value={editRole}
                      disabled={selectedUser.username === "admin" || isUpdating}
                      onChange={(e) => setEditRole(e.target.value)}
                      className="w-full h-11 px-3 bg-slate-50 border border-slate-200 text-slate-800 rounded-xl text-sm focus:outline-none focus:border-arin-teal disabled:opacity-40"
                    >
                      <option value="operator" className="bg-white text-slate-800">Operator (Standard Access)</option>
                      <option value="admin" className="bg-white text-slate-800">Administrator (Full Access)</option>
                    </select>
                    {selectedUser.username === "admin" && (
                      <p className="text-[10px] text-slate-500 italic mt-1.5 flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        Cannot modify role for the primary system admin.
                      </p>
                    )}
                  </div>

                  {/* Account Status Switch */}
                  <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl mt-4">
                    <div className="space-y-0.5">
                      <label className="text-xs font-black text-slate-800 uppercase tracking-wider block">
                        Account Active
                      </label>
                      <span className="text-[10px] text-slate-550 font-medium">
                        Controls if this user is allowed to log in
                      </span>
                    </div>

                    <Switch
                      checked={editIsActive}
                      disabled={selectedUser.username === "admin" || selectedUser.username === currentUsername || isUpdating}
                      onCheckedChange={setEditIsActive}
                    />
                  </div>
                  {(selectedUser.username === "admin" || selectedUser.username === currentUsername) && (
                    <p className="text-[9px] text-red-500 italic mt-1 px-1 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      Deactivation disabled for primary admin or currently active accounts.
                    </p>
                  )}
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="flex-1 h-11 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-bold rounded-xl"
                    disabled={isUpdating}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 h-11 bg-gradient-to-r from-arin-green to-arin-teal hover:opacity-90 text-white font-black rounded-xl uppercase tracking-wider text-xs"
                    disabled={isUpdating}
                  >
                    {isUpdating ? "Updating..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
