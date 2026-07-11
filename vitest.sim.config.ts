// vitest.sim.config.ts
// 밸런스 시뮬레이션 하네스 전용 설정. 일반 유닛테스트와 분리 실행:
//   npm run sim / sim:pvp / sim:single / sim:multi ...
//
// alias: 브라우저/Firebase 의존 모듈을 Node용 mock으로 치환.
//   - config/firebase   → 네트워크 0, 전부 no-op
//   - AuthService       → 항상 로그아웃(오프라인) 상태
//   - DatabaseService   → Firestore 쓰기 전부 no-op
import { defineConfig } from 'vitest/config';
import path from 'path';

const r = (p: string) => path.resolve(__dirname, p);

export default defineConfig({
  resolve: {
    alias: [
      // ^.*: 지정자 전체를 소비해야 '../' 접두어가 남지 않는다.
      // './DatabaseService' 같은 동일 디렉터리 상대 import도 매칭되도록 파일명 기준.
      { find: /^.*[/\\]config[/\\]firebase$/, replacement: r('sim/support/mocks/firebase.ts') },
      { find: /^.*[/\\]AuthService$/, replacement: r('sim/support/mocks/AuthService.ts') },
      { find: /^.*[/\\]DatabaseService$/, replacement: r('sim/support/mocks/DatabaseService.ts') },
    ],
  },
  test: {
    environment: 'node',
    include: ['sim/**/*.sim.ts'],
    setupFiles: ['sim/support/bootstrap.ts'],
    // 시뮬 로그(승률 요약 등)는 사람이 읽는 산출물 — 콘솔 가로채기 비활성화
    disableConsoleIntercept: true,
    silent: false,
    // 몬테카를로 배치가 길 수 있음 — 테스트당 20분 허용
    testTimeout: 1_200_000,
    hookTimeout: 1_200_000,
    // 파일 간 병렬은 유지하되, 파일 내부는 순차(시드 결정론 보호)
    sequence: { concurrent: false },
    // 알려진 버릇: 소스/설정 편집 직후 첫 실행이 "Cannot read properties of undefined
    // (reading 'config')"로 죽을 수 있음(원인 미상, cache:false로도 재현). 두 번째
    // 실행부터 정상 — 측정 전 smoke.sim.ts 1~2회 웜업이 표준 절차.
  },
});
