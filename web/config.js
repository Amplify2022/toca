window.TOCA_CONFIG = window.TOCA_CONFIG || {};
// The app always uses the real API. Override apiUrl only for a separate API host.
// Locally it defaults to http://localhost:8080; elsewhere to this origin.
// Public marketing links only. Never put API secrets here.
window.TOCA_CONFIG.marketing = Object.assign({
  appStoreUrl: '',
  playStoreUrl: '',
  publicUrl: '', // Public web URL used by the download QR; defaults to this origin.
  socials: {
    instagram: 'https://www.instagram.com/tocamusicapp/',
    facebook: 'https://www.facebook.com/1465919206597325',
    x: '', tiktok: '', linkedin: '' // Official profile URLs enable the footer links.
  }
}, window.TOCA_CONFIG.marketing || {});
