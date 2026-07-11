// sim/support/bootstrap.ts
// vitest setupFile — 모든 sim 테스트 파일보다 먼저 실행된다.
// src/* 모듈이 브라우저 전제(localStorage/alert)를 갖고 있으므로 import 전에 폴리필 설치.

import * as fs from 'fs';
import * as path from 'path';
import { installHttpCache } from './httpCache';

// ── 1. localStorage 폴리필 (인메모리) ────────────────────────────────────────
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  key(i: number) { return Array.from(this.map.keys())[i] ?? null; }
  removeItem(k: string) { this.map.delete(k); }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
}

if (typeof (globalThis as any).localStorage === 'undefined') {
  (globalThis as any).localStorage = new MemoryStorage();
}
if (typeof (globalThis as any).alert === 'undefined') {
  (globalThis as any).alert = () => {};
}

// ── 2. 언어 고정(ko) — pokeapi 캐시 키가 언어를 포함하므로 결정론에 필요 ───────
localStorage.setItem('language', 'ko');

// ── 3. 종족값 fixture 주입 ───────────────────────────────────────────────────
// prefetch가 만든 stat-cache/weighted-list를 localStorage에 미리 넣는다.
// pokeAPI 싱글턴은 첫 import 시 constructor에서 이 키를 읽어 복원하므로
// (= preloadRarities가 네트워크 없이 즉시 완료) 반드시 import보다 먼저 실행돼야 한다.
const FIXTURE_DIR = path.resolve(__dirname, '../fixtures');
const statFixture = path.join(FIXTURE_DIR, 'stat-cache.json');
const weightedFixture = path.join(FIXTURE_DIR, 'weighted-list.json');

if (fs.existsSync(statFixture)) {
  localStorage.setItem('pokeapi_stat_cache_v2', fs.readFileSync(statFixture, 'utf8'));
}
if (fs.existsSync(weightedFixture)) {
  localStorage.setItem('pokeapi_weighted_list_v3', fs.readFileSync(weightedFixture, 'utf8'));
}

// ── 4. HTTP 디스크 캐시 설치 (기본 offline — 네트워크 0 보장) ─────────────────
installHttpCache();

// ── 5. 프로덕션 코드의 디버그 로그 소음 억제 (시뮬 리포트 가독성) ──────────────
const NOISY_PREFIXES = ['[GameManager]', '[WaveSystem]', '[PokeAPI]', '[MS]', '[firebase]'];
const origLog = console.log.bind(console);
console.log = (...args: any[]) => {
  const first = typeof args[0] === 'string' ? args[0] : '';
  if (NOISY_PREFIXES.some(p => first.startsWith(p))) return;
  origLog(...args);
};

export {};
