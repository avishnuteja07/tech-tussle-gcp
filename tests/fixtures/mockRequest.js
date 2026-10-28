"use strict";

const { Readable } = require("node:stream");
const { EventEmitter } = require("node:events");

function request(app, { method = "GET", url = "/", headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = new Readable({
      read() {
        if (body) {
          this.push(typeof body === "object" ? JSON.stringify(body) : String(body));
        }
        this.push(null);
      },
    });

    req.method = method.toUpperCase();
    req.url = url;
    req.originalUrl = url;
    req.path = url.split("?")[0];
    req.query = Object.fromEntries(new URL(url, "http://localhost").searchParams);
    req.headers = {
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers,
    };
    req.socket = { remoteAddress: "127.0.0.1" };
    req.ip = "127.0.0.1";

    const res = new EventEmitter();
    res.statusCode = 200;
    res._headers = {};
    res.headersSent = false;

    res.setHeader = (key, val) => {
      res._headers[key.toLowerCase()] = val;
    };
    res.set = res.setHeader;
    res.getHeader = (key) => res._headers[key.toLowerCase()];

    res.status = (code) => {
      res.statusCode = code;
      return res;
    };

    let responseData = "";

    res.write = (chunk) => {
      responseData += chunk;
      return true;
    };

    res.cookie = (name, val, opts) => {
      res.setHeader("set-cookie", `${name}=${val}`);
      return res;
    };

    res.clearCookie = (name) => {
      res.setHeader("set-cookie", `${name}=; Max-Age=0`);
      return res;
    };

    res.send = (data) => {
      res.headersSent = true;
      if (typeof data === "object" && !Buffer.isBuffer(data)) {
        responseData = JSON.stringify(data);
      } else {
        responseData = String(data);
      }
      res.emit("finish");
      resolve({
        status: res.statusCode,
        headers: res._headers,
        text: () => Promise.resolve(responseData),
        json: () => Promise.resolve(JSON.parse(responseData || "{}")),
      });
      return res;
    };

    res.json = (data) => {
      res.setHeader("content-type", "application/json");
      return res.send(data);
    };

    res.end = (chunk) => {
      if (chunk) responseData += chunk;
      res.headersSent = true;
      res.emit("finish");
      resolve({
        status: res.statusCode,
        headers: res._headers,
        text: () => Promise.resolve(responseData),
        json: () => Promise.resolve(JSON.parse(responseData || "{}")),
      });
    };

    res.sendFile = (filePath) => {
      res.headersSent = true;
      res.emit("finish");
      resolve({
        status: res.statusCode,
        headers: res._headers,
        text: () => Promise.resolve(`(file:${filePath})`),
        json: () => Promise.resolve({ file: filePath }),
      });
    };

    app(req, res, (err) => {
      if (err) reject(err);
    });
  });
}

module.exports = { request };
