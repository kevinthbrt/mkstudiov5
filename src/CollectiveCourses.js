import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

function CollectiveCourses() {
  const [courseSchedule, setCourseSchedule] = useState([]);
  const [allCourseSchedule, setAllCourseSchedule] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [members, setMembers] = useState([]);
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [isAgendaLoading, setIsAgendaLoading] = useState(true);

  // Définir les fonctions stabilisées avec useCallback
  const generateCourseSchedule = useCallback((offset) => {
    const weekLabel = offset === 0 ? 'Cette semaine' : 'Semaine suivante';
    setCourseSchedule(allCourseSchedule.filter(c => c.weekLabel === weekLabel));
  }, [allCourseSchedule]); // Dépendance sur allCourseSchedule

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
    return new Date(courseDate) < currentDate;
  }, []);

  const getEnrolledMembers = useCallback((courseId) => {
    const enrolled = bookings.filter(b => b.course_id === courseId && !b.canceled_at).map(b => {
      const member = members.find(m => m.id === b.member_id);
      return member ? { id: b.member_id, name: `${member.first_name} ${member.last_name}` } : { id: null, name: 'Inconnu' };
    });
    return enrolled;
  }, [bookings, members]);

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

      return {
        individualSessions: Math.max(0, individual - usageCount.individual),
        duoSessions: Math.max(0, duo - usageCount.duo),
        collectiveSessions: Math.max(0, collective - usageCount.collective),
      };
    } catch (err) {
      console.error('Error in fetchSessionBalance:', err);
      setError('Erreur lors du calcul des soldes: ' + (err.message || 'Erreur inconnue'));
      return { individualSessions: 0, duoSessions: 0, collectiveSessions: 0 };
    }
  }, []);

  const enrollMember = useCallback(async (courseId) => {
    if (isPastCourse(courseSchedule.find(c => c.id === courseId).date)) {
      setError('Impossible de s\'inscrire à un cours passé.');
      return;
    }

    const enrolled = getEnrolledMembers(courseId);
    const course = courseSchedule.find(c => c.id === courseId);
    if (enrolled.length >= course.maxSlots) {
      setError('Le cours est complet.');
      return;
    }

    if (!selectedMember) {
      setError('Veuillez sélectionner un adhérent.');
      return;
    }

    const balance = await fetchSessionBalance(selectedMember);
    if (balance.collectiveSessions <= 0) {
      setError('Aucune séance collective restante pour cet adhérent.');
      return;
    }

    try {
      const { data, error: enrollError } = await supabase
        .from('course_enrollments')
        .insert({
          course_id: courseId,
          member_id: selectedMember,
          created_at: new Date().toISOString(),
        }).select();
      if (enrollError) throw enrollError;

      const { error: usageError } = await supabase
        .from('session_usage')
        .insert({
          member_id: selectedMember,
          sale_type: 'collective',
          used_at: new Date().toISOString(),
          enrollment_id: data[0].id,
        });
      if (usageError) throw usageError;

      setSuccess('Inscription effectuée avec succès ! Une séance a été débitée.');
      setSelectedMember(null);
      fetchBookings();
    } catch (err) {
      setError('Erreur lors de l\'inscription: ' + err.message);
      console.error('Détails de l\'erreur:', err);
    }
  }, [courseSchedule, getEnrolledMembers, fetchSessionBalance, selectedMember]);

  const cancelEnrollment = useCallback(async (bookingId) => {
    const booking = bookings.find(b => b.id === bookingId);
    if (!booking) return;

    if (isPastCourse(courseSchedule.find(c => c.id === booking.course_id).date)) {
      setError('Impossible d\'annuler une inscription pour un cours passé.');
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

      setSuccess('Inscription annulée et séance récréditée avec succès !');
      fetchBookings();
    } catch (err) {
      setError('Erreur lors de l\'annulation de l\'inscription: ' + err.message);
      console.error('Détails de l\'erreur:', err);
    }
  }, [bookings, courseSchedule]);

  const prevWeek = useCallback(() => setCurrentWeekOffset(prev => Math.max(0, prev - 1)), []);
  const nextWeek = useCallback(() => {
    const maxOffset = 1;
    setCurrentWeekOffset(prev => Math.min(prev + 1, maxOffset));
  }, []);

  const generateInitialSchedule = useCallback(() => {
    const today = new Date();
    const currentWeekStart = new Date(today.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1)));
    const weeksToGenerate = 2;
    const allSchedules = [];

    for (let offset = 0; offset < weeksToGenerate; offset++) {
      const weekStart = new Date(currentWeekStart);
      weekStart.setDate(currentWeekStart.getDate() + offset * 7);
      const schedule = [
        { day: 'Lundi', time: '19:40', name: 'Renfo/Pilates', maxSlots: 9 },
        { day: 'Mardi', time: '17:40-18:40', name: 'Pilates', maxSlots: 9 },
        { day: 'Mardi', time: '18:40-19:40', name: 'Pilates', maxSlots: 9 },
        { day: 'Mercredi', time: '19:00-20:00', name: 'Cross-training/Cardio', maxSlots: 9 },
        { day: 'Jeudi', time: '19:40-20:40', name: 'Pilates', maxSlots: 9 },
        { day: 'Samedi', time: '10:30-11:30', name: 'Renfo/Abdos/Stretching', maxSlots: 9 },
      ];

      const weekSchedule = schedule.map(course => {
        const [startTime] = course.time.split('-').map(t => t.replace('h', ''));
        const date = new Date(weekStart);
        const dayIndex = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'].indexOf(course.day);
        date.setDate(date.getDate() + dayIndex);
        const [hours, minutes] = startTime.split(':').map(Number);
        date.setHours(hours, minutes, 0, 0);
        return {
          ...course,
          date: date,
          weekLabel: offset === 0 ? 'Cette semaine' : 'Semaine suivante',
          id: `${date.toISOString().split('T')[0]}-${course.time}-${course.name}-${offset}`,
        };
      });
      allSchedules.push(...weekSchedule);
    }
    setAllCourseSchedule(allSchedules);
    setCourseSchedule(allSchedules.filter(c => c.weekLabel === 'Cette semaine')); // Initialiser avec cette semaine
    setIsAgendaLoading(false);
  }, []);

  const fetchMembers = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('members').select('id, first_name, last_name, email');
      if (error) throw error;
      setMembers(data);
    } catch (err) {
      setError('Erreur lors de la récupération des membres: ' + err.message);
    }
  }, []);

  const fetchBookings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('course_enrollments')
        .select('id, course_id, member_id, created_at, canceled_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setBookings(data);
    } catch (err) {
      setError('Erreur lors de la récupération des réservations: ' + err.message);
    }
  }, []);

  useEffect(() => {
    generateInitialSchedule();
    fetchMembers();
    fetchBookings();
  }, [generateInitialSchedule, fetchMembers, fetchBookings]);

  useEffect(() => {
    generateCourseSchedule(currentWeekOffset);
  }, [currentWeekOffset, generateCourseSchedule]);

  return (
    <div className="p-6 bg-gray-900 text-white min-h-screen">
      <h2 className="text-3xl font-bold mb-6 text-yellow-500 border-b-2 border-yellow-500 pb-2 text-center">Gestion des Cours Collectifs</h2>
      {error && <p className="text-yellow-500 mb-4">{error}</p>}
      {success && <p className="text-yellow-500 mb-4">{success}</p>}
      {isAgendaLoading ? (
        <p className="text-yellow-500">Chargement de l'agenda...</p>
      ) : (
        <div className="mb-6">
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
          <div className="grid grid-cols-6 gap-2">
            {['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'].map(day => {
              const dayCourses = courseSchedule.filter(c => c.day === day);
              return (
                <div key={day} className="flex-1">
                  <h4 className="text-md font-medium text-yellow-500 mb-2">
                    {day} {dayCourses[0]?.date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                  </h4>
                  {dayCourses.map(course => {
                    const isPast = isPastCourse(course.date);
                    const enrolled = getEnrolledMembers(course.id);
                    const colorClass = getCourseColor(course.name);
                    return (
                      <div
                        key={course.id}
                        className={`p-2 mb-2 rounded-lg ${colorClass} ${isPast ? 'opacity-50 cursor-not-allowed' : ''} shadow-md hover:shadow-lg transition border border-gray-900`}
                        style={{ maxWidth: '100%', minWidth: 0 }}
                      >
                        <p className="text-sm text-yellow-500" style={{ overflowWrap: 'break-word', maxWidth: '100%' }}>
                          {course.time} - {course.name} ({enrolled.length}/{course.maxSlots})
                        </p>
                        <p className="text-xs text-white" style={{ overflowWrap: 'break-word', maxWidth: '100%' }}>Inscrits :</p>
                        <ul className="list-disc pl-4 text-xs text-black" style={{ overflowWrap: 'break-word', maxWidth: '100%' }}>
                          {enrolled.length > 0 ? (
                            enrolled.map((enroll, index) => (
                              <li key={index} className="flex justify-between" style={{ overflowWrap: 'break-word', maxWidth: '100%' }}>
                                {enroll.name}
                                {!isPast && (
                                  <button
                                    onClick={() => cancelEnrollment(bookings.find(b => b.course_id === course.id && b.member_id === enroll.id)?.id)}
                                    className="ml-2 text-red-500 hover:text-red-700"
                                    style={{ overflowWrap: 'break-word', maxWidth: '100%' }}
                                  >
                                    Annuler
                                  </button>
                                )}
                              </li>
                            ))
                          ) : (
                            <li style={{ overflowWrap: 'break-word', maxWidth: '100%' }}>Aucun inscrit</li>
                          )}
                        </ul>
                        {!isPast && enrolled.length < course.maxSlots && (
                          <div className="mt-2">
                            <select
                              value={selectedMember || ''}
                              onChange={(e) => setSelectedMember(e.target.value)}
                              className="w-full p-1 border rounded-lg bg-gray-700 text-white border-gray-600 mb-2"
                              style={{ overflowWrap: 'break-word', maxWidth: '100%' }}
                            >
                              <option value="">Sélectionner un adhérent</option>
                              {members
                                .filter(m => !enrolled.some(e => e.id === m.id))
                                .map((member) => (
                                  <option key={member.id} value={member.id} style={{ overflowWrap: 'break-word', maxWidth: '100%' }}>
                                    {`${member.first_name} ${member.last_name}`}
                                  </option>
                                ))}
                            </select>
                            <button
                              onClick={() => enrollMember(course.id)}
                              className="w-full bg-green-500 text-white p-1 rounded-lg hover:bg-green-600 transition"
                              disabled={!selectedMember}
                              style={{ overflowWrap: 'break-word', maxWidth: '100%' }}
                            >
                              Inscrire
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default CollectiveCourses;