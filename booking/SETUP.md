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
  Ils choisissent une date, une heure (dans les horaires d'ouverture) et le nombre de
  personnes. Confirmation immédiate.
- **Restaurant** : `booking/admin.html` (lien « Espace restaurant » en bas de page).
  - **Agenda type Apple** : vues **Jour / Semaine / Mois / Année**.
  - **Compteur temps réel** : réservations à venir + couverts du jour.
  - **Couverts / jour** : capacité par défaut (modifiable), et surcharge jour par jour
    (ouvrir en vue *Jour* → ajuster ou fermer le jour).
  - Cliquer une réservation → détail + annulation.

## Notes techniques

- La clé *anon public* est faite pour être exposée côté navigateur ; la sécurité est
  assurée par les règles **RLS** définies dans `schema.sql`.
- Réservations **atomiques** (fonction `create_booking` + verrou) : pas de surbooking.
- Capacité **en couverts par jour** ; horaires d'ouverture définis dans `config.js`.
- Confirmation **automatique** tant qu'il reste de la place.
- Mise à jour **temps réel** de l'admin via Supabase Realtime.
