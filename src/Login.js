import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { session } = useAuth();

  useEffect(() => {
    if (session) {
      const role = session.user.user_metadata?.role;
      if (role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/member');
      }
    }
  }, [session, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      console.log('Connexion réussie:', data);
    } catch (err) {
      setError(err.message);
      console.error('Erreur de connexion:', err.message);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="p-8 bg-gray-800 shadow-lg rounded-lg w-full max-w-md">
        <h1 className="text-2xl font-bold text-yellow-500 border-b-2 border-yellow-500 pb-2 text-center mb-4">Bienvenue chez MK Studio</h1>
        <p className="text-white text-center mb-6">Identifiez-vous !</p>
        {error && <p className="text-yellow-500 text-center mb-4">{error}</p>}
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-white mb-2" htmlFor="email">
              Email
            </label>
            <input
              type="email"
              id="email"
              className="w-full p-2 border rounded-lg bg-gray-700 text-white border-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="mb-6">
            <label className="block text-white mb-2" htmlFor="password">
              Mot de passe
            </label>
            <input
              type="password"
              id="password"
              className="w-full p-2 border rounded-lg bg-gray-700 text-white border-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-gradient-to-r from-yellow-500 to-yellow-300 text-white p-2 rounded-lg hover:from-yellow-600 hover:to-yellow-400 transition"
          >
            Se connecter
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;