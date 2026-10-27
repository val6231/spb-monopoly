// Тонкая обёртка над socket.io-client + хранение reconnectToken в localStorage.
import { io } from 'socket.io-client';

const LS_KEY = 'msp-reconnect'; // JSON: { code, token }

export const TOKENS = ['🚗', '🚢', '🐇', '🌂', '⚓', '🚋', '🦅', '🧊'];
export const COLORS = ['#e63946', '#457b9d', '#2a9d8f', '#e9c46a', '#f4a261', '#b5179e', '#4cc9f0', '#8ecae6'];

export function loadSaved() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || null; } catch { return null; }
}
export function saveSaved(v) {
  if (v) localStorage.setItem(LS_KEY, JSON.stringify(v));
  else localStorage.removeItem(LS_KEY);
}

export function makeSocket() {
  return io({ transports: ['websocket', 'polling'] });
}
