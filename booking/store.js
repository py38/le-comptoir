/* =========================================================
   Le Comptoir — Couche de données réservation
   Deux implémentations derrière une même interface :
     • localStore   → MODE DÉMO (localStorage, ce navigateur)
     • supabaseStore→ MODE RÉEL (base partagée)
   Sélection automatique selon la présence des identifiants.
   ========================================================= */
(function () {
  'use strict';
  var cfg = window.COMPTOIR_CONFIG || {};
  var useSupabase = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

  /* ---------- utilitaires ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function todayStr() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function uid() { return 'id' + Math.random().toString(36).slice(2) + Date.now().toString(36); }

  /* =======================================================
     MODE DÉMO (localStorage)
     ======================================================= */
  var LS_SLOTS = 'comptoir_slots_v1';
  var LS_BOOK = 'comptoir_bookings_v1';
  var LS_ADMIN = 'comptoir_admin_v1';

  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)) || []; } catch (e) { return []; } }
  function lsSet(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

  function seedDemo() {
    if (localStorage.getItem(LS_SLOTS) !== null) return;
    var slots = [];
    var base = new Date();
    // Ouvre des créneaux 19h00 / 20h30 / 22h00 pour les 21 prochains jours
    for (var i = 1; i <= 21; i++) {
      var d = new Date(base); d.setDate(base.getDate() + i);
      var ds = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      ['19:00', '20:30', '22:00'].forEach(function (t) {
        slots.push({ id: uid(), date: ds, time: t, capacity: 40, blocked: false });
      });
    }
    lsSet(LS_SLOTS, slots);
    lsSet(LS_BOOK, []);
  }

  var localStore = {
    mode: 'demo',
    booked: function (slotId) {
      return lsGet(LS_BOOK).filter(function (b) { return b.availability_id === slotId; })
        .reduce(function (s, b) { return s + b.party_size; }, 0);
    },
    getSlots: function (dateStr) {
      var self = this;
      var slots = lsGet(LS_SLOTS).filter(function (s) { return s.date === dateStr; });
      return Promise.resolve(slots.map(function (s) {
        var booked = self.booked(s.id);
        return { id: s.id, date: s.date, time: s.time, capacity: s.capacity, blocked: s.blocked,
                 booked: booked, remaining: s.capacity - booked };
      }).sort(function (a, b) { return a.time < b.time ? -1 : 1; }));
    },
    getOpenDates: function () {
      var self = this;
      var map = {};
      lsGet(LS_SLOTS).forEach(function (s) {
        if (s.date < todayStr()) return;
        var booked = self.booked(s.id);
        if (!s.blocked && (s.capacity - booked) > 0) map[s.date] = true;
      });
      return Promise.resolve(map);
    },
    createBooking: function (p) {
      var slots = lsGet(LS_SLOTS);
      var slot = slots.filter(function (s) { return s.id === p.slotId; })[0];
      if (!slot) return Promise.resolve({ ok: false, reason: 'Créneau introuvable' });
      if (slot.blocked) return Promise.resolve({ ok: false, reason: 'Créneau indisponible' });
      var remaining = slot.capacity - this.booked(slot.id);
      if (p.party > remaining) return Promise.resolve({ ok: false, reason: 'Il ne reste que ' + remaining + ' place(s) sur ce créneau.' });
      var books = lsGet(LS_BOOK);
      var b = { id: uid(), availability_id: slot.id, date: slot.date, time: slot.time,
                name: p.name, phone: p.phone, party_size: p.party, note: p.note || '',
                status: 'confirmed', created_at: new Date().toISOString() };
      books.push(b); lsSet(LS_BOOK, books);
      return Promise.resolve({ ok: true, booking: b });
    },
    /* admin */
    signIn: function (email, pw) {
      if (pw === (cfg.DEMO_ADMIN_PASSWORD || 'comptoir2026')) {
        sessionStorage.setItem(LS_ADMIN, '1');
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: false, reason: 'Mot de passe incorrect (mode démo).' });
    },
    signOut: function () { sessionStorage.removeItem(LS_ADMIN); return Promise.resolve(); },
    isAdmin: function () { return Promise.resolve(sessionStorage.getItem(LS_ADMIN) === '1'); },
    addSlot: function (p) {
      var slots = lsGet(LS_SLOTS);
      if (slots.some(function (s) { return s.date === p.date && s.time === p.time; }))
        return Promise.resolve({ ok: false, reason: 'Ce créneau existe déjà.' });
      slots.push({ id: uid(), date: p.date, time: p.time, capacity: p.capacity, blocked: false });
      lsSet(LS_SLOTS, slots);
      return Promise.resolve({ ok: true });
    },
    setBlocked: function (id, blocked) {
      var slots = lsGet(LS_SLOTS);
      slots.forEach(function (s) { if (s.id === id) s.blocked = blocked; });
      lsSet(LS_SLOTS, slots);
      return Promise.resolve({ ok: true });
    },
    deleteSlot: function (id) {
      lsSet(LS_SLOTS, lsGet(LS_SLOTS).filter(function (s) { return s.id !== id; }));
      lsSet(LS_BOOK, lsGet(LS_BOOK).filter(function (b) { return b.availability_id !== id; }));
      return Promise.resolve({ ok: true });
    },
    adminSlots: function () {
      var self = this;
      var slots = lsGet(LS_SLOTS).filter(function (s) { return s.date >= todayStr(); });
      return Promise.resolve(slots.map(function (s) {
        var booked = self.booked(s.id);
        return { id: s.id, date: s.date, time: s.time, capacity: s.capacity, blocked: s.blocked,
                 booked: booked, remaining: s.capacity - booked };
      }).sort(function (a, b) { return (a.date + a.time) < (b.date + b.time) ? -1 : 1; }));
    },
    bookings: function () {
      return Promise.resolve(lsGet(LS_BOOK).slice().sort(function (a, b) {
        return (a.date + a.time) < (b.date + b.time) ? -1 : 1;
      }));
    },
    cancelBooking: function (id) {
      lsSet(LS_BOOK, lsGet(LS_BOOK).filter(function (b) { return b.id !== id; }));
      return Promise.resolve({ ok: true });
    }
  };

  /* =======================================================
     MODE RÉEL (Supabase)
     ======================================================= */
  function makeSupabaseStore() {
    var sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    return {
      mode: 'live',
      getSlots: function (dateStr) {
        return sb.from('slot_availability').select('*').eq('date', dateStr)
          .then(function (r) {
            return (r.data || []).filter(function (s) { return !s.blocked; })
              .sort(function (a, b) { return a.time < b.time ? -1 : 1; });
          });
      },
      getOpenDates: function () {
        return sb.from('slot_availability').select('date,remaining,blocked').gte('date', todayStr())
          .then(function (r) {
            var map = {};
            (r.data || []).forEach(function (s) { if (!s.blocked && s.remaining > 0) map[s.date] = true; });
            return map;
          });
      },
      createBooking: function (p) {
        return sb.rpc('create_booking', {
          p_slot: p.slotId, p_name: p.name, p_phone: p.phone, p_party: p.party, p_note: p.note || ''
        }).then(function (r) {
          if (r.error) return { ok: false, reason: r.error.message };
          return r.data && r.data.ok ? { ok: true, booking: r.data } : { ok: false, reason: (r.data && r.data.reason) || 'Réservation refusée' };
        });
      },
      signIn: function (email, pw) {
        return sb.auth.signInWithPassword({ email: email, password: pw }).then(function (r) {
          return r.error ? { ok: false, reason: r.error.message } : { ok: true };
        });
      },
      signOut: function () { return sb.auth.signOut(); },
      isAdmin: function () { return sb.auth.getUser().then(function (r) { return !!(r.data && r.data.user); }); },
      addSlot: function (p) {
        return sb.from('availability').insert({ date: p.date, time: p.time, capacity: p.capacity })
          .then(function (r) { return r.error ? { ok: false, reason: r.error.message } : { ok: true }; });
      },
      setBlocked: function (id, blocked) {
        return sb.from('availability').update({ blocked: blocked }).eq('id', id)
          .then(function (r) { return r.error ? { ok: false, reason: r.error.message } : { ok: true }; });
      },
      deleteSlot: function (id) {
        return sb.from('availability').delete().eq('id', id)
          .then(function (r) { return r.error ? { ok: false, reason: r.error.message } : { ok: true }; });
      },
      adminSlots: function () {
        return sb.from('slot_availability').select('*').gte('date', todayStr())
          .then(function (r) {
            return (r.data || []).sort(function (a, b) { return (a.date + a.time) < (b.date + b.time) ? -1 : 1; });
          });
      },
      bookings: function () {
        return sb.from('bookings').select('*').order('date', { ascending: true })
          .then(function (r) { return r.data || []; });
      },
      cancelBooking: function (id) {
        return sb.from('bookings').delete().eq('id', id)
          .then(function (r) { return r.error ? { ok: false, reason: r.error.message } : { ok: true }; });
      }
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
