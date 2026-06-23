// Define a URL base da API dinamicamente para suportar o Docker ou acessos pela rede Wi-Fi/LAN
export const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`;
