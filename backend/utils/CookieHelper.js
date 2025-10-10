import dotenv from "dotenv";
dotenv.config();

const isProd = process.env.NODE_ENV === "production";
const SAME_SITE = "None";
/** 
 * Sets a secure cookie with default attributes.
 */
export function setAppCookie(res, name, value, options = {}) {
  const cookieDomain = isProd ? process.env.COOKIE_DOMAIN : undefined;

  const baseOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: SAME_SITE,
    path: "/",
    ...options,
  };

  if (isProd && cookieDomain) baseOptions.domain = cookieDomain;
  if (baseOptions.sameSite === "None" && !baseOptions.secure) {
    baseOptions.secure = true;
  }

  res.cookie(name, value, baseOptions);
}
/**
 * Clears any cookie with the same attributes as setAppCookie.
 */
export function clearAppCookie(res, name, options = {}) {
  const cookieDomain = isProd ? process.env.COOKIE_DOMAIN : undefined;

  const clearOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: SAME_SITE,
    path: "/",
    ...options,
  };

  if (isProd && cookieDomain) clearOptions.domain = cookieDomain;

  res.clearCookie(name, clearOptions);
}
/**
 * Clears multiple cookies at once.
 */
export function clearMultipleCookies(res, cookieNames = [], options = {}) {
  cookieNames.forEach((name) => clearAppCookie(res, name, options));
}
