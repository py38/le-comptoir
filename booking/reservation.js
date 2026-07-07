/* Le Comptoir — Réservation client */
(function () {
  'use strict';
  var store = window.ComptoirStore;
  if (store.isDemo) { var db = document.getElementById('demoBadge'); if (db) db.hidden = false; }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayStr() { return ymd(new Date()); }
  function frDate(str) {
    var d = new Date(str + 'T00:00');
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  var view = new Date(); view.setDate(1);
  var openDates = {};
  var selectedDate = null;
  var selectedSlot = null;
  var slotsCache = [];

  var elTitle = document.getElementById('calTitle');
  var elDays = document.getElementById('calDays');
  var elPrev = document.getElementById('calPrev');
  var elNext = document.getElementById('calNext');
  var elSlotDate = document.getElementById('slotDate');
  var elSlots = document.getElementById('slotsList');
  var elSlotsEmpty = document.getElementById('slotsEmpty');
  var form = document.getElementById('bkForm');
  var msg = document.getElementById('bkMsg');
  var slotsView = document.getElementById('slotsView');
  var confirmView = document.getElementById('confirmView');

  function renderCalendar() {
    var y = view.getFullYear(), m = view.getMonth();
    elTitle.textContent = view.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    // limiter la navigation au mois courant minimum
    var firstOfThisMonth = new Date(); firstOfThisMonth.setDate(1); firstOfThisMonth.setHours(0, 0, 0, 0);
    elPrev.disabled = (y === firstOfThisMonth.getFullYear() && m === firstOfThisMonth.getMonth());

    var first = new Date(y, m, 1);
    var startOffset = (first.getDay() + 6) % 7; // lundi = 0
    var daysInMonth = new Date(y, m + 1, 0).getDate();
    var html = '';
    for (var i = 0; i < startOffset; i++) html += '<div class="cal-cell empty"></div>';
    for (var d = 1; d <= daysInMonth; d++) {
      var ds = y + '-' + pad(m + 1) + '-' + pad(d);
      var cls = 'cal-cell';
      if (ds < todayStr()) cls += ' past';
      else if (openDates[ds]) cls += ' avail';
      else cls += ' none';
      if (ds === selectedDate) cls += ' selected';
      html += '<div class="' + cls + '" data-date="' + ds + '">' + d + '</div>';
    }
    elDays.innerHTML = html;
  }

  function loadMonth() {
    return store.getOpenDates().then(function (map) { openDates = map; renderCalendar(); });
  }

  elDays.addEventListener('click', function (e) {
    var cell = e.target.closest('.cal-cell');
    if (!cell || !cell.classList.contains('avail')) return;
    selectDate(cell.getAttribute('data-date'));
  });

  elPrev.addEventListener('click', function () { if (elPrev.disabled) return; view.setMonth(view.getMonth() - 1); renderCalendar(); });
  elNext.addEventListener('click', function () { view.setMonth(view.getMonth() + 1); renderCalendar(); });

  function selectDate(ds) {
    selectedDate = ds; selectedSlot = null;
    renderCalendar();
    confirmView.hidden = true; slotsView.hidden = false;
    form.hidden = true; msg.textContent = '';
    elSlotDate.textContent = frDate(ds);
    elSlots.innerHTML = '<span class="bk-empty">Chargement…</span>';
    elSlotsEmpty.hidden = true;
    store.getSlots(ds).then(function (slots) {
      slotsCache = slots;
      if (!slots.length) { elSlots.innerHTML = ''; elSlotsEmpty.hidden = false; return; }
      elSlots.innerHTML = slots.map(function (s) {
        var full = s.remaining <= 0;
        return '<button type="button" class="slot' + (full ? ' full' : '') + '" data-id="' + s.id + '"' + (full ? ' disabled' : '') + '>' +
          s.time.slice(0, 5) + '<small>' + (full ? 'Complet' : s.remaining + ' places') + '</small></button>';
      }).join('');
    });
  }

  elSlots.addEventListener('click', function (e) {
    var b = e.target.closest('.slot');
    if (!b || b.classList.contains('full')) return;
    selectedSlot = b.getAttribute('data-id');
    [].forEach.call(elSlots.querySelectorAll('.slot'), function (s) { s.classList.remove('sel'); });
    b.classList.add('sel');
    form.hidden = false; msg.textContent = '';
    document.getElementById('fName').focus();
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!selectedSlot) { msg.className = 'bk-msg err'; msg.textContent = 'Choisissez un créneau.'; return; }
    var name = document.getElementById('fName').value.trim();
    var phone = document.getElementById('fPhone').value.trim();
    var party = parseInt(document.getElementById('fParty').value, 10) || 2;
    var note = document.getElementById('fNote').value.trim();
    if (!name || !phone) { msg.className = 'bk-msg err'; msg.textContent = 'Nom et téléphone requis.'; return; }

    var btn = document.getElementById('bkSubmit');
    btn.disabled = true; msg.className = 'bk-msg'; msg.textContent = 'Traitement…';
    var slot = slotsCache.filter(function (s) { return s.id === selectedSlot; })[0];

    store.createBooking({ slotId: selectedSlot, name: name, phone: phone, party: party, note: note })
      .then(function (r) {
        btn.disabled = false;
        if (!r.ok) { msg.className = 'bk-msg err'; msg.textContent = r.reason || 'Réservation impossible.'; selectDate(selectedDate); return; }
        showConfirm({ date: selectedDate, time: slot ? slot.time : '', name: name, party: party });
      });
  });

  function showConfirm(info) {
    slotsView.hidden = true; confirmView.hidden = false;
    document.getElementById('recap').innerHTML =
      '<div><span>Date</span><span>' + frDate(info.date) + '</span></div>' +
      '<div><span>Heure</span><span>' + (info.time ? info.time.slice(0, 5) : '') + '</span></div>' +
      '<div><span>Au nom de</span><span>' + info.name + '</span></div>' +
      '<div><span>Personnes</span><span>' + info.party + '</span></div>';
    openDates = {}; loadMonth(); // rafraîchir les dispos
  }

  document.getElementById('againBtn').addEventListener('click', function () {
    confirmView.hidden = true; slotsView.hidden = false;
    selectedSlot = null; form.reset(); form.hidden = true;
    elSlotDate.textContent = 'Sélectionnez une date'; elSlots.innerHTML = ''; elSlotsEmpty.hidden = true;
    selectedDate = null; renderCalendar();
  });

  loadMonth();
})();
