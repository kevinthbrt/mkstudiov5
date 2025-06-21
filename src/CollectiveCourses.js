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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newCourse, setNewCourse] = useState({
    date: '',
    time: '',
    name: '',
    maxSlots: 9,
  });
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
      default: return 'bg-pink-200';
    }
  }, []);

  const isPastCourse = useCallback((courseDateTime) => {
    const currentDateTime = new Date();
    const isPast = new Date(courseDateTime) < currentDateTime;
    console.log('isPastCourse:', { courseDateTime, currentDateTime, isPast });
    return isPast;
  }, []);

  const getEnrolledMembers = useCallback((courseId, isExceptional) => {
    const enrolled = bookings
      .filter(b => 
        (isExceptional ? b.exceptional_course_id === courseId : b.course_id === courseId) && 
        !b.canceled_at
      )
      .map(b => {
        const member = members.find(m => m.id === b.member_id);
        return member ? { id: b.member_id, name: `${member.first_name} ${member.last_name}` } : { id: null, name: 'Inconnu' };
      });
    console.log('getEnrolledMembers:', { courseId, isExceptional, enrolled });
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
        .eq('member_id', memberId);
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
        if (usage.sale_type === 'individual' && !usage.is_canceled) acc.individual += 1;
        else if (usage.sale_type === 'duo' && !usage.is_canceled) acc.duo += 1;
        else if (usage.sale_type === 'collective' && !usage.is_canceled) acc.collective += 1;
        return acc;
      }, { individual: 0, duo: 0, collective: 0 });

      const balance = {
        individualSessions: Math.max(0, individual - usageCount.individual),
        duoSessions: Math.max(0, duo - usageCount.duo),
        collectiveSessions: Math.max(0, collective - usageCount.collective),
      };
      console.log('fetchSessionBalance:', { memberId, balance });
      return balance;
    } catch (err) {
      console.error('Error in fetchSessionBalance:', err);
      setError('Erreur lors du calcul des soldes: ' + (err.message || 'Erreur inconnue'));
      return { individualSessions: 0, duoSessions: 0, collectiveSessions: 0 };
    }
  }, []);

  const fetchMembers = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('members').select('id, first_name, last_name, email');
      if (error) throw error;
      setMembers(data);
      console.log('fetchMembers:', data);
    } catch (err) {
      console.error('Error in fetchMembers:', err);
      setError('Erreur lors de la récupération des membres: ' + err.message);
    }
  }, []);

  const fetchBookings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('course_enrollments')
        .select('id, course_id, exceptional_course_id, is_exceptional, member_id, created_at, canceled_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setBookings(data);
      console.log('Bookings fetched:', data);
    } catch (err) {
      console.error('Error in fetchBookings:', err);
      setError('Erreur lors de la récupération des inscriptions: ' + err.message);
    }
  }, []);

  const fetchRegularCourses = useCallback(async (startDate, endDate) => {
    try {
      const { data, error } = await supabase
        .from('courses')
        .select('id, day, time, name, max_slots, date, is_bookable')
        .gte('date', startDate.toISOString())
        .lte('date', endDate.toISOString());
      if (error) throw error;
      console.log('Raw regular courses fetched:', data);
      const mappedCourses = data.map(course => {
        const courseDate = new Date(course.date);
        return {
          ...course,
          date: courseDate,
          maxSlots: course.max_slots ?? 9,
          weekLabel: isSameWeek(courseDate, new Date()) ? 'Cette semaine' : 'Semaine suivante',
          isExceptional: false,
        };
      });
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
        .select('id, date, time, name, max_slots, is_bookable')
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
        is_bookable: course.is_bookable,
      }));
    } catch (err) {
      console.error('Error in fetchExceptionalCourses:', err);
      setError('Erreur lors de la récupération des cours exceptionnels: ' + err.message);
      return [];
    }
  }, [isSameWeek]);

  const generateRecurringCourses = useCallback(async (startDate, endDate) => {
    const recurringCourses = [
      { day: 'Lundi', time: '19:40-20:40', name: 'Renfo/Pilates', max_slots: 9 },
      { day: 'Mardi', time: '17:40-18:40', name: 'Pilates', max_slots: 9 },
      { day: 'Mardi', time: '18:40-19:40', name: 'Pilates', max_slots: 9 },
      { day: 'Mercredi', time: '19:00-20:00', name: 'Cross-training/Cardio', max_slots: 9 },
      { day: 'Jeudi', time: '19:40-20:40', name: 'Pilates', max_slots: 9 },
      { day: 'Samedi', time: '10:30-11:30', name: 'Renfo/Abdos/Stretching', max_slots: 9 },
    ];

    const coursesToInsert = [];
    const weekStart = new Date(startDate);
    const weekEnd = new Date(endDate);

    for (let date = new Date(weekStart); date <= weekEnd; date.setDate(date.getDate() + 1)) {
      const dayName = date.toLocaleDateString('fr-FR', { weekday: 'long' }).replace(/^\w/, c => c.toUpperCase());
      recurringCourses.forEach(course => {
        if (course.day === dayName) {
          const courseDate = new Date(date);
          const [hours, minutes] = course.time.split('-')[0].split(':');
          courseDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
          coursesToInsert.push({
            day: course.day,
            time: course.time,
            name: course.name,
            max_slots: course.max_slots,
            date: courseDate.toISOString(),
            is_bookable: true,
          });
        }
      });
    }

    try {
      const existingCourses = await fetchRegularCourses(startDate, endDate);
      const coursesToInsertFiltered = coursesToInsert.filter(newCourse => 
        !existingCourses.some(existing => 
          existing.day === newCourse.day &&
          existing.time === newCourse.time &&
          existing.name === newCourse.name &&
          new Date(existing.date).toISOString().split('T')[0] === newCourse.date.split('T')[0]
        )
      );

      if (coursesToInsertFiltered.length > 0) {
        const { error } = await supabase.from('courses').insert(coursesToInsertFiltered);
        if (error) throw error;
        console.log('Inserted regular courses:', coursesToInsertFiltered);
      }
    } catch (err) {
      console.error('Error inserting regular courses:', err);
      setError('Erreur lors de l\'insertion des cours réguliers: ' + err.message);
    }
  }, [fetchRegularCourses]);

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
    setAllCourseSchedule([]);
    setCourseSchedule([]);

    const today = new Date();
    const currentWeekStart = new Date(today);
    currentWeekStart.setHours(0, 0, 0, 0);
    currentWeekStart.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
    const weeksToGenerate = 2;
    const endDate = new Date(currentWeekStart);
    endDate.setDate(currentWeekStart.getDate() + weeksToGenerate * 7 - 1);

    console.log('Generating schedule:', { currentWeekStart, endDate });

    try {
      await generateRecurringCourses(currentWeekStart, endDate);

      const allCourses = [];
      const regularCourses = await fetchRegularCourses(currentWeekStart, endDate);
      allCourses.push(...regularCourses);
      const exceptionalCourses = await fetchExceptionalCourses(currentWeekStart, endDate);
      allCourses.push(...exceptionalCourses);

      console.log('All schedules:', allCourses);

      setAllCourseSchedule(allCourses);

      const weekLabel = currentWeekOffset === 0 ? 'Cette semaine' : 'Semaine suivante';
      const filteredSchedule = allCourses.filter(c => c.weekLabel === weekLabel);
      console.log(`Filtered schedule for week (${weekLabel}):`, filteredSchedule);

      setCourseSchedule(filteredSchedule);
      setWeekDates(generateWeekDates(currentWeekStart, currentWeekOffset));
    } catch (err) {
      console.error('Error in generateInitialSchedule:', err);
      setError('Erreur lors de la génération de l\'agenda: ' + err.message);
    } finally {
      setIsAgendaLoading(false);
    }
  }, [fetchRegularCourses, fetchExceptionalCourses, generateRecurringCourses, isSameWeek, generateWeekDates, currentWeekOffset]);

  const createExceptionalCourse = useCallback(async () => {
    if (!newCourse.date || !newCourse.time || !newCourse.name || !newCourse.maxSlots) {
      setError('Tous les champs sont requis.');
      return;
    }

    try {
      const courseDateTime = new Date(`${newCourse.date}T${newCourse.time}:00`);
      if (courseDateTime < new Date()) {
        setError('Impossible de créer un cours dans le passé.');
        return;
      }

      const { data, error } = await supabase
        .from('exceptional_courses')
        .insert({
          date: courseDateTime.toISOString(),
          time: newCourse.time,
          name: newCourse.name,
          max_slots: parseInt(newCourse.maxSlots),
          is_bookable: true,
        })
        .select();
      if (error) throw error;

      setSuccess('Cours exceptionnel créé avec succès !');
      setIsModalOpen(false);
      setNewCourse({ date: '', time: '', name: '', maxSlots: 9 });
      await generateInitialSchedule();
    } catch (err) {
      console.error('Error in createExceptionalCourse:', err);
      setError('Erreur lors de la création du cours: ' + err.message);
    }
  }, [newCourse, generateInitialSchedule]);

  const toggleCourseBookable = useCallback(async (courseId, isExceptional, isBookable) => {
    try {
      const table = isExceptional ? 'exceptional_courses' : 'courses';
      const newStatus = !isBookable;
      const { data, error } = await supabase
        .from(table)
        .update({ is_bookable: newStatus })
        .eq('id', courseId)
        .select();
      if (error) throw error;

      console.log('Course bookable status toggled:', { courseId, isExceptional, newStatus, updatedCourse: data[0] });

      setAllCourseSchedule(prev => prev.map(course => 
        course.id === courseId && course.isExceptional === isExceptional 
          ? { ...course, is_bookable: newStatus } 
          : course
      ));
      setCourseSchedule(prev => prev.map(course => 
        course.id === courseId && course.isExceptional === isExceptional 
          ? { ...course, is_bookable: newStatus } 
          : course
      ));

      setSuccess(`Cours ${isExceptional ? 'exceptionnel' : 'régulier'} ${newStatus ? 'réservable' : 'non réservable'} avec succès !`);
      await generateInitialSchedule();
    } catch (err) {
      console.error('Error in toggleCourseBookable:', err);
      setError(`Erreur lors de la modification du statut réservable du cours: ` + err.message);
    }
  }, [generateInitialSchedule]);

  const enrollMember = useCallback(async (courseId, isExceptional) => {
    console.log('enrollMember called:', { courseId, isExceptional, selectedMember });
    const course = courseSchedule.find(c => c.id === courseId && c.isExceptional === isExceptional);
    if (!course) {
      setError('Cours introuvable.');
      console.error('enrollMember error: Course not found', { courseId, isExceptional, courseSchedule });
      return;
    }
    console.log('Course found:', course);

    if (!course.is_bookable) {
      setError('Ce cours n\'est pas réservable.');
      return;
    }

    if (isPastCourse(course.date)) {
      setError('Impossible de s\'inscrire à un cours passé.');
      return;
    }

    const enrolled = getEnrolledMembers(courseId, isExceptional);
    if (course.maxSlots && enrolled.length >= course.maxSlots) {
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
      const enrollmentData = {
        course_id: isExceptional ? null : courseId,
        exceptional_course_id: isExceptional ? courseId : null,
        is_exceptional: isExceptional,
        member_id: selectedMember,
        created_at: new Date().toISOString(),
      };

      console.log('Enrolling member with data:', enrollmentData);

      const { data, error: enrollError } = await supabase
        .from('course_enrollments')
        .insert(enrollmentData)
        .select();
      if (enrollError) {
        console.error('Supabase enroll error:', enrollError);
        throw enrollError;
      }

      const { error: usageError } = await supabase
        .from('session_usage')
        .insert({
          member_id: selectedMember,
          sale_type: 'collective',
          used_at: new Date().toISOString(),
          enrollment_id: data[0].id,
        });
      if (usageError) {
        console.error('Supabase usage error:', usageError);
        throw usageError;
      }

      setSuccess('Inscription effectuée avec succès ! Une séance a été débitée.');
      setSelectedMember(null);
      await fetchBookings();
    } catch (err) {
      console.error('Error in enrollMember:', err);
      setError('Erreur lors de l\'inscription: ' + (err.message || 'Erreur inconnue'));
    }
  }, [courseSchedule, getEnrolledMembers, fetchSessionBalance, selectedMember, isPastCourse, fetchBookings]);

  const cancelEnrollment = useCallback(async (bookingId) => {
    const booking = bookings.find(b => b.id === bookingId);
    if (!booking) {
      setError('Réservation introuvable.');
      return;
    }

    const course = courseSchedule.find(c => 
      (booking.is_exceptional && c.id === booking.exceptional_course_id) ||
      (!booking.is_exceptional && c.id === booking.course_id)
    );
    if (!course || isPastCourse(course.date)) {
      setError('Impossible d\'annuler une inscription pour un cours passé ou introuvable.');
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
      await fetchBookings();
    } catch (err) {
      console.error('Error in cancelEnrollment:', err);
      setError('Erreur lors de l\'annulation de l\'inscription: ' + err.message);
    }
  }, [bookings, courseSchedule, isPastCourse, fetchBookings]);

  const generateCourseSchedule = useCallback((offset) => {
    const weekLabel = offset === 0 ? 'Cette semaine' : 'Semaine suivante';
    const filteredSchedule = allCourseSchedule.filter(c => c.weekLabel === weekLabel);
    console.log(`Filtered schedule for week (${weekLabel}):`, filteredSchedule);
    setCourseSchedule(filteredSchedule);
    const currentWeekStart = new Date();
    currentWeekStart.setHours(0, 0, 0, 0);
    currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay() + (currentWeekStart.getDay() === 0 ? -6 : 1));
    setWeekDates(generateWeekDates(currentWeekStart, offset));
  }, [allCourseSchedule, generateWeekDates]);

  const prevWeek = useCallback(() => setCurrentWeekOffset(prev => Math.max(0, prev - 1)), []);
  const nextWeek = useCallback(() => {
    const maxOffset = 1;
    setCurrentWeekOffset(prev => Math.min(prev + 1, maxOffset));
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
      <h2 className="text-3xl font-bold mb-6 text-yellow-500 border-b-2 border-yellow-500 pb-2 text-center">
        Gestion des Cours Collectifs
      </h2>
      {error && <p className="text-yellow-500 mb-4">{error}</p>}
      {success && <p className="text-yellow-500 mb-4">{success}</p>}

      <div className="mb-4">
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-500 text-white p-2 rounded-lg hover:bg-blue-600 transition"
        >
          Ajouter un cours exceptionnel
        </button>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg w-full max-w-md">
            <h3 className="text-xl font-bold text-yellow-500 mb-4">Créer un cours exceptionnel</h3>
            <div className="mb-4">
              <label className="block text-white mb-1">Date</label>
              <input
                type="date"
                value={newCourse.date}
                onChange={(e) => setNewCourse({ ...newCourse, date: e.target.value })}
                className="w-full p-2 rounded bg-gray-700 text-white border border-gray-600"
              />
            </div>
            <div className="mb-4">
              <label className="block text-white mb-1">Heure de début (HH:MM)</label>
              <input
                type="time"
                value={newCourse.time}
                onChange={(e) => setNewCourse({ ...newCourse, time: e.target.value })}
                className="w-full p-2 rounded bg-gray-700 text-white border border-gray-600"
              />
            </div>
            <div className="mb-4">
              <label className="block text-white mb-1">Nom du cours</label>
              <input
                type="text"
                value={newCourse.name}
                onChange={(e) => setNewCourse({ ...newCourse, name: e.target.value })}
                className="w-full p-2 rounded bg-gray-700 text-white border border-gray-600"
                placeholder="Ex. Pilates Spécial"
              />
            </div>
            <div className="mb-4">
              <label className="block text-white mb-1">Nombre maximum de places</label>
              <input
                type="number"
                value={newCourse.maxSlots}
                onChange={(e) => setNewCourse({ ...newCourse, maxSlots: e.target.value })}
                min="1"
                className="w-full p-2 rounded bg-gray-700 text-white border border-gray-600"
              />
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setNewCourse({ date: '', time: '', name: '', maxSlots: 9 });
                }}
                className="bg-gray-600 text-white p-2 rounded-lg mr-2 hover:bg-gray-700"
              >
                Annuler
              </button>
              <button
                onClick={createExceptionalCourse}
                className="bg-green-600 text-white p-2 rounded-lg hover:bg-green-700 transition"
              >
                Créer
              </button>
            </div>
          </div>
        </div>
      )}

      {isAgendaLoading ? (
        <p className="text-yellow-500 text-center">Chargement des cours...</p>
      ) : (
        <div className="mb-6">
          <div className="flex justify-between mb-3">
            <button
              onClick={prevWeek}
              className="bg-gray-800 text-white p-2 rounded-lg hover:bg-blue-600 transition border border-blue-600"
              disabled={currentWeekOffset === 0}
            >
              Semaine précédente
            </button>
            <span className="text-lg font-semibold text-yellow-500">
              {currentWeekOffset === 0 ? 'Cette semaine' : 'Semaine suivante'}
            </span>
            <button
              onClick={nextWeek}
              className="bg-gray-800 text-white p-2 rounded-lg hover:bg-blue-600 transition border border-blue-600"
              disabled={currentWeekOffset === 1}
            >
              Semaine suivante
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            {['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'].map(day => {
              const dayCourses = courseSchedule
                .filter(c => c.day === day)
                .sort((a, b) => a.date.getTime() - b.date.getTime());
              const dayDate = weekDates.find(d => d.day === day)?.date;
              return (
                <div key={day} className="flex-1">
                  <h4 className="text-md font-semibold text-yellow-500 mb-3">
                    {day} {dayDate?.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                  </h4>
                  {dayCourses.length > 0 ? (
                    dayCourses.map(course => {
                      const isPast = isPastCourse(course.date);
                      const enrolled = getEnrolledMembers(course.id, course.isExceptional);
                      const colorClass = getCourseColor(course.name);
                      console.log('Rendering course:', { course, isPast, enrolled, canEnroll: !isPast && course.maxSlots && enrolled.length < course.maxSlots && course.is_bookable });
                      return (
                        <div
                          key={course.id}
                          className={`p-3 mb-3 rounded-lg ${colorClass} ${isPast || !course.is_bookable ? 'opacity-50 cursor-not-allowed' : ''} shadow-md hover:shadow-xl transition-all duration-200 border border-blue-600`}
                          style={{ maxWidth: '100%', minHeight: '120px' }}
                        >
                          <div className="flex justify-between items-center">
                            <p className="text-sm font-medium text-gray-900" style={{ overflowWrap: 'break-word', maxWidth: '80%' }}>
                              {course.time} - {course.name} ({enrolled.length}/{course.maxSlots ?? 'N/A'})
                              {course.isExceptional && <span className="ml-2 text-xs text-red-600 font-bold">(Exceptionnel)</span>}
                            </p>
                            {!isPast && (
                              <label className="flex items-center text-xs text-gray-900">
                                Réservable
                                <input
                                  type="checkbox"
                                  checked={course.is_bookable}
                                  onChange={() => toggleCourseBookable(course.id, course.isExceptional, course.is_bookable)}
                                  className="ml-2 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                  disabled={isPast}
                                />
                              </label>
                            )}
                          </div>
                          <p className="text-xs text-gray-700 mt-1" style={{ overflowWrap: 'break-word', maxWidth: '100%' }}>Inscrits :</p>
                          <ul className="list-disc pl-4 text-xs text-gray-800" style={{ overflowWrap: 'break-word', maxWidth: '100%' }}>
                            {enrolled.length > 0 ? (
                              enrolled.map((enroll, index) => (
                                <li key={index} className="flex justify-between items-center" style={{ overflowWrap: 'break-word', maxWidth: '100%' }}>
                                  {enroll.name}
                                  {!isPast && (
                                    <button
                                      onClick={() => cancelEnrollment(bookings.find(b => 
                                        (b.is_exceptional && b.exceptional_course_id === course.id && b.member_id === enroll.id) ||
                                        (!b.is_exceptional && b.course_id === course.id && b.member_id === enroll.id)
                                      )?.id)}
                                      className="ml-auto text-red-600 hover:text-red-800 text-xs font-medium"
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
                          {!isPast && course.maxSlots && enrolled.length < course.maxSlots && course.is_bookable ? (
                            <div className="mt-2">
                              <select
                                value={selectedMember || ''}
                                onChange={(e) => setSelectedMember(e.target.value)}
                                className="w-full p-1 border rounded bg-gray-100 text-gray-900 border-gray-300 mb-2 text-sm"
                                style={{ overflowWrap: 'break-word', maxWidth: '100%' }}
                              >
                                <option value="">Sélectionner un adhérent</option>
                                {members.map((member) => (
                                  <option key={member.id} value={member.id} style={{ overflowWrap: 'break-word', maxWidth: '100%' }}>
                                    {`${member.first_name} ${member.last_name}`}
                                  </option>
                                ))}
                              </select>
                              <button
                                onClick={() => enrollMember(course.id, course.isExceptional)}
                                className="w-full bg-green-600 text-white p-1 rounded-lg hover:bg-green-700 transition text-sm font-medium"
                                disabled={!selectedMember}
                                style={{ overflowWrap: 'break-word', maxWidth: '100%' }}
                              >
                                Inscrire
                              </button>
                            </div>
                          ) : (
                            <p className="text-xs text-gray-500 mt-2">
                              {isPast ? 'Cours terminé' : !course.is_bookable ? 'Cours non réservable' : 'Cours complet ou inscription non disponible'}
                            </p>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-gray-500">Aucun cours prévu ce jour.</p>
                  )}
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