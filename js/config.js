// js/config.js — Environment-aware configurations

// Automatically determine the backend API base URL
// Dev: localhost:3000 -> localhost:8080
// Prod: https://*.netlify.app -> dynamic render URL (or hardcoded production URL)
const getApiBaseUrl = () => {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:8080';
  }
  // TODO: Replace with your actual Render deployment URL or use relative paths if hosted together.
  return 'https://dpt-service.onrender.com';
};

const API_BASE = getApiBaseUrl();

// Expose globally
window.API_BASE = API_BASE;
