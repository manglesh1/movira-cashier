import { AsYouType, parsePhoneNumberFromString } from "libphonenumber-js/min";

const COUNTRY_ALIASES = new Map([
  ["canada", "CA"], ["ca", "CA"],
  ["united states", "US"], ["united states of america", "US"], ["usa", "US"], ["us", "US"],
  ["united kingdom", "GB"], ["great britain", "GB"], ["uk", "GB"], ["gb", "GB"],
  ["australia", "AU"], ["au", "AU"], ["new zealand", "NZ"], ["nz", "NZ"],
  ["india", "IN"], ["in", "IN"], ["united arab emirates", "AE"], ["uae", "AE"], ["ae", "AE"],
  ["saudi arabia", "SA"], ["sa", "SA"], ["singapore", "SG"], ["sg", "SG"],
  ["mexico", "MX"], ["mx", "MX"], ["germany", "DE"], ["de", "DE"],
  ["france", "FR"], ["fr", "FR"], ["ireland", "IE"], ["ie", "IE"],
]);

export function countryCodeFromLocation(country, fallback = "CA") {
  const value = String(country || "").trim().toLowerCase();
  if (!value) return fallback;
  return COUNTRY_ALIASES.get(value) || (/^[a-z]{2}$/.test(value) ? value.toUpperCase() : fallback);
}

export function parseLocationPhone(value, locationCountry) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = parsePhoneNumberFromString(raw, countryCodeFromLocation(locationCountry));
  return parsed?.isValid() ? parsed : null;
}

export function normalizePhoneNumber(value, locationCountry) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return parseLocationPhone(raw, locationCountry)?.number || raw;
}

export function isValidPhoneNumber(value, locationCountry) {
  return !String(value || "").trim() || Boolean(parseLocationPhone(value, locationCountry));
}

export function formatPhoneNumber(value, locationCountry) {
  const parsed = parseLocationPhone(value, locationCountry);
  if (!parsed) return String(value || "").trim();
  return parsed.country === countryCodeFromLocation(locationCountry)
    ? parsed.formatNational()
    : parsed.formatInternational();
}

export function formatPhoneInput(value, locationCountry) {
  const raw = String(value || "");
  if (!raw) return "";
  return new AsYouType(countryCodeFromLocation(locationCountry)).input(raw);
}
