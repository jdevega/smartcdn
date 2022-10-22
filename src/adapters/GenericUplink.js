import http from "node:http";
import https from "node:https";
import fetch from "node-fetch";

export class GenericUplink {
  constructor(host) {
    this._host = host;

    this._httpAgent = new http.Agent({
      keepAlive: true,
    });
    this._httpsAgent = new https.Agent({
      keepAlive: true,
      rejectUnauthorized: false,
    });
  }

  get host() {
    return this._host;
  }

  async get({ scope, name, version, file }) {
    const scopedName = this.scopedName(scope, name);
    const fileURL = `${this._host}/${scopedName}/${version}/${file}`;
    const response = await fetch(fileURL, {
      agent: ({ protocol }) =>
        protocol === "http:" ? this._httpAgent : this._httpsAgent,
    });
    if (!response.ok) throw Error(`[error] File not found ${fileURL} .`);
    return response.buffer();
  }

  scopedName(scope, name) {
    return scope ? [scope.replace("@", ""), name].join("_") : name;
  }

  parseScopedName(value) {
    return !value.includes("_") ? value : "@" + value.replace("_", "/");
  }
}
