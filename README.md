# Le Comptoir — Bar &amp; Restaurant · Abidjan

Site web + application (PWA) haut de gamme pour **Le Comptoir**, bar &amp; restaurant situé à l'Ivoire Trade Center (ITC), Abidjan, Côte d'Ivoire.

## ✦ Fonctionnalités
- Site vitrine luxe one-page (effets de scroll, parallax, animations)
- Carte / menu complet en onglets
- **Réservation** → WhatsApp (message pré-rempli)
- **Commande en ligne** (panier) → WhatsApp, paiement Wave / Orange Money
- Galerie **Événements**
- **PWA installable** (icône sur l'écran d'accueil, mode hors-ligne, service worker)

## 🛠️ Stack
HTML / CSS / JavaScript statiques — aucune dépendance, aucun build.

## ▶️ Lancer en local
```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

## 📁 Structure
```
index.html          Page unique
styles.css          Styles
script.js           Interactions (nav, panier, PWA, parallax…)
sw.js               Service worker (offline + cache)
manifest.webmanifest
assets/img          Photos & icônes
assets/video        Vidéos
```

## 📞 Infos restaurant
Ivoire Trade Center, Abidjan · Tél. 07 98 97 46 07
