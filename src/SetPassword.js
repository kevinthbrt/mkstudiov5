import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';

function SetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        setError('Aucune session d\'authentification trouvée. Veuillez vérifier le lien.');
        console.log('Erreur session:', sessionError);
        return;
      }
      console.log('Session trouvée:', session);
    };
    checkSession();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    try {
      const { data, error: authError } = await supabase.auth.updateUser({
        password: password,
      });

      if (authError) throw authError;

      const { error: updateError } = await supabase.from('members').update({
        id: data.user.id,
      }).eq('email', data.user.email);

      if (updateError) throw updateError;

      setSuccess("Mot de passe défini avec succès ! Vous allez être redirigé.");
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.message || "Erreur lors de la définition du mot de passe. Contactez un administrateur.");
      console.error('Erreur détaillée:', err);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="p-8 bg-gray-800 shadow-lg rounded-lg w-full max-w-md">
        <h1 className="text-2xl font-bold text-yellow-500 border-b-2 border-yellow-500 pb-2 text-center mb-4">Définir votre mot de passe</h1>
        <p className="text-white text-center mb-6">Bienvenue chez MK Studio ! Choisissez votre mot de passe.</p>
        {error && <p className="text-yellow-500 text-center mb-4">{error}</p>}
        {success && <p className="text-yellow-500 text-center mb-4">{success}</p>}
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
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
          <div className="mb-6">
            <label className="block text-white mb-2" htmlFor="confirmPassword">
              Confirmer le mot de passe
            </label>
            <input
              type="password"
              id="confirmPassword"
              className="w-full p-2 border rounded-lg bg-gray-700 text-white border-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-gradient-to-r from-yellow-500 to-yellow-300 text-white p-2 rounded-lg hover:from-yellow-600 hover:to-yellow-400 transition"
          >
            Définir le mot de passe
          </button>
        </form>
      </div>
    </div>
  );
}

export default SetPassword;