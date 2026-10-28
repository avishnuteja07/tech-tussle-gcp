"use strict";

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function toIsoString(date = new Date()) {
  return (date instanceof Date ? date : new Date(date)).toISOString();
}

module.exports = {
  nowSeconds,
  toIsoString,
};
