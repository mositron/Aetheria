declare module "ioredis-mock" {
  export default class RedisMock {
    constructor(url?: string | object);
    setex(key: string, seconds: number, value: string): Promise<"OK">;
    get(key: string): Promise<string | null>;
    del(...keys: string[]): Promise<number>;
    set(key: string, value: string, mode?: string, duration?: number): Promise<"OK">;
    on(event: string, cb: (...args: any[]) => void): this;
    quit(): Promise<"OK">;
    [k: string]: any;
  }
}
