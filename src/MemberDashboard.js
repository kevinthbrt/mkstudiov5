import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { useAuth } from './AuthContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function MemberDashboard() {
  const { user } = useAuth();
  const [individualSessions, setIndividualSessions] = useState(0);
  const [duoSessions, setDuoSessions] = useState(0);
  const [collectiveSessions, setCollectiveSessions] = useState(0);
  const [invoices, setInvoices] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [history, setHistory] = useState([]);
  const [courseSchedule, setCourseSchedule] = useState([]);
  const [allCourseSchedule, setAllCourseSchedule] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [allBookingsCount, setAllBookingsCount] = useState({});
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAgendaLoading, setIsAgendaLoading] = useState(true);
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);
  const [weekDates, setWeekDates] = useState([]);

  const isSameWeek = useCallback((date1, date2) => {
    const normalizeDate = (date) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d;
    };
    const startOfWeek = (date) => {
      const d = normalizeDate(date);
      d.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1));
      return d;
    };
    const week1 = startOfWeek(date1);
    const week2 = startOfWeek(date2);
    console.log('isSameWeek comparison:', { date1: normalizeDate(date1), date2: normalizeDate(date2), week1, week2 });
    return week1.getTime() === week2.getTime();
  }, []);

  const getCourseColor = useCallback((name) => {
    switch (name) {
      case 'Pilates': return 'bg-blue-200';
      case 'Renfo/Pilates': return 'bg-green-200';
      case 'Cross-training/Cardio': return 'bg-yellow-200';
      case 'Renfo/Abdos/Stretching': return 'bg-purple-200';
      default: return 'bg-gray-200';
    }
  }, []);

  const isPastCourse = useCallback((courseDate) => {
    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);
    const isPast = new Date(courseDate) < currentDate;
    console.log('isPastCourse:', { courseDate, currentDate, isPast });
    return isPast;
  }, []);

  const fetchRegularCourses = useCallback(async (startDate, endDate) => {
    try {
      const { data, error } = await supabase
        .from('courses')
        .select('id, day, time, name, max_slots, date, is_bookable, is_deactivated, is_deleted')
        .eq('is_deleted', false)
        .eq('is_deactivated', false)
        .gte('date', startDate.toISOString())
        .lte('date', endDate.toISOString());
      if (error) throw error;
      console.log('Raw regular courses fetched:', data);
      const mappedCourses = data.map(course => ({
        ...course,
        date: new Date(course.date),
        maxSlots: course.max_slots ?? 9,
        weekLabel: isSameWeek(new Date(course.date), new Date()) ? 'Cette semaine' : 'Semaine suivante',
        isExceptional: false,
        is_bookable: course.is_bookable !== false,
      }));
      console.log('Mapped regular courses:', mappedCourses);
      return mappedCourses;
    } catch (err) {
      console.error('Error in fetchRegularCourses:', err);
      setError('Erreur lors de la récupération des cours réguliers: ' + err.message);
      return [];
    }
  }, [isSameWeek]);

  const fetchExceptionalCourses = useCallback(async (startDate, endDate) => {
    try {
      const { data, error } = await supabase
        .from('exceptional_courses')
        .select('id, date, time, name, max_slots, is_bookable, is_deactivated, is_deleted')
        .eq('is_deleted', false)
        .eq('is_deactivated', false)
        .gte('date', startDate.toISOString())
        .lte('date', endDate.toISOString());
      if (error) throw error;
      console.log('Exceptional courses fetched:', data);
      return data.map(course => ({
        id: course.id,
        date: new Date(course.date),
        time: course.time,
        name: course.name,
        maxSlots: course.max_slots ?? 9,
        day: new Date(course.date).toLocaleDateString('fr-FR', { weekday: 'long' }).replace(/^\w/, c => c.toUpperCase()),
        weekLabel: isSameWeek(new Date(course.date), new Date()) ? 'Cette semaine' : 'Semaine suivante',
        isExceptional: true,
        is_bookable: course.is_bookable !== false,
      }));
    } catch (err) {
      console.error('Error in fetchExceptionalCourses:', err);
      setError('Erreur lors de la récupération des cours exceptionnels: ' + err.message);
      return [];
    }
  }, [isSameWeek]);

  const generateWeekDates = useCallback((startDate, offset) => {
    const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const dates = [];
    const weekStart = new Date(startDate);
    weekStart.setDate(startDate.getDate() + offset * 7);
    for (let i = 0; i < 6; i++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      dates.push({ day: days[i], date });
    }
    console.log('Generated week dates:', dates);
    return dates;
  }, []);

  const generateInitialSchedule = useCallback(async () => {
    setIsAgendaLoading(true);
    const today = new Date();
    const currentWeekStart = new Date(today);
    currentWeekStart.setHours(0, 0, 0, 0);
    currentWeekStart.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
    const weeksToGenerate = 2;
    const endDate = new Date(currentWeekStart);
    endDate.setDate(currentWeekStart.getDate() + weeksToGenerate * 7 - 1);

    console.log('Generating schedule:', { currentWeekStart, endDate });

    const allSchedules = [];

    const regularCourses = await fetchRegularCourses(currentWeekStart, endDate);
    const exceptionalCourses = await fetchExceptionalCourses(currentWeekStart, endDate);

    allSchedules.push(...regularCourses, ...exceptionalCourses);

    console.log('Generated all course schedule:', allSchedules);
    setAllCourseSchedule(allSchedules);
    setCourseSchedule(allSchedules.filter(c => c.weekLabel === 'Cette semaine'));
    setWeekDates(generateWeekDates(currentWeekStart, 0));
    setIsAgendaLoading(false);
  }, [fetchRegularCourses, fetchExceptionalCourses, generateWeekDates]);

  const generateCourseSchedule = useCallback((offset) => {
    const weekLabel = offset === 0 ? 'Cette semaine' : 'Semaine suivante';
    const filteredSchedule = allCourseSchedule.filter(c => c.weekLabel === weekLabel);
    console.log('Filtered schedule for week:', weekLabel, filteredSchedule);
    setCourseSchedule(filteredSchedule);
    const currentWeekStart = new Date();
    currentWeekStart.setHours(0, 0, 0, 0);
    currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay() + (currentWeekStart.getDay() === 0 ? -6 : 1));
    setWeekDates(generateWeekDates(currentWeekStart, offset));
  }, [allCourseSchedule, generateWeekDates]);

  const fetchSessionBalance = useCallback(async (memberId) => {
    try {
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

      setIndividualSessions(Math.max(0, individual - usageCount.individual));
      setDuoSessions(Math.max(0, duo - usageCount.duo));
      setCollectiveSessions(Math.max(0, collective - usageCount.collective));

      const salesHistory = salesData.map(sale => ({
        type: sale.sale_type || 'inconnu',
        quantity: sale.quantity || 0,
        date: new Date(sale.created_at).toLocaleString('fr-FR'),
        action: 'Vente',
      }));
      const usageHistory = usageData.map(usage => ({
        type: usage.sale_type || 'inconnu',
        quantity: 1,
        date: new Date(usage.used_at).toLocaleString('fr-FR'),
        action: 'Utilisation',
      }));
      setHistory([...salesHistory, ...usageHistory].sort((a, b) => new Date(b.date) - new Date(a.date)));
    } catch (err) {
      console.error('Error in fetchSessionBalance:', err);
      setError('Erreur lors du calcul des soldes: ' + (err.message || 'Erreur inconnue'));
    }
  }, []);

  const fetchInvoices = useCallback(async (memberId) => {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, sales(sale_type, quantity, amount, payment_method, created_at, members(first_name, last_name, email))')
        .eq('member_id', memberId)
        .order('issued_at', { ascending: false });
      if (error) throw error;
      setInvoices(data);
    } catch (err) {
      setError('Erreur lors de la récupération des factures: ' + err.message);
    }
  }, []);

  const fetchBookings = useCallback(async (memberId) => {
    try {
      const { data, error } = await supabase
        .from('course_enrollments')
        .select('id, course_id, exceptional_course_id, is_exceptional, created_at, canceled_at')
        .eq('member_id', memberId)
        .is('canceled_at', null);
      if (error) throw error;
      setBookings(data);
    } catch (err) {
      setError('Erreur lors de la récupération des réservations: ' + err.message);
    }
  }, []);

  const fetchAllBookingsCount = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('course_enrollments')
        .select('course_id, exceptional_course_id, is_exceptional')
        .is('canceled_at', null);
      if (error) throw error;
      const counts = data.reduce((acc, item) => {
        const key = item.is_exceptional ? item.exceptional_course_id : item.course_id;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      setAllBookingsCount(counts);
      console.log('All bookings count:', counts);
    } catch (err) {
      console.error('Error fetching all bookings count:', err);
      setError('Erreur lors de la récupération des réservations globales: ' + err.message);
    }
  }, []);

  const fetchProfile = useCallback(async (memberId) => {
    try {
      const { data, error } = await supabase
        .from('members')
        .select('first_name, last_name')
        .eq('id', memberId)
        .single();
      if (error) throw error;
      setProfile(data);
    } catch (err) {
      console.error('Error fetching profile:', err);
      setProfile({ first_name: 'Inconnu', last_name: 'Inconnu' });
    }
  }, []);

  const handleCourseBooking = useCallback(async (courseId, isExceptional) => {
    const course = courseSchedule.find(c => c.id === courseId);
    if (!course) {
      setError('Cours introuvable.');
      return;
    }

    if (!course.is_bookable) {
      setError('Ce cours n\'est pas réservable.');
      return;
    }

    const currentDate = new Date();
    const courseDate = new Date(course.date);
    if (courseDate < currentDate) {
      setError('Impossible de réserver un cours dans le passé.');
      return;
    }

    const bookingsKey = isExceptional ? 'exceptional_course_id' : 'course_id';
    const { data: existingBookings, error: fetchError } = await supabase
      .from('course_enrollments')
      .select('id')
      .eq(bookingsKey, courseId)
      .is('canceled_at', null);
    if (fetchError) {
      setError('Erreur lors de la vérification des réservations: ' + fetchError.message);
      return;
    }

    if (existingBookings.length >= course.maxSlots) {
      setError('Le cours est complet (9 inscriptions maximum).');
      return;
    }

    if (collectiveSessions <= 0) {
      setError('Aucune séance collective restante.');
      return;
    }

    try {
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select('id')
        .eq('member_id', user.id)
        .eq('sale_type', 'collective')
        .order('created_at', { ascending: false })
        .limit(1);
      if (salesError) throw salesError;

      const saleId = salesData.length > 0 ? salesData[0].id : null;

      const enrollmentData = {
        member_id: user.id,
        course_id: isExceptional ? null : courseId,
        exceptional_course_id: isExceptional ? courseId : null,
        is_exceptional: isExceptional,
        created_at: new Date().toISOString(),
      };

      const { data, error: enrollError } = await supabase
        .from('course_enrollments')
        .insert(enrollmentData)
        .select();
      if (enrollError) throw enrollError;

      const { error: usageError } = await supabase
        .from('session_usage')
        .insert({
          member_id: user.id,
          sale_id: saleId,
          sale_type: 'collective',
          used_at: new Date().toISOString(),
          enrollment_id: data[0].id,
        });
      if (usageError) throw usageError;

      setCollectiveSessions(prev => Math.max(0, prev - 1));
      setBookings(prev => [...prev, {
        id: data[0].id,
        course_id: isExceptional ? null : courseId,
        exceptional_course_id: isExceptional ? courseId : null,
        is_exceptional: isExceptional,
        created_at: new Date().toISOString(),
      }]);
      await fetchAllBookingsCount();
      await fetchBookings(user.id);
      setSuccess('Réservation effectuée avec succès !');
      await fetchSessionBalance(user.id);
    } catch (err) {
      setError('Erreur lors de la réservation: ' + err.message);
      console.error('Détails de l\'erreur:', err);
    }
  }, [courseSchedule, collectiveSessions, user?.id, fetchAllBookingsCount, fetchBookings, fetchSessionBalance]);

  const handleCancelBooking = useCallback(async (bookingId) => {
    const booking = bookings.find(b => b.id === bookingId);
    if (!booking) {
      setError('Réservation introuvable.');
      return;
    }

    const course = courseSchedule.find(c =>
      (booking.is_exceptional && c.id === booking.exceptional_course_id) ||
      (!booking.is_exceptional && c.id === booking.course_id)
    );
    if (!course || new Date(course.date) < new Date()) {
      setError('Impossible d\'annuler un cours passé.');
      return;
    }

    try {
      const { error: updateEnrollmentError } = await supabase
        .from('course_enrollments')
        .update({ canceled_at: new Date().toISOString() })
        .eq('id', bookingId);
      if (updateEnrollmentError) throw updateEnrollmentError;

      const { error: updateUsageError } = await supabase
        .from('session_usage')
        .update({ is_canceled: true })
        .eq('enrollment_id', bookingId);
      if (updateUsageError) throw updateUsageError;

      setCollectiveSessions(prev => Math.max(0, prev + 1));
      setBookings(prev => prev.filter(b => b.id !== bookingId));
      await fetchAllBookingsCount();
      await fetchBookings(user.id);
      setSuccess('Réservation annulée avec succès !');
      await fetchSessionBalance(user.id);
    } catch (err) {
      setError('Erreur lors de l\'annulation: ' + err.message);
      console.error('Détails de l\'erreur:', err);
    }
  }, [bookings, courseSchedule, fetchAllBookingsCount, fetchBookings, user?.id, fetchSessionBalance]);

  const nextWeek = useCallback(() => {
    const maxOffset = 1;
    setCurrentWeekOffset(prev => Math.min(prev + 1, maxOffset));
  }, []);

  const prevWeek = useCallback(() => setCurrentWeekOffset(prev => Math.max(0, prev - 1)), []);

  const generateInvoicePDF = useCallback(async (invoice) => {
    try {
      const doc = new jsPDF();
      doc.setFontSize(20);
      doc.text('Facture MK Studio', 105, 20, { align: 'center' });
      doc.setFontSize(12);
      doc.text('Manon Delmas - Coach sportif diplômé', 105, 30, { align: 'center' });
      doc.text('102 route de Gourdon, 46300 Le Vigan en Quercy', 105, 40, { align: 'center' });
      doc.text('Numéro Siret: 88533548900013', 105, 50, { align: 'center' });

      doc.text(`Client: ${profile.first_name} ${profile.last_name}`, 20, 70);
      doc.text(`Email: ${user.email || 'Non spécifié'}`, 20, 80);

      doc.text('Détails de la facture:', 20, 100);
      autoTable(doc, {
        startY: 110,
        head: [['Description', 'Quantité', 'Montant (€)']],
        body: [
          [
            `${invoice.sales.sale_type.charAt(0).toUpperCase() + invoice.sales.sale_type.slice(1)} (${invoice.sales.quantity} séance${invoice.sales.quantity > 1 ? 's' : ''})`,
            invoice.sales.quantity,
            invoice.sales.amount,
          ],
        ],
      });

      const issuedDate = invoice.issued_at ? new Date(invoice.issued_at) : new Date();
      doc.text(`Total: ${invoice.sales.amount} €`, 20, doc.lastAutoTable.finalY + 10);
      doc.text(`Date d'émission: ${issuedDate.toLocaleDateString('fr-FR')}`, 20, doc.lastAutoTable.finalY + 20);
      doc.text(`Méthode de paiement: ${invoice.sales.payment_method}`, 20, doc.lastAutoTable.finalY + 30);

      doc.save(`facture_${profile.first_name}_${profile.last_name}_${invoice.id}.pdf`);
      setSuccess('Facture générée et téléchargée avec succès !');
    } catch (err) {
      setError(`Erreur lors de la génération de la facture: ${err.message}`);
    }
  }, [profile, user?.email]);

  useEffect(() => {
    if (user) {
      setIsLoading(true);
      fetchSessionBalance(user.id);
      fetchInvoices(user.id);
      fetchBookings(user.id);
      fetchAllBookingsCount();
      fetchProfile(user.id);
      generateInitialSchedule();
      setIsLoading(false);
    } else {
      console.log('User not available, waiting for authentication...');
      setIsLoading(false);
    }
  }, [user, fetchSessionBalance, fetchInvoices, fetchBookings, fetchAllBookingsCount, fetchProfile, generateInitialSchedule]);

  useEffect(() => {
    generateCourseSchedule(currentWeekOffset);
  }, [currentWeekOffset, generateCourseSchedule]);

  return (
    <div className="p-6 bg-gray-900 text-white min-h-screen">
      <h2 className="text-3xl font-bold mb-6 text-yellow-500 border-b-2 border-yellow-500 pb-2">
        Bienvenue {profile ? `${profile.first_name} ${profile.last_name}` : 'Inconnu Inconnu'}
      </h2>
      {isLoading ? (
        <p className="text-yellow-500">Chargement des données...</p>
      ) : (
        <>
          {error && <p className="text-yellow-500 mb-4">{error}</p>}
          {success && <p className="text-yellow-500 mb-4">{success}</p>}
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-yellow-400 rounded-lg text-center shadow-md hover:shadow-lg transition border border-gray-900">
                <h3 className="text-lg font-semibold text-gray-100">Individuelles</h3>
                <p className="text-2xl text-yellow-700">{individualSessions}</p>
              </div>
              <div className="p-4 bg-yellow-500 rounded-lg text-center shadow-md hover:shadow-lg transition border border-gray-900">
                <h3 className="text-lg font-semibold text-gray-100">Duo</h3>
                <p className="text-2xl text-yellow-700">{duoSessions}</p>
              </div>
              <div className="p-4 bg-yellow-600 rounded-lg text-center shadow-md hover:shadow-lg transition border border-gray-900">
                <h3 className="text-lg font-semibold text-gray-100">Collectives</h3>
                <p className="text-2xl text-yellow-700">{collectiveSessions}</p>
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2 text-yellow-500 border-b border-yellow-500 pb-1">Mes réservations à venir :</h3>
              {bookings.length > 0 ? (
                <ul className="list-disc pl-5">
                  {bookings
                    .map(booking => {
                      const course = allCourseSchedule.find(c =>
                        (booking.is_exceptional && c.id === booking.exceptional_course_id) ||
                        (!booking.is_exceptional && c.id === booking.course_id)
                      );
                      return { ...booking, course };
                    })
                    .filter(b => b.course && !isPastCourse(b.course.date))
                    .map((b, index) => (
                      <li key={index} className={`p-2 mb-2 rounded-lg ${getCourseColor(b.course.name)} text-gray-900 border border-gray-900`}>
                        {b.course.name} {b.course.isExceptional ? '(Exceptionnel)' : ''} - {b.course.time} le {new Date(b.course.date).toLocaleDateString('fr-FR')}
                        <button
                          onClick={() => handleCancelBooking(b.id)}
                          className="ml-2 bg-gradient-to-r from-red-600 to-red-400 text-white p-1 rounded-lg hover:from-red-700 hover:to-red-500 transition text-xs"
                        >
                          Annuler
                        </button>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="text-yellow-500">Aucune réservation à venir.</p>
              )}
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2 text-yellow-500 border-b border-yellow-500 pb-1">Réservations des Cours Collectifs</h3>
              {isAgendaLoading ? (
                <p className="text-yellow-500">Chargement de l'agenda...</p>
              ) : (
                <>
                  <div className="flex justify-between mb-2">
                    <button
                      onClick={prevWeek}
                      className="bg-gray-800 text-yellow-500 p-2 rounded-lg hover:bg-yellow-500 transition border border-gray-900"
                      disabled={currentWeekOffset === 0}
                    >
                      Semaine précédente
                    </button>
                    <span className="text-md font-medium text-yellow-500">
                      {currentWeekOffset === 0 ? 'Cette semaine' : 'Semaine suivante'}
                    </span>
                    <button
                      onClick={nextWeek}
                      className="bg-gray-800 text-yellow-500 p-2 rounded-lg hover:bg-yellow-500 transition border border-gray-900"
                      disabled={currentWeekOffset === 1}
                    >
                      Semaine suivante
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                    {['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'].map(day => {
                      const dayCourses = courseSchedule.filter(c => c.day === day);
                      const dayDate = weekDates.find(d => d.day === day)?.date;
                      return (
                        <div key={day} className="flex-1">
                          <h4 className="text-md font-medium text-yellow-500 mb-2">
                            {day} {dayDate?.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                          </h4>
                          {dayCourses.length > 0 ? (
                            dayCourses.map(course => {
                              const isBooked = bookings.some(b =>
                                (b.is_exceptional && b.exceptional_course_id === course.id) ||
                                (!b.is_exceptional && b.course_id === course.id)
                              );
                              const isPast = isPastCourse(course.date);
                              const colorClass = getCourseColor(course.name);
                              const bookingCount = allBookingsCount[course.id] || 0;
                              return (
                                <div
                                  key={course.id}
                                  className={`p-2 mb-2 rounded-lg ${colorClass} ${isPast || !course.is_bookable ? 'opacity-50 cursor-not-allowed' : ''} shadow-md hover:shadow-lg transition border border-gray-900`}
                                  style={{ maxWidth: '100%', minWidth: 0 }}
                                >
                                  <p className="text-sm text-yellow-500" style={{ overflowWrap: 'break-word', maxWidth: '100%' }}>
                                    {course.time} - {course.name} {course.isExceptional ? '(Exceptionnel)' : ''} ({bookingCount}/{course.maxSlots})
                                  </p>
                                  {!isPast && !isBooked && collectiveSessions > 0 && course.is_bookable && (
                                    <button
                                      onClick={() => handleCourseBooking(course.id, course.isExceptional)}
                                      className="mt-1 bg-gradient-to-r from-yellow-500 to-yellow-300 text-white p-1 rounded-lg hover:from-yellow-600 hover:to-yellow-400 transition text-xs"
                                      style={{ overflowWrap: 'break-word', maxWidth: '100%' }}
                                    >
                                      Réserver
                                    </button>
                                  )}
                                  {isBooked && (
                                    <button
                                      onClick={() => handleCancelBooking(bookings.find(b =>
                                        (b.is_exceptional && b.exceptional_course_id === course.id) ||
                                        (!b.is_exceptional && b.course_id === course.id)
                                      ).id)}
                                      className="mt-1 bg-gradient-to-r from-red-600 to-red-400 text-white p-1 rounded-lg hover:from-red-700 hover:to-red-500 transition text-xs ml-2"
                                      style={{ overflowWrap: 'break-word', maxWidth: '100%' }}
                                    >
                                      Annuler
                                    </button>
                                  )}
                                  {isPast && <p className="text-xs text-yellow-500 mt-2" style={{ overflowWrap: 'break-word', maxWidth: '100%' }}>Cours passé</p>}
                                  {!isPast && !isBooked && course.is_bookable === false && (
                                    <p className="text-xs text-yellow-500 mt-2" style={{ overflowWrap: 'break-word', maxWidth: '100%' }}>Cours non réservable</p>
                                  )}
                                </div>
                              );
                            })
                          ) : (
                            <p className="text-sm text-yellow-500">Aucun cours prévu ce jour.</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2 text-yellow-500 border-b border-yellow-500 pb-1">Télécharger une facture</h3>
              {invoices.length > 0 ? (
                <ul className="list-disc pl-5">
                  {invoices.map((invoice, index) => (
                    <li key={index}>
                      {new Date(invoice.issued_at).toLocaleDateString('fr-FR')} - {invoice.sales.sale_type}: {invoice.sales.amount}€ ({invoice.sales.payment_method})
                      <button
                        onClick={() => generateInvoicePDF(invoice)}
                        className="ml-2 bg-gradient-to-r from-yellow-500 to-yellow-300 text-white p-1 rounded-lg hover:from-yellow-600 hover:to-yellow-400 transition text-xs"
                      >
                        Télécharger
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-yellow-500">Aucune facture disponible.</p>
              )}
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2 text-yellow-500 border-b border-yellow-500 pb-1">Mon historique</h3>
              {history.length > 0 ? (
                <ul className="list-disc pl-5 text-yellow-500">
                  {history.map((entry, index) => (
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
        </>
      )}
    </div>
  );
}

export default MemberDashboard;