/** @typedef {import('../../types/Package').Package} TPackage */
export class Package {
  /**
   * Create a new Package instance
   * @param {TPackage} options
   */
  constructor(options) {
    this.name = options.name;
    this.version = options.version;
    this.created = options.created;
    this.dependencies = options.dependencies;
    this.description = options.description;
    this.license = options.license;
    this.uplink = options.uplink;
    this.author = options.author;
    this.main = options.main;
    this.exports = options.exports || {};
    this.keywords = options.keywords || [];
    this.readme = options.readme;

    this.repository = options.repository?.url || options.homepage;

    /** @type {string[]} */
    this.entryPoints =
      options.entryPoints ||
      // @ts-ignore
      Object.keys(options.exports || [])
        ?.map((exportsKey) => {
          if (!exportsKey.startsWith("./")) return undefined;
          return `${exportsKey.slice(2).replace(":", "_")}.js`;
        })
        .filter((x) => Boolean(x));
  }

  defaultEntryPoint() {
    return this.entryPoints?.[0] || "index.js";
  }

  /**
   * Transform an object to a Package instance
   * @param {object} obj
   * @returns {Package}
   */
  static fromObj(obj) {
    return new Package(obj);
  }
}
