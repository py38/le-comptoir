/* =========================================================
   Le Comptoir — Données réservation (modèle par SERVICE)
     • chaque service (Déjeuner, Dîner, 1er/2e service…) a
       ses horaires + sa capacité en couverts
     • surcharges par date (capacité spéciale / fermeture)
     • statut réservation : 'confirmed' (occupe) | 'done' (libéré)
   ========================================================= */
(function () {
  'use strict';
  var cfg = window.COMPTOIR_CONFIG || {};
  var useSupabase = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return ymd(new Date()); }
  function uid() { return 'id' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
  function toMin(t) { var p = String(t).split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function toHM(m) { return pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60); }
  function dow(dateStr) { return new Date(dateStr + 'T00:00').getDay(); }

  /* Créneaux horaires proposés à l'intérieur d'un service */
  function genTimes(svc) {
    var step = cfg.SLOT_STEP_MIN || 30;
    var last = toMin(svc.end_time) - (cfg.LAST_BOOKING_BEFORE_SERVICE_END_MIN || 30);
    var out = [];
    for (var m = toMin(svc.start_time); m <= last; m += step) out.push(toHM(m));
    return out;
  }
  window.ComptoirHours = { genTimes: genTimes };

  /* =======================================================
     MODE DÉMO (localStorage)
     ======================================================= */
  var LS_BOOK = 'comptoir_bookings_v3';
  var LS_SVC = 'comptoir_services_v3';
  var LS_OVR = 'comptoir_overrides_v3';
  var LS_ADMIN = 'comptoir_admin_v1';
  function lsGet(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

  function seedDemo() {
    if (localStorage.getItem(LS_SVC) === null) {
      lsSet(LS_SVC, [
        { id: uid(), name: 'Déjeuner', start_time: '12:00', end_time: '15:00', capacity: 60, weekdays: [0, 1, 2, 3, 4, 5, 6], sort: 1, active: true },
        { id: uid(), name: 'Dîner', start_time: '19:00', end_time: '23:00', capacity: 60, weekdays: [0, 1, 2, 3, 4, 5, 6], sort: 2, active: true }
      ]);
    }
    if (localStorage.getItem(LS_BOOK) === null) lsSet(LS_BOOK, []);
    if (localStorage.getItem(LS_OVR) === null) lsSet(LS_OVR, {});
  }

  function ovrKey(d, s) { return d + '|' + s; }
  function localDayServices(dateStr) {
    var svcs = lsGet(LS_SVC, []).filter(function (s) { return s.active && s.weekdays.indexOf(dow(dateStr)) > -1; });
    var ovr = lsGet(LS_OVR, {});
    var books = lsGet(LS_BOOK, []);
    return svcs.sort(function (a, b) { return (a.sort - b.sort) || (a.start_time < b.start_time ? -1 : 1); }).map(function (s) {
      var o = ovr[ovrKey(dateStr, s.id)] || {};
      // priorité : date précise > jour de semaine > défaut
      var byDay = (s.caps_by_day || {})[String(dow(dateStr))];
      var cap = (typeof o.capacity === 'number') ? o.capacity
              : (typeof byDay === 'number') ? byDay : s.capacity;
      var closed = !!o.closed;
      var booked = books.filter(function (b) { return b.date === dateStr && b.service_id === s.id && b.status === 'confirmed'; })
        .reduce(function (n, b) { return n + b.party_size; }, 0);
      return { service_id: s.id, name: s.name, start_time: s.start_time, end_time: s.end_time,
        capacity: cap, closed: closed, booked: booked, remaining: Math.max(0, cap - booked) };
    });
  }

  var localStore = {
    mode: 'demo',
    getServices: function () { return Promise.resolve(lsGet(LS_SVC, []).slice().sort(function (a, b) { return a.sort - b.sort; })); },
    saveService: function (s) {
      var list = lsGet(LS_SVC, []);
      if (s.id) { list = list.map(function (x) { return x.id === s.id ? Object.assign(x, s) : x; }); }
      else { s.id = uid(); list.push(s); }
      lsSet(LS_SVC, list); notify(); return Promise.resolve({ ok: true });
    },
    deleteService: function (id) { lsSet(LS_SVC, lsGet(LS_SVC, []).filter(function (s) { return s.id !== id; })); notify(); return Promise.resolve({ ok: true }); },
    getDayServices: function (dateStr) { return Promise.resolve(localDayServices(dateStr)); },
    getDaysAvailability: function (a, b) {
      var out = {}, d = new Date(a + 'T00:00'), end = new Date(b + 'T00:00');
      for (; d <= end; d.setDate(d.getDate() + 1)) {
        var ds = ymd(d), svcs = localDayServices(ds);
        out[ds] = { remaining: svcs.reduce(function (n, s) { return n + (s.closed ? 0 : s.remaining); }, 0),
                    closed: svcs.length === 0 || svcs.every(function (s) { return s.closed; }) };
      }
      return Promise.resolve(out);
    },
    setOverride: function (dateStr, serviceId, patch) {
      var ovr = lsGet(LS_OVR, {}); var k = ovrKey(dateStr, serviceId);
      ovr[k] = Object.assign(ovr[k] || {}, patch); lsSet(LS_OVR, ovr); notify(); return Promise.resolve({ ok: true });
    },
    createBooking: function (p) {
      var svcs = localDayServices(p.date);
      var s = svcs.filter(function (x) { return x.service_id === p.serviceId; })[0];
      if (!s) return Promise.resolve({ ok: false, reason: 'Service indisponible ce jour-là.' });
      if (s.closed) return Promise.resolve({ ok: false, reason: 'Service fermé ce jour-là.' });
      if (p.party > s.remaining) return Promise.resolve({ ok: false, reason: 'full', remaining: s.remaining });
      var books = lsGet(LS_BOOK, []);
      var b = { id: uid(), date: p.date, service_id: p.serviceId, time: p.time, party_size: p.party,
        name: p.name, phone: p.phone, note: p.note || '', status: 'confirmed', created_at: new Date().toISOString() };
      books.push(b); lsSet(LS_BOOK, books); notify();
      return Promise.resolve({ ok: true, booking: b });
    },
    /* admin */
    signIn: function (email, pw) {
      if (pw === (cfg.DEMO_ADMIN_PASSWORD || 'comptoir2026')) { sessionStorage.setItem(LS_ADMIN, '1'); return Promise.resolve({ ok: true }); }
      return Promise.resolve({ ok: false, reason: 'Mot de passe incorrect (mode démo).' });
    },
    signOut: function () { sessionStorage.removeItem(LS_ADMIN); return Promise.resolve(); },
    isAdmin: function () { return Promise.resolve(sessionStorage.getItem(LS_ADMIN) === '1'); },
    getBookingsRange: function (a, b) {
      return Promise.resolve(lsGet(LS_BOOK, []).filter(function (x) { return x.date >= a && x.date <= b; })
        .sort(function (m, n) { return (m.date + m.time) < (n.date + n.time) ? -1 : 1; }));
    },
    upcoming: function () {
      var t = today();
      return Promise.resolve(lsGet(LS_BOOK, []).filter(function (b) { return b.date >= t && b.status === 'confirmed'; })
        .sort(function (m, n) { return (m.date + m.time) < (n.date + n.time) ? -1 : 1; }));
    },
    setBookingStatus: function (id, status) {
      var books = lsGet(LS_BOOK, []); books.forEach(function (b) { if (b.id === id) b.status = status; });
      lsSet(LS_BOOK, books); notify(); return Promise.resolve({ ok: true });
    },
    cancelBooking: function (id) { lsSet(LS_BOOK, lsGet(LS_BOOK, []).filter(function (b) { return b.id !== id; })); notify(); return Promise.resolve({ ok: true }); }
  };

  var listeners = [];
  function notify() { listeners.forEach(function (cb) { try { cb(); } catch (e) {} }); }
  window.addEventListener('storage', function (e) { if (e.key === LS_BOOK || e.key === LS_SVC || e.key === LS_OVR) notify(); });
  localStore.onChange = function (cb) { listeners.push(cb); };

  /* =======================================================
     MODE RÉEL (Supabase)
     ======================================================= */
  function makeSupabaseStore() {
    var sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    var cbs = [];
    sb.channel('comptoir')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, function () { cbs.forEach(function (c) { c(); }); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, function () { cbs.forEach(function (c) { c(); }); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_overrides' }, function () { cbs.forEach(function (c) { c(); }); })
      .subscribe();

    return {
      mode: 'live',
      onChange: function (cb) { cbs.push(cb); },
      getServices: function () {
        return sb.from('services').select('*').order('sort').then(function (r) { return r.data || []; });
      },
      saveService: function (s) {
        var row = { name: s.name, start_time: s.start_time, end_time: s.end_time, capacity: s.capacity,
                    weekdays: s.weekdays, caps_by_day: s.caps_by_day || {}, sort: s.sort, active: s.active !== false };
        var q = s.id ? sb.from('services').update(row).eq('id', s.id) : sb.from('services').insert(row);
        return q.then(function (r) { return r.error ? { ok: false, reason: r.error.message } : { ok: true }; });
      },
      deleteService: function (id) {
        return sb.from('services').delete().eq('id', id)
          .then(function (r) { return r.error ? { ok: false, reason: r.error.message } : { ok: true }; });
      },
      getDayServices: function (dateStr) {
        return sb.rpc('day_services', { p_date: dateStr }).then(function (r) { return r.data || []; });
      },
      getDaysAvailability: function (a, b) {
        return sb.rpc('days_availability', { p_from: a, p_to: b }).then(function (r) {
          var out = {}; (r.data || []).forEach(function (x) { out[x.date] = { remaining: x.remaining, closed: x.closed }; });
          return out;
        });
      },
      setOverride: function (dateStr, serviceId, patch) {
        var row = Object.assign({ date: dateStr, service_id: serviceId }, patch);
        return sb.from('service_overrides').upsert(row, { onConflict: 'date,service_id' })
          .then(function (r) { return r.error ? { ok: false, reason: r.error.message } : { ok: true }; });
      },
      createBooking: function (p) {
        return sb.rpc('create_booking', {
          p_date: p.date, p_service: p.serviceId, p_time: p.time, p_party: p.party,
          p_name: p.name, p_phone: p.phone, p_note: p.note || ''
        }).then(function (r) {
          if (r.error) return { ok: false, reason: r.error.message };
          return r.data && r.data.ok ? { ok: true, booking: r.data } : { ok: false, reason: (r.data && r.data.reason) || 'refus', remaining: r.data && r.data.remaining };
        });
      },
      signIn: function (email, pw) {
        return sb.auth.signInWithPassword({ email: email, password: pw })
          .then(function (r) { return r.error ? { ok: false, reason: r.error.message } : { ok: true }; });
      },
      signOut: function () { return sb.auth.signOut(); },
      isAdmin: function () { return sb.auth.getUser().then(function (r) { return !!(r.data && r.data.user); }); },
      getBookingsRange: function (a, b) {
        return sb.from('bookings').select('*').gte('date', a).lte('date', b).order('date').order('time')
          .then(function (r) { return r.data || []; });
      },
      upcoming: function () {
        return sb.from('bookings').select('*').gte('date', today()).eq('status', 'confirmed')
          .order('date').order('time').then(function (r) { return r.data || []; });
      },
      setBookingStatus: function (id, status) {
        return sb.from('bookings').update({ status: status }).eq('id', id)
          .then(function (r) { return r.error ? { ok: false, reason: r.error.message } : { ok: true }; });
      },
      cancelBooking: function (id) {
        return sb.from('bookings').delete().eq('id', id)
          .then(function (r) { return r.error ? { ok: false, reason: r.error.message } : { ok: true }; });
      }
    };
  }

  if (useSupabase) { window.ComptoirStore = makeSupabaseStore(); }
  else { seedDemo(); window.ComptoirStore = localStore; }
  window.ComptoirStore.isDemo = !useSupabase;
})();
