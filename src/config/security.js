"use strict";

const { env } = require("./env");

function cookieValue(req, name) {
  const prefix = `${name}=`;
  const part = (req.headers.cookie || "")
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));
  return part ? decodeURIComponent(part.slice(prefix.length)) : null;
}

function setSessionCookie(res, name, token, maxAgeSeconds) {
  res.cookie(name, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: env.COOKIE_SECURE,
    path: "/",
    maxAge: maxAgeSeconds * 1000,
  });
}

function clearSessionCookie(res, name) {
  res.clearCookie(name, {
    httpOnly: true,
    sameSite: "strict",
    secure: env.COOKIE_SECURE,
    path: "/",
  });
}

function applySecurityHeaders(req, res, next) {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "same-origin");
  if (req.path.startsWith("/api/")) {
    res.set("Cache-Control", "no-store");
  }
  next();
}

module.exports = {
  cookieValue,
  setSessionCookie,
  clearSessionCookie,
  applySecurityHeaders,
};
