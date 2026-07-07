/* =========================================================
   Le Comptoir — Données réservation (modèle par JOUR)
     • capacité en couverts / jour (défaut + surcharges)
     • horaires d'ouverture → créneaux horaires
     • temps réel (Supabase Realtime / évènement storage)
   ========================================================= */
(function () {
  'use strict';
  var cfg = window.COMPTOIR_CONFIG || {};
  var useSupabase = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

  /* ---------- helpers date / heure ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return ymd(new Date()); }
  function uid() { return 'id' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
  function toMin(t) { var p = t.split(':'); return (+p[0]) * 60 + (+p[1]); }
  function toHM(m) { return pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60); }
  function weekday(dateStr) { return new Date(dateStr + 'T00:00').getDay(); }

  var HOURS = cfg.OPENING_HOURS || {};
  function openingFor(dateStr) { return HOURS[weekday(dateStr)] || { open: '12:00', close: '23:00', closed: true }; }
  function weekdayClosed(dateStr) { return !!openingFor(dateStr).closed; }
  function genTimes(dateStr) {
    var o = openingFor(dateStr);
    if (o.closed) return [];
    var step = cfg.SLOT_STEP_MIN || 30;
    var last = toMin(o.close) - (cfg.LAST_BOOKING_BEFORE_CLOSE_MIN || 60);
    var out = [];
    for (var m = toMin(o.open); m <= last; m += step) out.push(toHM(m));
    return out;
  }
  window.ComptoirHours = { openingFor: openingFor, genTimes: genTimes, weekdayClosed: weekdayClosed };

  var DEFAULT_CAP = cfg.DEFAULT_COVERS_PER_DAY || 60;

  /* =======================================================
     MODE DÉMO (localStorage)
     ======================================================= */
  var LS_BOOK = 'comptoir_bookings_v2';
  var LS_DAYS = 'comptoir_daysettings_v2';
  var LS_SET = 'comptoir_settings_v2';
  var LS_ADMIN = 'comptoir_admin_v1';
  function lsGet(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

  function seedDemo() {
    if (localStorage.getItem(LS_BOOK) !== null) return;
    var books = [];
    var base = new Date();
    function addDays(n) { var d = new Date(base); d.setDate(base.getDate() + n); return ymd(d); }
    var demo = [
      { d: 1, t: '20:00', p: 4, n: 'Awa Koné' }, { d: 1, t: '20:30', p: 2, n: 'Yann Diomandé' },
      { d: 2, t: '13:00', p: 6, n: 'Groupe Bamba' }, { d: 2, t: '21:00', p: 2, n: 'Sarah T.' },
      { d: 3, t: '19:30', p: 8, n: 'Anniversaire Kouassi' }, { d: 5, t: '20:00', p: 3, n: 'M. Traoré' },
      { d: 6, t: '12:30', p: 2, n: 'Adjoua' }, { d: 6, t: '21:30', p: 5, n: 'Team Orange' }
    ];
    demo.forEach(function (x) {
      books.push({ id: uid(), date: addDays(x.d), time: x.t, party_size: x.p, name: x.n,
        phone: '07 00 00 00 00', note: '', status: 'confirmed', created_at: new Date().toISOString() });
    });
    lsSet(LS_BOOK, books);
    lsSet(LS_DAYS, {});
    lsSet(LS_SET, { defaultCapacity: DEFAULT_CAP });
  }

  function localBooked(dateStr) {
    return lsGet(LS_BOOK, []).filter(function (b) { return b.date === dateStr; })
      .reduce(function (s, b) { return s + b.party_size; }, 0);
  }
  function localCapacity(dateStr) {
    var days = lsGet(LS_DAYS, {}); var s = lsGet(LS_SET, {});
    var def = (s && s.defaultCapacity) || DEFAULT_CAP;
    if (days[dateStr] && typeof days[dateStr].capacity === 'number') return days[dateStr].capacity;
    return def;
  }
  function localClosed(dateStr) {
    var days = lsGet(LS_DAYS, {});
    if (days[dateStr] && typeof days[dateStr].closed === 'boolean') return days[dateStr].closed;
    return weekdayClosed(dateStr);
  }
  function localDayInfo(dateStr) {
    var closed = localClosed(dateStr);
    var cap = localCapacity(dateStr);
    var booked = localBooked(dateStr);
    return { date: dateStr, capacity: cap, booked: booked, remaining: closed ? 0 : Math.max(0, cap - booked),
      closed: closed, isOpenDay: !weekdayClosed(dateStr) };
  }

  var localStore = {
    mode: 'demo',
    getDefaultCapacity: function () { return Promise.resolve((lsGet(LS_SET, {}).defaultCapacity) || DEFAULT_CAP); },
    setDefaultCapacity: function (n) { var s = lsGet(LS_SET, {}); s.defaultCapacity = n; lsSet(LS_SET, s); notify(); return Promise.resolve({ ok: true }); },
    getDayInfo: function (dateStr) { return Promise.resolve(localDayInfo(dateStr)); },
    getRangeInfo: function (a, b) {
      var out = {}; var d = new Date(a + 'T00:00'), end = new Date(b + 'T00:00');
      for (; d <= end; d.setDate(d.getDate() + 1)) { var ds = ymd(d); out[ds] = localDayInfo(ds); }
      return Promise.resolve(out);
    },
    getBookingsRange: function (a, b) {
      return Promise.resolve(lsGet(LS_BOOK, []).filter(function (x) { return x.date >= a && x.date <= b; })
        .sort(function (m, n) { return (m.date + m.time) < (n.date + n.time) ? -1 : 1; }));
    },
    createBooking: function (p) {
      var info = localDayInfo(p.date);
      if (info.closed) return Promise.resolve({ ok: false, reason: 'Le restaurant est fermé ce jour-là.' });
      if (p.party > info.remaining) return Promise.resolve({ ok: false, reason: 'Il ne reste que ' + info.remaining + ' couvert(s) pour cette date.' });
      var books = lsGet(LS_BOOK, []);
      var b = { id: uid(), date: p.date, time: p.time, party_size: p.party, name: p.name, phone: p.phone,
        note: p.note || '', status: 'confirmed', created_at: new Date().toISOString() };
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
    setDayCapacity: function (dateStr, cap) { var days = lsGet(LS_DAYS, {}); days[dateStr] = days[dateStr] || {}; days[dateStr].capacity = cap; lsSet(LS_DAYS, days); notify(); return Promise.resolve({ ok: true }); },
    setDayClosed: function (dateStr, closed) { var days = lsGet(LS_DAYS, {}); days[dateStr] = days[dateStr] || {}; days[dateStr].closed = closed; lsSet(LS_DAYS, days); notify(); return Promise.resolve({ ok: true }); },
    bookings: function () {
      return Promise.resolve(lsGet(LS_BOOK, []).slice().sort(function (a, b) { return (a.date + a.time) < (b.date + b.time) ? -1 : 1; }));
    },
    cancelBooking: function (id) { lsSet(LS_BOOK, lsGet(LS_BOOK, []).filter(function (b) { return b.id !== id; })); notify(); return Promise.resolve({ ok: true }); }
  };

  /* évènement temps réel (démo : autres onglets via 'storage', + notif locale) */
  var listeners = [];
  function notify() { listeners.forEach(function (cb) { try { cb(); } catch (e) {} }); }
  window.addEventListener('storage', function (e) { if (e.key === LS_BOOK || e.key === LS_DAYS || e.key === LS_SET) notify(); });
  localStore.onChange = function (cb) { listeners.push(cb); };

  /* =======================================================
     MODE RÉEL (Supabase)
     ======================================================= */
  function makeSupabaseStore() {
    var sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    var cbs = [];
    var defCap = DEFAULT_CAP; // capacité par défaut du resto (chargée depuis settings)
    function loadDef() { return sb.from('settings').select('value').eq('key', 'default_capacity').maybeSingle().then(function (r) { if (r.data) defCap = parseInt(r.data.value, 10) || DEFAULT_CAP; return defCap; }); }
    loadDef();
    sb.channel('rt-comptoir')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, function () { cbs.forEach(function (f) { f(); }); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'day_settings' }, function () { cbs.forEach(function (f) { f(); }); })
      .subscribe();

    function dayInfoFrom(row, dateStr) {
      var closed = row && typeof row.closed === 'boolean' ? row.closed : weekdayClosed(dateStr);
      var cap = row && typeof row.capacity === 'number' ? row.capacity : defCap;
      var booked = row && typeof row.booked === 'number' ? row.booked : 0;
      return { date: dateStr, capacity: cap, booked: booked, remaining: closed ? 0 : Math.max(0, cap - booked), closed: closed, isOpenDay: !weekdayClosed(dateStr) };
    }
    return {
      mode: 'live',
      onChange: function (cb) { cbs.push(cb); },
      getDefaultCapacity: function () { return loadDef(); },
      setDefaultCapacity: function (n) {
        return sb.from('settings').upsert({ key: 'default_capacity', value: String(n) })
          .then(function (r) { if (!r.error) defCap = n; return r.error ? { ok: false, reason: r.error.message } : { ok: true }; });
      },
      getDayInfo: function (dateStr) {
        return sb.from('day_availability').select('*').eq('date', dateStr).maybeSingle()
          .then(function (r) { return dayInfoFrom(r.data, dateStr); });
      },
      getRangeInfo: function (a, b) {
        return sb.from('day_availability').select('*').gte('date', a).lte('date', b).then(function (r) {
          var map = {}; (r.data || []).forEach(function (row) { map[row.date] = dayInfoFrom(row, row.date); });
          var d = new Date(a + 'T00:00'), end = new Date(b + 'T00:00');
          for (; d <= end; d.setDate(d.getDate() + 1)) { var ds = ymd(d); if (!map[ds]) map[ds] = dayInfoFrom(null, ds); }
          return map;
        });
      },
      getBookingsRange: function (a, b) {
        return sb.from('bookings').select('*').gte('date', a).lte('date', b).order('date').order('time')
          .then(function (r) { return r.data || []; });
      },
      createBooking: function (p) {
        return sb.rpc('create_booking', { p_date: p.date, p_time: p.time, p_party: p.party, p_name: p.name, p_phone: p.phone, p_note: p.note || '' })
          .then(function (r) {
            if (r.error) return { ok: false, reason: r.error.message };
            return r.data && r.data.ok ? { ok: true, booking: r.data } : { ok: false, reason: (r.data && r.data.reason) || 'Réservation refusée' };
          });
      },
      signIn: function (email, pw) { return sb.auth.signInWithPassword({ email: email, password: pw }).then(function (r) { return r.error ? { ok: false, reason: r.error.message } : { ok: true }; }); },
      signOut: function () { return sb.auth.signOut(); },
      isAdmin: function () { return sb.auth.getUser().then(function (r) { return !!(r.data && r.data.user); }); },
      setDayCapacity: function (dateStr, cap) { return sb.from('day_settings').upsert({ date: dateStr, capacity: cap }).then(function (r) { return r.error ? { ok: false, reason: r.error.message } : { ok: true }; }); },
      setDayClosed: function (dateStr, closed) { return sb.from('day_settings').upsert({ date: dateStr, closed: closed }).then(function (r) { return r.error ? { ok: false, reason: r.error.message } : { ok: true }; }); },
      bookings: function () { return sb.from('bookings').select('*').order('date').order('time').then(function (r) { return r.data || []; }); },
      cancelBooking: function (id) { return sb.from('bookings').delete().eq('id', id).then(function (r) { return r.error ? { ok: false, reason: r.error.message } : { ok: true }; }); }
    };
  }

  if (useSupabase) {
    window.ComptoirStore = makeSupabaseStore();
  } else {
    seedDemo();
    window.ComptoirStore = localStore;
  }
  window.ComptoirStore.isDemo = !useSupabase;
})();
