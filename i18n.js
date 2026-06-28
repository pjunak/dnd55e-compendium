// ═══════════════════════════════════════════════════════════════
//  i18n — vendored per-addon localization helper (identical across the
//  dnd55e-* addons). Mirrors the host's web/js/i18n.js so future languages are
//  PURELY ADDITIVE:
//   • English is the source of truth and is always present (universal fallback).
//   • Resolution mirrors the host: explicit per-user choice
//     (localStorage 'codex_lang', shared with the host) → browser language
//     (primary subtag match) → English.
//   • Lookup falls back PER KEY: active locale → English → the key itself.
//
//  The host exposes NO addon-translation API (AUTHORING.md §4 / invariant #10),
//  so we read the host's shared 'codex_lang' key to follow the user's language
//  automatically. The host re-renders on a language switch, so renderers re-read
//  t() — no listener needed.
//
//  Add a language: create strings/<locale>.js (same flat shape as en.js) and
//  call registerCatalog('<locale>', catalog) in entry.js — nothing else changes.
//  (No-build-step note: catalogs are JS modules — the idiomatic equivalent of
//  the host's fetched /i18n/<locale>.json files.)
//
//  DOM-free safe: localStorage/navigator access is guarded, so this also runs
//  under `node --test`, falling back to English.
// ═══════════════════════════════════════════════════════════════

import en from './strings/en.js';

const LS_KEY = 'codex_lang';
const CATALOGS = { en };

export function registerCatalog(id, catalog) {
  if (id && catalog) CATALOGS[id] = catalog;
}

export function activeLocale() {
  const available = Object.keys(CATALOGS);
  let stored = null;
  try { stored = localStorage.getItem(LS_KEY); } catch (_) {}
  if (stored && available.includes(stored)) return stored;
  let langs = [];
  try {
    langs = (navigator.languages && navigator.languages.length)
      ? navigator.languages
      : (navigator.language ? [navigator.language] : []);
  } catch (_) {}
  for (const tag of langs) {
    const primary = String(tag || '').toLowerCase().split('-')[0];
    if (available.includes(primary)) return primary;
  }
  return 'en';
}

export function t(key, params) {
  const loc = activeLocale();
  let s = CATALOGS[loc] ? CATALOGS[loc][key] : undefined;
  if (s == null) s = CATALOGS.en ? CATALOGS.en[key] : undefined;
  if (s == null) return key;
  if (params == null) return String(s);
  return String(s).replace(/\{(\w+)\}/g, (m, k) =>
    (Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : m));
}
