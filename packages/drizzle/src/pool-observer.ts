import type { Pool } from "pg";

export type DatabasePool = Pool;

type PoolObserver = (pool: DatabasePool) => void;

const observers: PoolObserver[] = [];
const openPools = new Set<DatabasePool>();

export function observeDatabasePools(observer: PoolObserver): void {
  observers.push(observer);
  for (const pool of openPools) observer(pool);
}

export function announcePool(pool: DatabasePool): DatabasePool {
  openPools.add(pool);
  for (const observer of observers) observer(pool);

  return pool;
}

export function retirePool(pool: DatabasePool): void {
  openPools.delete(pool);
}
