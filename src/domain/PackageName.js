export class PackageName {
  /**
   * Creates a new instance of PackageName
   *
   * @param {object} values
   * @param {string} [values.scope];
   * @param {string} values.name;
   * @param {string} [values.version];
   */
  constructor({ scope, name, version }) {
    if (!scope) {
      const { scope: _scope, name: _name } =
        PackageName.extractScopeAndName(name);
      this._scope = _scope;
      this._name = _name;
    } else {
      this._scope = scope;
      this._name = name;
    }
    this._version = version;
  }

  get name() {
    return this._scope ? ["@" + this._scope, this._name].join("/") : this._name;
  }

  get version() {
    return this._version;
  }

  static extractScopeAndName(text = "") {
    if (text.startsWith("@")) {
      const [scope, name] = text.split("/");
      return { scope: scope.slice(1), name };
    }
    return { name: text };
  }
}
