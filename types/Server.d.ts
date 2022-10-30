import { DatabaseAdapter } from "./Database";

export interface ServerAdapter {
  start(port: number, folder: string): void;
  route(path: string, result: function): void;
  route(path: string, options: object, result: function): void;
  route(
    path: string,
    options: object,
    middlewares: function[],
    result: function
  ): void;
  static(path: string): void;
  redirect(path: string): void;
}

export type ServerOptions = {
  database: DatabaseAdapter;
  packagesFolder: string;
  uplink?: string;
  secure?: boolean;
  redirections?: object;
};
