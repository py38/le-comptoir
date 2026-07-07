/* =========================================================
   Le Comptoir — Configuration réservation
   ---------------------------------------------------------
   Pour passer en mode RÉEL (agenda partagé entre le resto et
   les clients), crée un projet Supabase gratuit puis colle
   ici l'URL et la clé "anon public". Tant que ces champs
   restent vides, la plateforme tourne en MODE DÉMO local
   (données stockées dans le navigateur, idéal pour montrer
   au client).
   Guide d'installation : voir booking/SETUP.md
   ========================================================= */
window.COMPTOIR_CONFIG = {
  SUPABASE_URL: "",       // ex: "https://xxxx.supabase.co"
  SUPABASE_ANON_KEY: "",  // ex: "eyJhbGci..."

  // Paramètres restaurant
  RESTAURANT_NAME: "Le Comptoir",
  WHATSAPP: "2250798974607",   // pour notifier le resto (optionnel)
  // Mot de passe de l'espace admin en MODE DÉMO uniquement
  // (en mode réel, la connexion se fait par email/mot de passe Supabase)
  DEMO_ADMIN_PASSWORD: "comptoir2026"
};
