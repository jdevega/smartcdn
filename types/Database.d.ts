export interface DatabaseAdapter {
  initialize(data: Object): Promise<Boolean>;
  get(key: string): Promise<Object>;
  set(key: string, value: any);
  delete(key: string);
  keys(): Promise<string[]>;
  values(): Promise<object[]>;
  exist(key: string): Promise<boolean>;
}
