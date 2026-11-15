window.TOCA_CONFIG = window.TOCA_CONFIG || {};
// Public marketing links only. Never put API secrets here.
window.TOCA_CONFIG.marketing = Object.assign({
  appStoreUrl: '',
  playStoreUrl: '',
  publicUrl: '', // Public web URL used by the download QR; defaults to this origin.
  socials: {
    instagram: 'https://www.instagram.com/tocamusicapp/',
    facebook: 'https://www.facebook.com/1465919206597325',
    tiktok: '', x: '', linkedin: ''
  }
}, window.TOCA_CONFIG.marketing || {});
