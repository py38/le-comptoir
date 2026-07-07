/* ===== Le Comptoir — interactions ===== */
(function () {
  'use strict';

  /* ---- Preloader ---- */
  window.addEventListener('load', function () {
    var pre = document.getElementById('preloader');
    setTimeout(function () { pre && pre.classList.add('done'); }, 900);
  });

  /* ---- Year ---- */
  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  /* ---- Nav scroll state + progress bar ---- */
  var nav = document.getElementById('nav');
  var progress = document.getElementById('scrollProgress');
  function onScroll() {
    var sc = window.scrollY || document.documentElement.scrollTop;
    if (nav) nav.classList.toggle('scrolled', sc > 60);
    if (progress) {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = (h > 0 ? (sc / h) * 100 : 0) + '%';
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---- Mobile menu ---- */
  var burger = document.getElementById('burger');
  var mobile = document.getElementById('mobileMenu');
  if (burger && mobile) {
    burger.addEventListener('click', function () {
      mobile.classList.toggle('open');
      document.body.style.overflow = mobile.classList.contains('open') ? 'hidden' : '';
    });
    mobile.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        mobile.classList.remove('open');
        document.body.style.overflow = '';
      });
    });
  }

  /* ---- Reveal on scroll ---- */
  var revealEls = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window) {
    var ro = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); ro.unobserve(e.target); }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach(function (el) { ro.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---- Parallax (hero zoom + flagged images) ---- */
  var heroImg = document.getElementById('heroImg');
  var parallaxEls = Array.prototype.slice.call(document.querySelectorAll('[data-parallax]'));
  var ticking = false;
  function parallax() {
    var vh = window.innerHeight;
    if (heroImg) {
      var sc = window.scrollY;
      heroImg.style.transform = 'translateY(' + sc * 0.32 + 'px) scale(1.05)';
    }
    parallaxEls.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) return;
      var speed = parseFloat(el.getAttribute('data-parallax')) || 0.1;
      var offset = (r.top + r.height / 2 - vh / 2) * speed;
      el.style.transform = 'translateY(' + (-offset) + 'px)';
    });
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { window.requestAnimationFrame(parallax); ticking = true; }
  }, { passive: true });
  parallax();

  /* ---- Menu tabs ---- */
  var tabs = document.querySelectorAll('#menuTabs button');
  var panels = document.querySelectorAll('.menu__panel');
  tabs.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.getAttribute('data-tab');
      tabs.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      panels.forEach(function (p) {
        p.classList.toggle('active', p.getAttribute('data-panel') === key);
      });
    });
  });

  /* ---- Lazy autoplay triptych videos when visible ---- */
  var autoVids = document.querySelectorAll('video[data-autoplay]');
  if ('IntersectionObserver' in window) {
    var vo = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var v = e.target;
        if (e.isIntersecting) {
          if (v.preload !== 'auto') v.preload = 'auto';
          var p = v.play();
          if (p && p.catch) p.catch(function () {});
        } else {
          v.pause();
        }
      });
    }, { threshold: 0.4 });
    autoVids.forEach(function (v) { vo.observe(v); });
  }

  /* ---- Reservation form -> WhatsApp ---- */
  var WHATSAPP = '2250798974607'; // numéro du restaurant (format international, sans +)
  var form = document.getElementById('resaForm');
  var err = document.getElementById('resaError');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = form.elements;
      var nom = d.nom.value.trim();
      var tel = d.tel.value.trim();
      var date = d.date.value;
      var heure = d.heure.value;
      var couverts = d.couverts.value;
      var msg = d.message.value.trim();

      if (!nom || !tel || !date || !heure) {
        err.textContent = 'Merci de renseigner votre nom, téléphone, date et heure.';
        return;
      }
      err.textContent = '';

      var dateFr = date;
      try {
        dateFr = new Date(date + 'T00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      } catch (e2) {}

      var text =
        'Bonjour Le Comptoir, je souhaite réserver une table.\n\n' +
        '• Nom : ' + nom + '\n' +
        '• Téléphone : ' + tel + '\n' +
        '• Date : ' + dateFr + '\n' +
        '• Heure : ' + heure + '\n' +
        '• Couverts : ' + couverts +
        (msg ? '\n• Message : ' + msg : '') +
        '\n\nMerci de me confirmer la disponibilité.';

      var url = 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(text);
      window.open(url, '_blank', 'noopener');
    });
  }

  /* =========================================================
     PWA — service worker + installation
     ========================================================= */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }

  var deferredPrompt = null;
  var installBtn = document.getElementById('installBtn');
  var iosHelpBtn = document.getElementById('iosHelpBtn');
  var iosModal = document.getElementById('iosModal');
  var iosClose = document.getElementById('iosClose');
  var installedHint = document.getElementById('installedHint');

  var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  function showInstalled() {
    if (installBtn) installBtn.hidden = true;
    if (iosHelpBtn) iosHelpBtn.hidden = true;
    if (installedHint) installedHint.hidden = false;
  }
  if (isStandalone) showInstalled();

  // iPhone : pas de beforeinstallprompt -> on garde le bouton d'aide, on masque le bouton natif
  if (isIOS && !isStandalone && installBtn) installBtn.hidden = true;
  if (!isIOS && iosHelpBtn) iosHelpBtn.hidden = true;

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.hidden = false;
  });

  if (installBtn) {
    installBtn.addEventListener('click', function () {
      if (!deferredPrompt) {
        if (isIOS) openIos();
        else alert("Ouvrez le menu de votre navigateur puis « Ajouter à l'écran d'accueil » pour installer l'application.");
        return;
      }
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () { deferredPrompt = null; });
    });
  }
  function openIos() { if (iosModal) iosModal.classList.add('open'); }
  function closeIos() { if (iosModal) iosModal.classList.remove('open'); }
  if (iosHelpBtn) iosHelpBtn.addEventListener('click', openIos);
  if (iosClose) iosClose.addEventListener('click', closeIos);
  if (iosModal) iosModal.addEventListener('click', function (e) { if (e.target === iosModal) closeIos(); });
  window.addEventListener('appinstalled', showInstalled);

  /* =========================================================
     COMMANDE — panier -> WhatsApp
     ========================================================= */
  var STORE = 'comptoir_cart_v1';
  var cart = {};
  try { cart = JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e3) { cart = {}; }

  var fab = document.getElementById('cartFab');
  var fabCount = document.getElementById('cartCount');
  var drawer = document.getElementById('cartDrawer');
  var backdrop = document.getElementById('drawerBackdrop');
  var closeBtn = document.getElementById('drawerClose');
  var itemsEl = document.getElementById('cartItems');
  var emptyEl = document.getElementById('cartEmpty');
  var footEl = document.getElementById('cartFoot');
  var totalEl = document.getElementById('cartTotal');
  var sendBtn = document.getElementById('cartSend');
  var modeSel = document.getElementById('cMode');
  var addrWrap = document.getElementById('cAddrWrap');

  function fmt(n) { return n.toLocaleString('fr-FR').replace(/ /g, ' ') + ' F'; }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(cart)); } catch (e4) {} }
  function totalQty() { var t = 0; for (var k in cart) t += cart[k].qty; return t; }
  function totalAmount() { var t = 0; for (var k in cart) t += cart[k].qty * cart[k].price; return t; }
  function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-'); }

  function add(name, price) {
    var id = slug(name);
    if (cart[id]) cart[id].qty++;
    else cart[id] = { name: name, price: price, qty: 1 };
    save(); render();
  }
  function setQty(id, delta) {
    if (!cart[id]) return;
    cart[id].qty += delta;
    if (cart[id].qty <= 0) delete cart[id];
    save(); render();
  }

  function render() {
    var q = totalQty();
    if (fabCount) fabCount.textContent = q;
    if (fab) fab.hidden = q === 0;

    if (!itemsEl) return;
    itemsEl.innerHTML = '';
    var ids = Object.keys(cart);
    if (emptyEl) emptyEl.style.display = ids.length ? 'none' : 'block';
    if (footEl) footEl.hidden = ids.length === 0;

    ids.forEach(function (id) {
      var it = cart[id];
      var row = document.createElement('div');
      row.className = 'citem';
      row.innerHTML =
        '<div class="citem__main">' +
          '<div class="citem__name">' + it.name + '</div>' +
          '<div class="citem__price">' + fmt(it.price) + ' / pièce</div>' +
          '<div class="citem__qty">' +
            '<button data-dec="' + id + '" aria-label="Retirer">−</button>' +
            '<span>' + it.qty + '</span>' +
            '<button data-inc="' + id + '" aria-label="Ajouter">+</button>' +
          '</div>' +
        '</div>' +
        '<div class="citem__line">' + fmt(it.price * it.qty) + '</div>';
      itemsEl.appendChild(row);
    });
    if (totalEl) totalEl.textContent = fmt(totalAmount());
  }

  if (itemsEl) {
    itemsEl.addEventListener('click', function (e) {
      var inc = e.target.getAttribute('data-inc');
      var dec = e.target.getAttribute('data-dec');
      if (inc) setQty(inc, 1);
      if (dec) setQty(dec, -1);
    });
  }

  function openDrawer() { if (drawer) { drawer.classList.add('open'); backdrop.classList.add('open'); document.body.style.overflow = 'hidden'; } }
  function closeDrawer() { if (drawer) { drawer.classList.remove('open'); backdrop.classList.remove('open'); document.body.style.overflow = ''; } }
  if (fab) fab.addEventListener('click', openDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (backdrop) backdrop.addEventListener('click', closeDrawer);
  if (modeSel) modeSel.addEventListener('change', function () {
    if (addrWrap) addrWrap.hidden = modeSel.value !== 'Livraison';
  });

  // Injecter un bouton "Ajouter" sur chaque plat doté d'un prix
  document.querySelectorAll('.menu__panel .dish').forEach(function (dish) {
    var priceEl = dish.querySelector('.dish__price');
    var nameEl = dish.querySelector('h3');
    if (!priceEl || !nameEl) return;
    var price = parseInt(priceEl.textContent.replace(/[^0-9]/g, ''), 10);
    if (!price) return;
    var name = nameEl.textContent.trim();
    var btn = document.createElement('button');
    btn.className = 'dish__add';
    btn.type = 'button';
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg> Ajouter';
    btn.addEventListener('click', function () {
      add(name, price);
      btn.classList.add('added');
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg> Ajouté';
      setTimeout(function () {
        btn.classList.remove('added');
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg> Ajouter';
      }, 1100);
    });
    dish.appendChild(btn);
  });

  if (sendBtn) {
    sendBtn.addEventListener('click', function () {
      if (totalQty() === 0) return;
      var nom = (document.getElementById('cName').value || '').trim();
      var tel = (document.getElementById('cPhone').value || '').trim();
      var mode = modeSel ? modeSel.value : 'À emporter';
      var addr = (document.getElementById('cAddr') && document.getElementById('cAddr').value || '').trim();
      var note = (document.getElementById('cNote') && document.getElementById('cNote').value || '').trim();

      if (!nom || !tel) { alert('Merci d\'indiquer votre nom et votre téléphone.'); return; }
      if (mode === 'Livraison' && !addr) { alert('Merci d\'indiquer l\'adresse de livraison.'); return; }

      var lines = [];
      for (var k in cart) {
        lines.push('• ' + cart[k].qty + ' × ' + cart[k].name + '  —  ' + fmt(cart[k].price * cart[k].qty));
      }
      var text =
        'Bonjour Le Comptoir, je souhaite passer commande.\n\n' +
        lines.join('\n') + '\n\n' +
        'TOTAL : ' + fmt(totalAmount()) + '\n\n' +
        '• Nom : ' + nom + '\n' +
        '• Téléphone : ' + tel + '\n' +
        '• Mode : ' + mode +
        (mode === 'Livraison' ? '\n• Adresse : ' + addr : '') +
        (note ? '\n• Note : ' + note : '') +
        '\n\nJe règlerai par Wave / Orange Money. Merci de me confirmer la commande et de m\'envoyer le numéro de paiement — je renverrai la capture de confirmation.';

      window.open('https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
    });
  }

  // Raccourcis PWA (manifest shortcuts) + ouverture auto
  var params = new URLSearchParams(location.search);
  var action = params.get('action');
  if (action === 'commander') setTimeout(openDrawer, 700);
  if (action === 'reserver') {
    var r = document.getElementById('reserver');
    if (r) setTimeout(function () { r.scrollIntoView(); }, 600);
  }

  render();
})();
