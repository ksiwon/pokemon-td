// sim/single/smoke.sim.ts
// 웜업/스모크 — 소스 편집 직후 vitest 첫 실행이 모듈그래프 오염으로 실패하는
// 현상이 있어, 본 측정 전 이 파일을 한 번 돌려 웜업한다. 임포트 체인 무결성도 겸사 확인.
import { describe, it, expect } from 'vitest';
import { runSingleGame } from './runner';
import { PERSONAS } from './botPolicies';
import { writeReport, mdTable, pct, fx } from '../support/report';

describe('smoke: 임포트 체인 무결성', () => {
  it('핵심 모듈 로드', () => {
    expect(typeof runSingleGame).toBe('function');
    expect(Object.keys(PERSONAS).length).toBeGreaterThan(0);
    expect(typeof writeReport).toBe('function');
    expect(pct(0.5, 0)).toBeTruthy();
    expect(fx(1.23, 1)).toBeTruthy();
    expect(mdTable(['a'], [['b']])).toBeTruthy();
  });
});
