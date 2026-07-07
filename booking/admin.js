/* Le Comptoir — Espace admin restaurant */
(function () {
  'use strict';
  var store = window.ComptoirStore;
  var demo = store.isDemo;
  if (demo) {
    document.getElementById('demoBadge').hidden = false;
    document.getElementById('emailWrap').hidden = true;              // pas d'email en démo
    document.getElementById('loginHint').textContent = 'Mode démo — mot de passe : ' + (window.COMPTOIR_CONFIG.DEMO_ADMIN_PASSWORD || 'comptoir2026');
  }

  var loginView = document.getElementById('loginView');
  var dashView = document.getElementById('dashView');
  var logoutBtn = document.getElementById('logoutBtn');

  function frDate(str) { return new Date(str + 'T00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }); }

  function showDash() {
    loginView.hidden = true; dashView.hidden = false; logoutBtn.hidden = false;
    loadSlots(); loadBookings();
  }
  function showLogin() { loginView.hidden = false; dashView.hidden = true; logoutBtn.hidden = true; }

  store.isAdmin().then(function (ok) { if (ok) showDash(); });

  document.getElementById('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = (document.getElementById('admEmail').value || '').trim();
    var pw = document.getElementById('admPw').value;
    var m = document.getElementById('loginMsg'); m.className = 'bk-msg'; m.textContent = 'Connexion…';
    store.signIn(email, pw).then(function (r) {
      if (r.ok) { m.textContent = ''; showDash(); }
      else { m.className = 'bk-msg err'; m.textContent = r.reason || 'Échec de connexion.'; }
    });
  });

  logoutBtn.addEventListener('click', function () { store.signOut().then(showLogin); });

  /* tabs */
  var tabs = document.querySelectorAll('.adm-tabs button');
  tabs.forEach(function (b) {
    b.addEventListener('click', function () {
      tabs.forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      document.querySelectorAll('.adm-panel').forEach(function (p) {
        p.classList.toggle('active', p.getAttribute('data-panel') === b.getAttribute('data-tab'));
      });
    });
  });

  /* ---- Agenda ---- */
  var addForm = document.getElementById('addForm');
  addForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var date = document.getElementById('sDate').value;
    var time = document.getElementById('sTime').value;
    var cap = parseInt(document.getElementById('sCap').value, 10);
    var m = document.getElementById('addMsg'); m.className = 'bk-msg';
    if (!date || !time || !cap) { m.className = 'bk-msg err'; m.textContent = 'Renseignez date, heure et couverts.'; return; }
    m.textContent = 'Ajout…';
    store.addSlot({ date: date, time: time, capacity: cap }).then(function (r) {
      if (r.ok) { m.className = 'bk-msg ok'; m.textContent = 'Créneau ajouté ✓'; loadSlots(); }
      else { m.className = 'bk-msg err'; m.textContent = r.reason || 'Erreur.'; }
    });
  });

  function loadSlots() {
    store.adminSlots().then(function (slots) {
      var body = document.getElementById('slotsBody');
      document.getElementById('slotsEmpty').hidden = slots.length > 0;
      body.innerHTML = slots.map(function (s) {
        return '<tr class="' + (s.blocked ? 'blocked' : '') + '">' +
          '<td data-l="Date">' + frDate(s.date) + '</td>' +
          '<td data-l="Heure">' + s.time.slice(0, 5) + '</td>' +
          '<td data-l="Couverts">' + s.capacity + '</td>' +
          '<td data-l="Réservés">' + s.booked + '</td>' +
          '<td data-l="Restant">' + s.remaining + '</td>' +
          '<td data-l="État">' + (s.blocked ? '<span class="pill">Bloqué</span>' : '<span class="pill">Ouvert</span>') + '</td>' +
          '<td data-l="Actions">' +
            '<button class="mini" data-block="' + s.id + '" data-v="' + (s.blocked ? '0' : '1') + '">' + (s.blocked ? 'Débloquer' : 'Bloquer') + '</button>' +
            '<button class="mini danger" data-del="' + s.id + '">Supprimer</button>' +
          '</td></tr>';
      }).join('');
    });
  }

  document.getElementById('slotsBody').addEventListener('click', function (e) {
    var blk = e.target.getAttribute('data-block');
    var del = e.target.getAttribute('data-del');
    if (blk) { store.setBlocked(blk, e.target.getAttribute('data-v') === '1').then(loadSlots); }
    if (del) { if (confirm('Supprimer ce créneau et ses réservations ?')) store.deleteSlot(del).then(function () { loadSlots(); loadBookings(); }); }
  });

  /* ---- Réservations ---- */
  function loadBookings() {
    store.bookings().then(function (list) {
      var body = document.getElementById('resaBody');
      document.getElementById('resaEmpty').hidden = list.length > 0;
      body.innerHTML = list.map(function (b) {
        return '<tr>' +
          '<td data-l="Date">' + frDate(b.date) + '</td>' +
          '<td data-l="Heure">' + (b.time || '').slice(0, 5) + '</td>' +
          '<td data-l="Client">' + esc(b.name) + '</td>' +
          '<td data-l="Téléphone">' + esc(b.phone) + '</td>' +
          '<td data-l="Pers.">' + b.party_size + '</td>' +
          '<td data-l="Note">' + (b.note ? esc(b.note) : '—') + '</td>' +
          '<td data-l=""><button class="mini danger" data-cancel="' + b.id + '">Annuler</button></td>' +
          '</tr>';
      }).join('');
    });
  }

  document.getElementById('resaBody').addEventListener('click', function (e) {
    var id = e.target.getAttribute('data-cancel');
    if (id && confirm('Annuler cette réservation ?')) store.cancelBooking(id).then(function () { loadBookings(); loadSlots(); });
  });

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
})();
