/** @typedef {import('../../types/Database').DatabaseAdapter} DatabaseAdapter*/
/**
 * @class
 * @implements {DatabaseAdapter}
 */

export class MemoryDatabase {
  constructor() {
    this._data = {};
  }

  initialize(data = {}) {
    if (!Object.keys(this._data).length) {
      this._data = data;
      return Promise.resolve(true);
    } else {
      return Promise.reject("Database has been already initialized.");
    }
  }

  async get(key) {
    return this._data[key];
  }

  set(key, value) {
    this._data[key] = { created: Date.now(), ...value, updated: Date.now() };
  }

  delete(key) {
    delete this._data[key];
  }

  keys() {
    return Promise.resolve(Object.keys(this._data));
  }

  values() {
    return Promise.resolve(Object.values(this._data));
  }

  async exist(key) {
    return Promise.resolve((await this.keys()).includes(key));
  }
}
