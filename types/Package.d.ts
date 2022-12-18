export type Package = {
  name: string;
  version: string;
  created: number;
  entryPoints: string[];
  description: string;
  dependencies: object;
  repository?: { url?: string };
  uplink?: string;
  license: string;
  author: string;
  keywords: string[];
  homepage?: string;
  uplink?: string;
  main?: string;
  exports?: object;
  readme?: string;
};
