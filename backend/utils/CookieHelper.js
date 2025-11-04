import dotenv from "dotenv";
dotenv.config();

const isProd = process.env.NODE_ENV === "production";
const SAME_SITE = "None";

/**
 * 🟩 Set App Cookie (universal)
 */
export function setAppCookie(res, name, value, options = {}) {
  const cookieDomain = isProd ? process.env.COOKIE_DOMAIN : undefined;

  const baseOptions = {
    httpOnly: true,
    secure: true, 
    sameSite: SAME_SITE,
    path: "/",
    ...options,
  };

  if (isProd && cookieDomain) baseOptions.domain = cookieDomain;
  res.cookie(name, value, baseOptions);
}

export function clearAppCookie(res, name, options = {}) {
  const cookieDomain = isProd ? process.env.COOKIE_DOMAIN : undefined;

  const clearOptions = {
    httpOnly: true,
    secure: true, 
    sameSite: SAME_SITE,
    path: "/",
    ...options,
  };

  if (isProd && cookieDomain) clearOptions.domain = cookieDomain;

  res.clearCookie(name, clearOptions);
  res.cookie(name, "", { ...clearOptions, maxAge: 0 });
}

/**
 * 🧹 Clear Multiple Cookies
 */
export function clearMultipleCookies(res, cookieNames = [], options = {}) {
  cookieNames.forEach((name) => clearAppCookie(res, name, options));
}
