import React from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import Login from './Login';
import Admin from './Admin';
import MemberDashboard from './MemberDashboard';
import SetPassword from './SetPassword';
import { supabase } from './supabaseClient';

function AppContent() {
  const { session } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      console.log('Déconnexion réussie');
      navigate('/login');
    } catch (err) {
      console.error('Erreur lors de la déconnexion:', err.message);
    }
  };

  return (
    <div className="p-8 bg-gray-900 text-white min-h-screen">
      {session && (
        <div className="flex justify-between items-center mb-4 bg-gray-900 text-yellow-600">
          <h1 className="text-2xl font-bold">MK Studio</h1>
          <button
            onClick={handleLogout}
            className="bg-red-500 text-white p-2 rounded-lg hover:bg-red-600 transition"
          >
            Se déconnecter
          </button>
        </div>
      )}
      
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/admin/*" element={<Admin />} />
        <Route path="/member" element={<MemberDashboard />} />
        <Route path="/set-password" element={<SetPassword />} />
        <Route path="/" element={session ? <Navigate to={session.user.user_metadata?.role === 'admin' ? '/admin' : '/member'} /> : <Navigate to="/login" />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;