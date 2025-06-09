import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

function SessionManagement() {
  const [members, setMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState('');
  const [individualSessions, setIndividualSessions] = useState(0);
  const [duoSessions, setDuoSessions] = useState(0);
  const [collectiveSessions, setCollectiveSessions] = useState(0);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [history, setHistory] = useState([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    const { data, error } = await supabase.from('members').select('id, first_name, last_name, email');
    if (error) {
      console.error('Erreur lors de la récupération des adhérents:', error);
    } else {
      setMembers(data);
    }
  };

  const fetchSessionBalance = async (memberId) => {
    if (!memberId) return;
    try {
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select('sale_type, quantity, created_at, is_credit')
        .eq('member_id', memberId)
        .order('created_at', { ascending: false });

      if (salesError) throw salesError;

      const { data: usageData, error: usageError } = await supabase
        .from('session_usage')
        .select('sale_type, used_at')
        .eq('member_id', memberId)
        .order('used_at', { ascending: false });

      if (usageError) throw usageError;

      let individual = 0;
      let duo = 0;
      let collective = 0;

      salesData.forEach(sale => {
        if (!sale.is_credit) {
          if (sale.sale_type === 'individual') individual += sale.quantity;
          else if (sale.sale_type === 'duo') duo += sale.quantity;
          else if (sale.sale_type === 'collective') collective += sale.quantity;
        } else {
          if (sale.sale_type === 'individual') individual += sale.quantity;
          else if (sale.sale_type === 'duo') duo += sale.quantity;
          else if (sale.sale_type === 'collective') collective += sale.quantity;
        }
      });

      usageData.forEach(usage => {
        if (usage.sale_type === 'individual') individual -= 1;
        else if (usage.sale_type === 'duo') duo -= 1;
        else if (usage.sale_type === 'collective') collective -= 1;
      });

      setIndividualSessions(Math.max(0, individual));
      setDuoSessions(Math.max(0, duo));
      setCollectiveSessions(Math.max(0, collective));

      const salesHistory = salesData.map(sale => ({
        type: sale.sale_type,
        quantity: sale.quantity,
        date: new Date(sale.created_at).toLocaleString('fr-FR'),
        action: 'Vente',
      }));
      const usageHistory = usageData.map(usage => ({
        type: usage.sale_type,
        quantity: -1,
        date: new Date(usage.used_at).toLocaleString('fr-FR'),
        action: 'Utilisation',
      }));
      const combinedHistory = [...salesHistory, ...usageHistory].sort((a, b) => new Date(b.date) - new Date(a.date));
      setHistory(combinedHistory);
    } catch (err) {
      setError('Erreur lors du calcul des soldes ou de l\'historique: ' + err.message);
    }
  };

  const handleMemberChange = (e) => {
    const memberId = e.target.value;
    setSelectedMember(memberId);
    setShowAll(false);
    fetchSessionBalance(memberId);
  };

  const deductSession = async (type) => {
    if (!selectedMember) {
      setError('Veuillez sélectionner un adhérent.');
      return;
    }

    let sessions = 0;
    switch (type) {
      case 'individual':
        if (individualSessions <= 0) {
          setError('Aucune séance individuelle restante.');
          return;
        }
        sessions = individualSessions - 1;
        setIndividualSessions(sessions);
        break;
      case 'duo':
        if (duoSessions <= 0) {
          setError('Aucune séance duo restante.');
          return;
        }
        sessions = duoSessions - 1;
        setDuoSessions(sessions);
        break;
      case 'collective':
        if (collectiveSessions <= 0) {
          setError('Aucune séance collective restante.');
          return;
        }
        sessions = collectiveSessions - 1;
        setCollectiveSessions(sessions);
        break;
      default:
        return;
    }

    try {
      const { error } = await supabase
        .from('session_usage')
        .insert({
          member_id: selectedMember,
          sale_type: type,
          quantity: -1,
        });
      if (error) throw error;

      fetchSessionBalance(selectedMember);
      setSuccess('Séance débitée avec succès !');
      setError(null);
    } catch (err) {
      setError('Erreur lors du débit de la séance: ' + err.message);
      switch (type) {
        case 'individual': setIndividualSessions(individualSessions); break;
        case 'duo': setDuoSessions(duoSessions); break;
        case 'collective': setCollectiveSessions(collectiveSessions); break;
      }
    }
  };

  return (
    <div className="p-6 bg-gray-900 text-white min-h-screen">
      <h2 className="text-xl font-semibold mb-4 text-yellow-500 border-b-2 border-yellow-500 pb-1">Gestion des Séances</h2>
      {error && <p className="text-yellow-500 mb-4">{error}</p>}
      {success && <p className="text-yellow-500 mb-4">{success}</p>}
      <div className="mb-4">
        <label className="block text-white">Sélectionner un adhérent</label>
        <select
          className="w-full p-2 border rounded-lg bg-gray-700 text-white border-gray-600"
          value={selectedMember}
          onChange={handleMemberChange}
        >
          <option value="">Sélectionner un adhérent</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {`${member.first_name} ${member.last_name} (${member.email})`}
            </option>
          ))}
        </select>
      </div>
      {selectedMember && (
        <div className="space-y-4">
          <div className="p-4 bg-gray-800 rounded-lg shadow-md">
            <p>Séances individuelles restantes : {individualSessions}</p>
            {individualSessions <= 3 && individualSessions > 0 && (
              <p className="text-yellow-500">Attention : Solde bas (≤ 3 séances).</p>
            )}
            {individualSessions === 0 && (
              <p className="text-yellow-500">Aucune séance individuelle restante.</p>
            )}
            <button
              onClick={() => deductSession('individual')}
              className="mt-2 bg-gradient-to-r from-yellow-500 to-yellow-300 text-white p-2 rounded-lg hover:from-yellow-600 hover:to-yellow-400 transition"
              disabled={individualSessions <= 0}
            >
              Utiliser séance individuelle
            </button>
          </div>
          <div className="p-4 bg-gray-800 rounded-lg shadow-md">
            <p>Séances duo restantes : {duoSessions}</p>
            {duoSessions <= 3 && duoSessions > 0 && (
              <p className="text-yellow-500">Attention : Solde bas (≤ 3 séances).</p>
            )}
            {duoSessions === 0 && (
              <p className="text-yellow-500">Aucune séance duo restante.</p>
            )}
            <button
              onClick={() => deductSession('duo')}
              className="mt-2 bg-gradient-to-r from-yellow-500 to-yellow-300 text-white p-2 rounded-lg hover:from-yellow-600 hover:to-yellow-400 transition"
              disabled={duoSessions <= 0}
            >
              Utiliser séance duo
            </button>
          </div>
          <div className="p-4 bg-gray-800 rounded-lg shadow-md">
            <p>Séances collectives restantes : {collectiveSessions}</p>
            {collectiveSessions <= 3 && collectiveSessions > 0 && (
              <p className="text-yellow-500">Attention : Solde bas (≤ 3 séances).</p>
            )}
            {collectiveSessions === 0 && (
              <p className="text-yellow-500">Aucune séance collective restante.</p>
            )}
            <button
              onClick={() => deductSession('collective')}
              className="mt-2 bg-gradient-to-r from-yellow-500 to-yellow-300 text-white p-2 rounded-lg hover:from-yellow-600 hover:to-yellow-400 transition"
              disabled={collectiveSessions <= 0}
            >
              Utiliser séance collective
            </button>
          </div>
          <div className="mt-6 p-4 bg-gray-800 rounded-lg shadow-md">
            <div className="flex items-center mb-2">
              <label className="text-white mr-2">Afficher tout</label>
              <input
                type="checkbox"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
                className="mr-2"
              />
            </div>
            <h3 className="text-lg font-semibold mb-2 text-yellow-500 border-b border-yellow-500 pb-1">Historique</h3>
            {history.length > 0 ? (
              <ul className="list-disc pl-5">
                {history
                  .slice(0, showAll ? history.length : 10)
                  .map((entry, index) => (
                    <li key={index}>
                      {entry.action}: {entry.type} - Quantité: {entry.quantity} - Date: {entry.date}
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-yellow-500">Aucun historique disponible.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SessionManagement;