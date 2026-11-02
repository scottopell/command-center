import { DatabaseSync } from 'node:sqlite';
import { AsyncLocalStorage } from 'node:async_hooks';
import { chmodSync } from 'node:fs';
import { AppError, type JsonValue, type KVOperations, type WorkerKV } from '../../contracts/src/index.ts';

function json(value: unknown): string {
  const seen = new Set<object>();
  function check(v: unknown, depth: number): void {
    if (depth > 100) throw new AppError('validation', 'JSON nesting exceeds 100 levels');
    if (v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) return;
    if (typeof v !== 'object' || seen.has(v as object)) throw new AppError('validation', 'Store values must be finite, acyclic JSON');
    if (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) throw new AppError('validation', 'Store values must be plain JSON');
    seen.add(v as object); for (const item of Object.values(v as object)) check(item, depth + 1); seen.delete(v as object);
  }
  check(value, 0); return JSON.stringify(value);
}

// REQ-BW-005, REQ-BW-006, REQ-BW-012: one serialized connection; callbacks never retry.
export class Store {
  private db: DatabaseSync;
  private tail: Promise<unknown> = Promise.resolve();
  private context = new AsyncLocalStorage<boolean>();
  constructor(file: string) {
    this.db = new DatabaseSync(file);
    if (file !== ':memory:') chmodSync(file, 0o600);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS kv (namespace TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(namespace,key)) STRICT');
  }
  private async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (this.context.getStore()) throw new AppError('internal', 'Use the supplied transaction handle; nesting is not supported');
    const current = this.tail.then(() => this.context.run(true, fn));
    this.tail = current.catch(() => undefined); return current;
  }
  scoped(namespace: string, committed: () => void = () => {}): WorkerKV {
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(namespace)) throw new Error('Invalid worker namespace');
    const ops = (valid: () => void, wrote: () => void): KVOperations => ({
      get: async key => { valid(); const row = this.db.prepare('SELECT value FROM kv WHERE namespace=? AND key=?').get(namespace, key) as { value: string } | undefined; return row ? JSON.parse(row.value) : undefined; },
      put: async (key, value) => { valid(); if (!key || key.length > 1024) throw new AppError('validation', 'Invalid store key'); const encoded = json(value); this.db.prepare('INSERT INTO kv VALUES (?,?,?) ON CONFLICT(namespace,key) DO UPDATE SET value=excluded.value').run(namespace, key, encoded); wrote(); },
      delete: async key => { valid(); this.db.prepare('DELETE FROM kv WHERE namespace=? AND key=?').run(namespace, key); wrote(); },
      list: async (prefix = '') => { valid(); return (this.db.prepare('SELECT key,value FROM kv WHERE namespace=? AND substr(key,1,length(?))=? ORDER BY key').all(namespace, prefix, prefix) as {key:string;value:string}[]).map(r => ({ key: r.key, value: JSON.parse(r.value) as JsonValue })); },
    });
    const run = <T>(fn: (kv: KVOperations) => Promise<T>) => this.exclusive(async () => fn(ops(() => {}, committed)));
    return Object.freeze({
      get: (key: string) => run(kv => kv.get(key)),
      put: (key: string, value: JsonValue) => run(kv => kv.put(key, value)),
      delete: (key: string) => run(kv => kv.delete(key)),
      list: (prefix?: string) => run(kv => kv.list(prefix)),
      transaction: <T>(work: (tx: KVOperations) => Promise<T>) => this.exclusive(async () => {
        let active = true, writes = false, committing = false;
        const tx = ops(() => { if (!active) throw new AppError('internal', 'Transaction handle has expired'); }, () => { writes = true; });
        this.db.exec('BEGIN IMMEDIATE');
        try { const result = await work(tx); committing = true; this.db.exec('COMMIT'); if(writes)committed(); return result; }
        catch (error) { if (this.db.isTransaction) this.db.exec('ROLLBACK'); else if(committing && writes)throw new AppError('outcome_unknown','Commit confirmation failed; inspect persisted records before retrying.'); throw error; }
        finally { active = false; }
      }),
    });
  }
  // REQ-PK-004: only the host maps its historic built-in namespaces once.
  migrateLegacyNamespace(legacy:string,identity:string){
    const count=this.db.prepare('SELECT COUNT(*) AS n FROM kv WHERE namespace=?').get(legacy) as {n:number};
    if(!count.n)return;
    const target=this.db.prepare('SELECT COUNT(*) AS n FROM kv WHERE namespace=?').get(identity) as {n:number};
    if(target.n)throw new Error('Both legacy and identity storage exist; explicit recovery is required');
    this.db.prepare('UPDATE kv SET namespace=? WHERE namespace=?').run(identity,legacy);
  }
  deleteNamespace(namespace:string){this.db.prepare('DELETE FROM kv WHERE namespace=?').run(namespace);}
  close() { this.db.close(); }
}
