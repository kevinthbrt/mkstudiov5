import React, { useState, useEffect } from 'react';
import { supabase, supabaseAdmin } from './supabaseClient';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import CollectiveCourses from './CollectiveCourses';

function Admin() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [members, setMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState('');
  const [saleType, setSaleType] = useState('individual');
  const [quantity, setQuantity] = useState(1);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [familyDiscount, setFamilyDiscount] = useState(false);
  const [creditSessions, setCreditSessions] = useState(0);
  const [sales, setSales] = useState([]);
  const [searchName, setSearchName] = useState('');
  const [searchMember, setSearchMember] = useState('');
  const [memberBalance, setMemberBalance] = useState({ individualSessions: 0, duoSessions: 0, collectiveSessions: 0 });
  const [memberHistory, setMemberHistory] = useState([]);

  useEffect(() => {
    fetchMembers();
    fetchSales();
  }, []);

  const fetchMembers = async () => {
    const { data, error } = await supabase.from('members').select('id, first_name, last_name, email');
    if (error) {
      console.error('Erreur lors de la récupération des adhérents:', error);
    } else {
      setMembers(data);
    }
  };

  const fetchSales = async () => {
    const { data, error } = await supabase
      .from('sales')
      .select('*, members(id, first_name, last_name, email), invoices(*)')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Erreur lors de la récupération des ventes:', error);
    } else {
      setSales(data);
    }
  };

  const fetchSessionBalance = async (memberId) => {
    try {
      console.log('Récupération du solde des séances pour memberId:', memberId);
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select('sale_type, quantity, created_at, is_credit')
        .eq('member_id', memberId)
        .order('created_at', { ascending: false });

      if (salesError) throw salesError;

      const { data: usageData, error: usageError } = await supabase
        .from('session_usage')
        .select('sale_type, sale_id, used_at, is_canceled')
        .eq('member_id', memberId)
        .eq('is_canceled', false);
      if (usageError) throw usageError;

      console.log('Usage data for balance:', usageData);

      let individual = 0, duo = 0, collective = 0;
      salesData.forEach(sale => {
        const qty = sale.quantity || 0;
        if (!sale.is_credit) {
          if (sale.sale_type === 'individual') individual += qty;
          else if (sale.sale_type === 'duo') duo += qty;
          else if (sale.sale_type === 'collective') collective += qty;
        } else {
          if (sale.sale_type === 'individual') individual += qty;
          else if (sale.sale_type === 'duo') duo += qty;
          else if (sale.sale_type === 'collective') collective += qty;
        }
      });

      const usageCount = usageData.reduce((acc, usage) => {
        if (usage.sale_type === 'individual') acc.individual += 1;
        else if (usage.sale_type === 'duo') acc.duo += 1;
        else if (usage.sale_type === 'collective') acc.collective += 1;
        return acc;
      }, { individual: 0, duo: 0, collective: 0 });

      setMemberBalance({
        individualSessions: Math.max(0, individual - usageCount.individual),
        duoSessions: Math.max(0, duo - usageCount.duo),
        collectiveSessions: Math.max(0, collective - usageCount.collective),
      });

      const { data: allUsageData, error: allUsageError } = await supabase
        .from('session_usage')
        .select('sale_type, sale_id, used_at, is_canceled')
        .eq('member_id', memberId);
      if (allUsageError) throw allUsageError;

      const salesHistory = salesData.map(sale => ({
        type: sale.sale_type || 'inconnu',
        quantity: sale.quantity || 0,
        date: new Date(sale.created_at).toLocaleString('fr-FR'),
        action: 'Vente',
      }));
      const usageHistory = allUsageData.map(usage => ({
        type: usage.sale_type || 'inconnu',
        quantity: 1,
        date: new Date(usage.used_at).toLocaleString('fr-FR'),
        action: usage.is_canceled ? 'Annulation' : 'Utilisation',
      }));
      setMemberHistory([...salesHistory, ...usageHistory].sort((a, b) => new Date(b.date) - new Date(a.date)));
    } catch (err) {
      console.error('Error in fetchSessionBalance:', err);
      setError('Erreur lors du calcul des soldes: ' + (err.message || 'Erreur inconnue'));
    }
  };

  const handleCreateMember = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      console.log('Vérification de l\'email:', email);
      const { data: existingUsers, error: userError } = await supabaseAdmin.auth.admin.listUsers();
      if (userError) throw userError;

      const userExists = existingUsers.users.find(user => user.email === email);
      if (userExists) {
        console.log('Email déjà utilisé:', email);
        throw new Error('Cet email est déjà utilisé.');
      }

      console.log('Envoi de l\'invitation...');
      const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { role: 'adherent' },
        redirectTo: `${window.location.origin}/set-password`,
      });
      if (inviteError) throw inviteError;

      console.log('Insertion dans members...');
      const { error: memberError } = await supabase.from('members').insert({
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
      });
      if (memberError) throw memberError;

      setSuccess('Adhérent créé avec succès ! Un e-mail avec un lien pour définir le mot de passe a été envoyé.');
      setFirstName('');
      setLastName('');
      setEmail('');
      setPhone('');
      fetchMembers();
    } catch (err) {
      console.error('Erreur dans handleCreateMember:', err);
      setError(err.message || 'Erreur lors de la création de l’adhérent ou de l’envoi de l\'email.');
    }
  };

  const handleCreateSale = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (![1, 10, 20].includes(quantity) && quantity !== 0) {
      setError('La quantité doit être 1, 10, 20 ou 0 pour un crédit.');
      return;
    }

    let calculatedAmount = 0;
    if (quantity > 0) {
      if (saleType === 'individual' && quantity === 10) calculatedAmount = 260;
      else if (saleType === 'duo' && quantity === 10) calculatedAmount = familyDiscount ? 187 : 220;
      else if (saleType === 'collective' && quantity === 10) calculatedAmount = 100;
      else if (saleType === 'collective' && quantity === 20) calculatedAmount = 185;
      else if (quantity === 1) calculatedAmount = saleType === 'individual' ? 32 : (saleType === 'duo' ? 25 : 12);
    } else if (creditSessions > 0) {
      calculatedAmount = 0;
    }

    setAmount(calculatedAmount.toFixed(2));

    try {
      const { data, error } = await supabase.from('sales').insert({
        member_id: selectedMember,
        sale_type: saleType,
        quantity: quantity > 0 ? quantity : creditSessions,
        amount: parseFloat(calculatedAmount.toFixed(2)),
        payment_method: paymentMethod,
        created_at: new Date().toISOString(),
        is_credit: quantity === 0 && creditSessions > 0,
      }).select();
      if (error) throw error;

      if (quantity > 0 && !data[0].is_credit) {
        const { error: invoiceError } = await supabase.from('invoices').insert({
          sale_id: data[0].id,
          member_id: selectedMember,
          amount: parseFloat(calculatedAmount.toFixed(2)),
          issued_at: new Date().toISOString(),
        });
        if (invoiceError) throw invoiceError;

        await supabase.from('sales').update({ invoice_id: data[0].id }).eq('id', data[0].id);
      }

      setSuccess('Vente ou crédit créé avec succès ! Une facture a été générée si applicable.');
      setSelectedMember('');
      setSaleType('individual');
      setQuantity(1);
      setAmount('');
      setPaymentMethod('cash');
      setFamilyDiscount(false);
      setCreditSessions(0);
      fetchSales();
      if (selectedMember) fetchSessionBalance(selectedMember);
    } catch (err) {
      setError(err.message);
    }
  };

  const generateInvoicePDF = async (saleId) => {
    try {
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .select('*, members(id, first_name, last_name, email), invoices(*)')
        .eq('id', saleId)
        .single();
      if (saleError) throw saleError;

      const doc = new jsPDF();
      doc.setFontSize(20);
      doc.text('Facture MK Studio', 105, 20, { align: 'center' });
      doc.setFontSize(12);
      doc.text('Manon Delmas - Coach sportif diplômé', 105, 30, { align: 'center' });
      doc.text('102 route de Gourdon, 46300 Le Vigan en Quercy', 105, 40, { align: 'center' });
      doc.text('Numéro Siret: 88533548900013', 105, 50, { align: 'center' });

      doc.text(`Client: ${sale.members.first_name} ${sale.members.last_name}`, 20, 70);
      doc.text(`Email: ${sale.members.email || 'Non spécifié'}`, 20, 80);

      doc.text('Détails de la facture:', 20, 100);
      autoTable(doc, {
        startY: 110,
        head: [['Description', 'Quantité', 'Montant (€)']],
        body: [
          [
            `${sale.sale_type.charAt(0).toUpperCase() + sale.sale_type.slice(1)} (${sale.quantity} séance${sale.quantity > 1 ? 's' : ''})`,
            sale.quantity,
            sale.amount,
          ],
        ],
      });

      const issuedDate = sale.invoices.issued_at ? new Date(sale.invoices.issued_at) : new Date();
      doc.text(`Total: ${sale.amount} €`, 20, doc.lastAutoTable.finalY + 10);
      doc.text(`Date d'émission: ${issuedDate.toLocaleDateString('fr-FR')}`, 20, doc.lastAutoTable.finalY + 20);
      doc.text(`Méthode de paiement: ${sale.payment_method}`, 20, doc.lastAutoTable.finalY + 30);

      doc.save(`facture_${sale.members.first_name}_${sale.members.last_name}_${sale.id}.pdf`);
      setSuccess('Facture générée et téléchargée avec succès !');
    } catch (err) {
      setError(`Erreur lors de la génération de la facture: ${err.message}`);
    }
  };

  const handleDebitIndividualSession = async () => {
    if (!selectedMember || memberBalance.individualSessions <= 0) {
      setError('Aucune séance individuelle restante ou aucun adhérent sélectionné.');
      return;
    }

    try {
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select('id')
        .eq('member_id', selectedMember)
        .eq('sale_type', 'individual')
        .order('created_at', { ascending: false })
        .limit(1);
      if (salesError) throw salesError;

      const saleId = salesData.length > 0 ? salesData[0].id : null;

      const { error } = await supabase.from('session_usage').insert({
        member_id: selectedMember,
        sale_id: saleId,
        sale_type: 'individual',
        used_at: new Date().toISOString(),
        is_canceled: false,
      });
      if (error) throw error;

      setSuccess('1 séance individuelle débitée avec succès !');
      await fetchSessionBalance(selectedMember);
    } catch (err) {
      setError('Erreur lors du débit de la séance individuelle: ' + err.message);
    }
  };

  const handleDebitDuoSession = async () => {
    if (!selectedMember || memberBalance.duoSessions <= 0) {
      setError('Aucune séance duo restante ou aucun adhérent sélectionné.');
      return;
    }

    try {
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select('id')
        .eq('member_id', selectedMember)
        .eq('sale_type', 'duo')
        .order('created_at', { ascending: false })
        .limit(1);
      if (salesError) throw salesError;

      const saleId = salesData.length > 0 ? salesData[0].id : null;

      const { error } = await supabase.from('session_usage').insert({
        member_id: selectedMember,
        sale_id: saleId,
        sale_type: 'duo',
        used_at: new Date().toISOString(),
        is_canceled: false,
      });
      if (error) throw error;

      setSuccess('1 séance duo débitée avec succès !');
      await fetchSessionBalance(selectedMember);
    } catch (err) {
      setError('Erreur lors du débit de la séance duo: ' + err.message);
    }
  };

  const location = useLocation();
  console.log('Current location:', location.pathname);

  return (
    <div className="p-6 bg-gray-900 text-white min-h-screen">
      <h1 className="text-3xl font-bold mb-6 text-yellow-500 border-b-2 border-yellow-500 pb-2 text-center">Espace Admin - MK Studio</h1>
      <nav className="mb-8 bg-gray-800 p-4 rounded-lg shadow-md">
        <ul className="flex space-x-4 justify-center">
          <li><Link to="/admin" className="text-yellow-500 hover:text-yellow-300">Inscription</Link></li>
          <li><Link to="/admin/sales" className="text-yellow-500 hover:text-yellow-300">Gestion</Link></li>
          <li><Link to="/admin/collective-courses" className="text-yellow-500 hover:text-yellow-300">Cours Collectifs</Link></li>
        </ul>
      </nav>
      <Routes>
        <Route index element={
          <div className="p-6 bg-gray-800 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4 text-yellow-500 border-b border-yellow-500 pb-1">Créer un nouvel adhérent</h2>
            {error && <p className="text-yellow-500 mb-4">{error}</p>}
            {success && <p className="text-yellow-500 mb-4">{success}</p>}
            <form onSubmit={handleCreateMember} className="space-y-4">
              <div>
                <label className="block text-white">Prénom</label>
                <input
                  type="text"
                  className="w-full p-2 border rounded-lg bg-gray-700 text-white border-gray-600"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-white">Nom</label>
                <input
                  type="text"
                  className="w-full p-2 border rounded-lg bg-gray-700 text-white border-gray-600"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-white">Email</label>
                <input
                  type="email"
                  className="w-full p-2 border rounded-lg bg-gray-700 text-white border-gray-600"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-white">Téléphone</label>
                <input
                  type="tel"
                  className="w-full p-2 border rounded-lg bg-gray-700 text-white border-gray-600"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className="w-full bg-gradient-to-r from-yellow-500 to-yellow-300 text-white p-2 rounded-lg hover:from-yellow-600 hover:to-yellow-400 transition"
              >
                Créer adhérent
              </button>
            </form>
          </div>
        } />
        <Route path="sales" element={
          <div className="p-6 bg-gray-800 rounded-lg shadow-md">
            {selectedMember && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-4 text-yellow-500 border-b border-yellow-500 pb-1">Solde de {members.find(m => m.id === selectedMember)?.first_name} {members.find(m => m.id === selectedMember)?.last_name}</h2>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="p-4 bg-yellow-400 rounded-lg text-center shadow-md">
                    <h3 className="text-lg font-semibold text-gray-100">Individuelles</h3>
                    <p className="text-2xl text-yellow-700">{memberBalance.individualSessions}</p>
                    <button
                      onClick={handleDebitIndividualSession}
                      className="mt-2 bg-gradient-to-r from-red-600 to-red-400 text-white p-1 rounded-lg hover:from-red-700 hover:to-red-500 transition text-xs"
                      disabled={memberBalance.individualSessions <= 0}
                    >
                      Débiter 1
                    </button>
                  </div>
                  <div className="p-4 bg-yellow-500 rounded-lg text-center shadow-md">
                    <h3 className="text-lg font-semibold text-gray-100">Duo</h3>
                    <p className="text-2xl text-yellow-700">{memberBalance.duoSessions}</p>
                    <button
                      onClick={handleDebitDuoSession}
                      className="mt-2 bg-gradient-to-r from-red-600 to-red-400 text-white p-1 rounded-lg hover:from-red-700 hover:to-red-500 transition text-xs"
                      disabled={memberBalance.duoSessions <= 0}
                    >
                      Débiter 1
                    </button>
                  </div>
                  <div className="p-4 bg-yellow-600 rounded-lg text-center shadow-md">
                    <h3 className="text-lg font-semibold text-gray-100">Collectives</h3>
                    <p className="text-2xl text-yellow-700">{memberBalance.collectiveSessions}</p>
                  </div>
                </div>
              </div>
            )}
            <h2 className="text-xl font-semibold mb-4 text-yellow-500 border-b border-yellow-500 pb-1">Créer une vente ou créditer des séances</h2>
            {error && <p className="text-yellow-500 mb-4">{error}</p>}
            {success && <p className="text-yellow-500 mb-4">{success}</p>}
            <form onSubmit={handleCreateSale} className="space-y-4">
              <div>
                <label className="block text-white">Rechercher un adhérent</label>
                <input
                  type="text"
                  className="w-full p-2 border rounded-lg mb-2 bg-gray-700 text-white border-gray-600"
                  value={searchMember}
                  onChange={(e) => setSearchMember(e.target.value)}
                  placeholder="Entrez un nom ou email..."
                />
                <select
                  className="w-full p-2 border rounded-lg bg-gray-700 text-white border-gray-600"
                  value={selectedMember}
                  onChange={(e) => {
                    setSelectedMember(e.target.value);
                    if (e.target.value) fetchSessionBalance(e.target.value);
                  }}
                  required
                >
                  <option value="">Sélectionner un adhérent</option>
                  {members
                    .filter(member =>
                      member.first_name.toLowerCase().includes(searchMember.toLowerCase()) ||
                      member.last_name.toLowerCase().includes(searchMember.toLowerCase()) ||
                      member.email.toLowerCase().includes(searchMember.toLowerCase())
                    )
                    .map((member) => (
                      <option key={member.id} value={member.id}>
                        {`${member.first_name} ${member.last_name} (${member.email})`}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-white">Type de vente</label>
                <select
                  className="w-full p-2 border rounded-lg bg-gray-700 text-white border-gray-600"
                  value={saleType}
                  onChange={(e) => {
                    setSaleType(e.target.value);
                    let calculatedAmount = 0;
                    if (e.target.value === 'individual' && quantity === 10) calculatedAmount = 260;
                    else if (e.target.value === 'duo' && quantity === 10) calculatedAmount = familyDiscount ? 187 : 220;
                    else if (e.target.value === 'collective' && quantity === 10) calculatedAmount = 100;
                    else if (e.target.value === 'collective' && quantity === 20) calculatedAmount = 185;
                    setAmount(calculatedAmount.toFixed(2));
                  }}
                  required
                >
                  <option value="individual">Individuelle</option>
                  <option value="duo">Duo</option>
                  <option value="collective">Collective</option>
                </select>
              </div>
              <div>
                <label className="block text-white">Quantité (1, 10, 20)</label>
                <select
                  className="w-full p-2 border rounded-lg bg-gray-700 text-white border-gray-600"
                  value={quantity}
                  onChange={(e) => {
                    setQuantity(parseInt(e.target.value));
                    let calculatedAmount = 0;
                    if (saleType === 'individual' && parseInt(e.target.value) === 10) calculatedAmount = 260;
                    else if (saleType === 'duo' && parseInt(e.target.value) === 10) calculatedAmount = familyDiscount ? 187 : 220;
                    else if (saleType === 'collective' && parseInt(e.target.value) === 10) calculatedAmount = 100;
                    else if (saleType === 'collective' && parseInt(e.target.value) === 20) calculatedAmount = 185;
                    else if (parseInt(e.target.value) === 1) calculatedAmount = saleType === 'individual' ? 32 : (saleType === 'duo' ? 25 : 12);
                    setAmount(calculatedAmount.toFixed(2));
                  }}
                  required
                >
                  <option value="1">1 (32€/25€/12€)</option>
                  <option value="10">10 (260€/220€/100€)</option>
                  <option value="20">20 (185€ - Collective uniquement)</option>
                </select>
              </div>
              <div>
                <label className="block text-white">Montant (€)</label>
                <input
                  type="number"
                  className="w-full p-2 border rounded-lg bg-gray-700 text-white border-gray-600"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  step="0.01"
                  readOnly
                  required
                />
              </div>
              <div>
                <label className="block text-white">Méthode de paiement</label>
                <select
                  className="w-full p-2 border rounded-lg bg-gray-700 text-white border-gray-600"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  required
                >
                  <option value="cash">Espèces</option>
                  <option value="check">Chèque</option>
                  <option value="transfer">Virement</option>
                  <option value="card">Carte</option>
                </select>
              </div>
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={familyDiscount}
                    onChange={(e) => {
                      setFamilyDiscount(e.target.checked);
                      let calculatedAmount = 0;
                      if (saleType === 'duo' && quantity === 10) calculatedAmount = e.target.checked ? 187 : 220;
                      else if (quantity === 1) calculatedAmount = 25;
                      setAmount(calculatedAmount.toFixed(2));
                    }}
                  />
                  <span className="text-white">Duo famille (-15%)</span>
                </label>
              </div>
              <div>
                <label className="block text-white">Créditer des séances (sans facturation)</label>
                <input
                  type="number"
                  className="w-full p-2 border rounded-lg bg-gray-700 text-white border-gray-600"
                  value={creditSessions}
                  onChange={(e) => setCreditSessions(parseInt(e.target.value) || 0)}
                  placeholder="Nombre de séances à créditer"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-gradient-to-r from-yellow-500 to-yellow-300 text-white p-2 rounded-lg hover:from-yellow-600 hover:to-yellow-400 transition"
              >
                Créer vente ou créditer
              </button>
            </form>
            {selectedMember && (
              <div className="mt-6">
                <h2 className="text-xl font-semibold mb-4 text-yellow-500 border-b border-yellow-500 pb-1">Historique</h2>
                {memberHistory.length > 0 ? (
                  <ul className="list-disc pl-5 text-yellow-500">
                    {memberHistory.map((entry, index) => (
                      <li key={index}>
                        {entry.action}: {entry.type} - Quantité: {entry.quantity} - Date: {entry.date}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-yellow-500">Aucun historique disponible.</p>
                )}
              </div>
            )}
            <div className="mt-6">
              <h2 className="text-xl font-semibold mb-4 text-yellow-500 border-b border-yellow-500 pb-1">Générer une facture PDF</h2>
              {error && <p className="text-yellow-500 mb-4">{error}</p>}
              {success && <p className="text-yellow-500 mb-4">{success}</p>}
              <div className="space-y-4">
                <div>
                  <label className="block text-white">Rechercher par nom</label>
                  <input
                    type="text"
                    className="w-full p-2 border rounded-lg bg-gray-700 text-white border-gray-600"
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                    placeholder="Entrez un nom ou prénom..."
                  />
                </div>
                <div>
                  <select
                    className="w-full p-2 border rounded-lg bg-gray-700 text-white border-gray-600"
                    onChange={(e) => generateInvoicePDF(e.target.value)}
                  >
                    <option value="">Sélectionner une facture</option>
                    {sales
                      .filter(sale => sale.invoice_id && (sale.members.first_name.toLowerCase().includes(searchName.toLowerCase()) || sale.members.last_name.toLowerCase().includes(searchName.toLowerCase())))
                      .map((sale) => (
                        <option key={sale.id} value={sale.id}>
                          {`${sale.members.first_name} ${sale.members.last_name} - ${sale.sale_type} - ${sale.amount}€ - ${new Date(sale.created_at).toLocaleDateString()}`}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        } />
        <Route path="collective-courses" element={<CollectiveCourses />} />
      </Routes>
    </div>
  );
}

export default Admin;