export const API_URL = window.location.hostname === 'localhost' 
  ? 'http://192.168.1.107:8087' 
  : `http://${window.location.hostname}:8087`;

