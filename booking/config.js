/* =========================================================
   Le Comptoir — Configuration réservation
   ---------------------------------------------------------
   MODE RÉEL : renseigne SUPABASE_URL + SUPABASE_ANON_KEY.
   Tant que c'est vide → MODE DÉMO (données locales au navigateur).
   Guide : booking/SETUP.md
   ========================================================= */
window.COMPTOIR_CONFIG = {
  SUPABASE_URL: "https://ntybsfcciudyegvwzfcp.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_HBS-x89dj0M6NtsIPZEzsw_oWgVrOTi",

  RESTAURANT_NAME: "Le Comptoir",
  WHATSAPP: "2250798974607",
  DEMO_ADMIN_PASSWORD: "comptoir2026",

  // Nombre de couverts par défaut proposé chaque jour (modifiable dans l'admin)
  DEFAULT_COVERS_PER_DAY: 60,

  // Pas de temps entre deux horaires de réservation (minutes)
  SLOT_STEP_MIN: 30,
  // Dernière réservation avant la fermeture (minutes)
  LAST_BOOKING_BEFORE_CLOSE_MIN: 60,

  // Horaires d'ouverture (0 = dimanche … 6 = samedi). close "24:00" = minuit.
  OPENING_HOURS: {
    0: { open: "11:00", close: "24:00", closed: false }, // dimanche
    1: { open: "07:30", close: "24:00", closed: false }, // lundi
    2: { open: "07:30", close: "24:00", closed: false }, // mardi
    3: { open: "07:30", close: "24:00", closed: false }, // mercredi
    4: { open: "07:30", close: "24:00", closed: false }, // jeudi
    5: { open: "07:30", close: "24:00", closed: false }, // vendredi
    6: { open: "11:30", close: "24:00", closed: false }  // samedi
  }
};
