# Plateforme de réservation — Installation

La plateforme fonctionne en **2 modes** :

- **Mode démo** (par défaut) : aucune configuration. Les réservations sont stockées
  dans le navigateur (localStorage). Parfait pour montrer/tester. Mot de passe admin
  démo : `comptoir2026` (modifiable dans `config.js`).
- **Mode réel** : agenda partagé en temps réel entre le restaurant et tous les clients,
  via **Supabase** (gratuit).

## Passer en mode réel (≈ 10 min)

1. **Créer le projet Supabase**
   - Aller sur https://supabase.com → *New project* (offre gratuite).
   - Noter le mot de passe de la base.

2. **Créer les tables**
   - Dans Supabase : menu **SQL Editor** → *New query*.
   - Copier-coller **tout** le contenu de `schema.sql` → **Run**.

3. **Créer le compte administrateur du restaurant**
   - Menu **Authentication** → *Users* → *Add user* → *Create new user*.
   - Saisir l'email + un mot de passe (c'est ce que le resto utilisera pour se connecter
     sur `admin.html`). Cocher « Auto-confirm user ».

4. **Récupérer les clés**
   - Menu **Project Settings** → *API*.
   - Copier **Project URL** et la clé **anon public**.

5. **Configurer le site**
   - Ouvrir `config.js` et renseigner :
     ```js
     SUPABASE_URL: "https://xxxx.supabase.co",
     SUPABASE_ANON_KEY: "eyJhbGci...",
     ```
   - Enregistrer et redéployer. La plateforme passe automatiquement en mode réel.

## Utilisation

- **Clients** : `booking/reservation.html` (lié au bouton « Réserver » du site).
- **Restaurant** : `booking/admin.html` (lien discret « Espace restaurant » en bas de page).
  - *Agenda & créneaux* : ajouter des créneaux (date, heure, nombre de couverts),
    bloquer/débloquer, supprimer.
  - *Réservations* : voir et annuler les réservations reçues.

## Notes techniques

- La clé *anon public* est faite pour être exposée côté navigateur ; la sécurité est
  assurée par les règles **RLS** définies dans `schema.sql`.
- Les réservations sont **atomiques** (fonction `create_booking`) : pas de surbooking
  même en cas de réservations simultanées.
- La capacité est comptée **en nombre de couverts** par créneau.
- Confirmation **automatique** tant qu'il reste de la place.
