/* Teilen per Link: die komplette Auslegung (Werte + Kurve + Presets) als
   base64url-kodiertes JSON im URL-Fragment (#s=…). Fragment statt Query,
   damit der Zustand nicht in Server-Logs landet und statisches Hosting
   ohne Serverlogik auskommt. */

import { state, applyData, persist } from './state.js';

/* btoa/atob arbeiten auf Latin-1 — über TextEncoder/TextDecoder bleiben
   auch Umlaute in String-Feldern (künftige Presets o. ä.) verlustfrei. */
export function encodeShare(data) {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeShare(str) {
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
}

/* URL der aktuellen Seite mit dem aktuellen Zustand im Fragment. */
export function shareURL() {
  const data = {
    values: state.values, curve: state.curve, curveGen: state.curveGen,
    machine: state.machine, alloy: state.alloy, part: state.part
  };
  const u = new URL(location.href);
  u.hash = 's=' + encodeShare(data);
  return u.href;
}

/* Beim Seitenstart aufrufen (vor dem Aufbau der Eingaben): einen
   Share-Link übernehmen, persistieren und aus der URL entfernen — sonst
   würde ein Reload spätere Änderungen wieder überschreiben.
   Liefert true, wenn ein Link übernommen wurde. */
export function consumeShareLink() {
  const m = location.hash.match(/[#&]s=([A-Za-z0-9_-]+)/);
  if (!m) return false;
  try {
    applyData(decodeShare(m[1]));
    persist();
  } catch (e) {
    console.warn('Share-Link konnte nicht gelesen werden — er wird ignoriert.', e);
    return false;
  } finally {
    history.replaceState(null, '', location.pathname + location.search);
  }
  return true;
}
