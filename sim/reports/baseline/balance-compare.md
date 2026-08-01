# 밸런스 전후 비교 리포트

생성 기준: sim/reports/current vs sim/reports/baseline

## 표본 크기 대조

| 시뮬 | 단위 | 기준선 | 현재 | 판정 |
| --- | --- | --- | --- | --- |
| `arena-placement` | 시드/배치 | 100 | 100 | ✅ 동일 |
| `engine-cross-validation` | 시드/쌍 | 60 | 60 | ✅ 동일 |
| `multi-runs` | 게임 | 4 | 4 | ✅ 동일 |
| `pvp-matrix` | 시드/쌍 | 40 | 40 | ✅ 동일 |
| `single-runs` | 시드/맵·페르소나 | 10 | 10 | ✅ 동일 |

## 지표 비교

| 시뮬 | 지표 | 기준선 | 현재 | 변화 | 노이즈 바닥 |
| --- | --- | --- | --- | --- | --- |
| `arena-placement` | 배치 민감도(노이즈 보정 σ) | 20.5% | 20.5% | = 0.0%p | — |
| `arena-placement` | 역할배치(탱전열) 효과 | 5.3% | 5.3% | = 0.0%p | — |
| `determinism` | desync 불일치 건수 | 0 | 0 | = 0 | — |
| `determinism` | desync 검사 판수 | 1120 | 1120 | = 0 | — |
| `engine-cross-validation` | 두 전투엔진 승자 일치율 | 92.7% | 92.7% | = 0.0%p | — |
| `engine-cross-validation` | 우세 방향 뒤집힌 쌍 수 | 0 | 0 | = 0 | — |
| `mechanic-parity` | 아레나↔AI서비스 메커닉 드리프트 수 | 0 | 0 | = 0 | — |
| `multi-runs` | 멀티 평균 게임 길이(라운드) | 45 | 45 | = 0 | — |
| `multi-runs` | 멀티 평균 배틀 수 | 53.5 | 53 | ▼ -0.5 | — |
| `multi-runs` | 라이프 손실 중 PvE 비중 | 0.1% | 0.7% | ▲ 0.6%p | — |
| `multi-runs` | 2연패 후 다음 배틀 승률 | 37.9% | 28.4% | ▼ -9.4%p (노이즈 한계 ±13%p 이내) | ±9%p (n=102) |
| `multi-runs` | 멀티 holdout 평균순위 | 3.67 | 4.42 | ▲ 0.75 | — |
| `multi-runs` | 멀티 reroller 평균순위 | 4.38 | 3.5 | ▼ -0.87 | — |
| `multi-runs` | 멀티 worker 평균순위 | 5.25 | 5 | ▼ -0.25 | — |
| `multi-runs` | 멀티 tera 평균순위 | 5 | 4.25 | ▼ -0.75 | — |
| `multi-runs` | 멀티 lossStreaker 평균순위 | 6 | 6.5 | ▲ 0.5 | — |
| `pvp-matrix` | 선공(p1) 승률 (AI매치 공정성) | 50.0% | 50.0% | = 0.0%p | — |
| `pvp-matrix` | 보드 nosyn6 평균승률 | 0.0% | 0.0% | = 0.0%p | — |
| `pvp-matrix` | 보드 water6 평균승률 | 44.3% | 44.3% | = 0.0%p | — |
| `pvp-matrix` | 보드 gen1x6 평균승률 | 42.0% | 42.0% | = 0.0%p | — |
| `pvp-matrix` | 보드 mid4 평균승률 | 36.8% | 36.8% | = 0.0%p | — |
| `pvp-matrix` | 보드 expensive3 평균승률 | 70.7% | 70.7% | = 0.0%p | — |
| `pvp-matrix` | 보드 tank6 평균승률 | 21.6% | 21.6% | = 0.0%p | — |
| `pvp-matrix` | 보드 charizard3 평균승률 | 100.0% | 100.0% | = 0.0%p | — |
| `pvp-matrix` | 보드 charmander3 평균승률 | 84.6% | 84.6% | = 0.0%p | — |
| `single-runs` | 싱글 easiest_straight / holdout 도달웨이브 p50 | 50 | 50 | = 0 | — |
| `single-runs` | 싱글 easiest_straight / holdout 클리어율 | 100.0% | 100.0% | = 0.0%p (노이즈 한계 ±20%p 이내) | ±14%p (n=10) |
| `single-runs` | 싱글 easiest_straight / reroller 도달웨이브 p50 | 50 | 50 | = 0 | — |
| `single-runs` | 싱글 easiest_straight / reroller 클리어율 | 100.0% | 90.0% | ▼ -10.0%p (노이즈 한계 ±24%p 이내) | ±19%p (n=10) |
| `single-runs` | 싱글 easiest_straight / worker 도달웨이브 p50 | 50 | 50 | = 0 | — |
| `single-runs` | 싱글 easiest_straight / worker 클리어율 | 100.0% | 80.0% | ▼ -20.0%p (노이즈 한계 ±27%p 이내) | ±23%p (n=10) |
| `single-runs` | 싱글 easiest_straight / tera 도달웨이브 p50 | 50 | 50 | = 0 | — |
| `single-runs` | 싱글 easiest_straight / tera 클리어율 | 100.0% | 100.0% | = 0.0%p (노이즈 한계 ±20%p 이내) | ±14%p (n=10) |
| `single-runs` | 싱글 easy_loop / holdout 도달웨이브 p50 | 50 | 50 | = 0 | — |
| `single-runs` | 싱글 easy_loop / holdout 클리어율 | 70.0% | 60.0% | ▼ -10.0%p (노이즈 한계 ±36%p 이내) | ±26%p (n=10) |
| `single-runs` | 싱글 easy_loop / reroller 도달웨이브 p50 | 50 | 50 | = 0 | — |
| `single-runs` | 싱글 easy_loop / reroller 클리어율 | 60.0% | 80.0% | ▲ 20.0%p (노이즈 한계 ±34%p 이내) | ±23%p (n=10) |
| `single-runs` | 싱글 easy_loop / worker 도달웨이브 p50 | 22 | 50 | ▲ 28 | — |
| `single-runs` | 싱글 easy_loop / worker 클리어율 | 40.0% | 80.0% | ▲ 40.0%p | ±23%p (n=10) |
| `single-runs` | 싱글 easy_loop / tera 도달웨이브 p50 | 50 | 50 | = 0 | — |
| `single-runs` | 싱글 easy_loop / tera 클리어율 | 70.0% | 60.0% | ▼ -10.0%p (노이즈 한계 ±36%p 이내) | ±26%p (n=10) |
| `single-runs` | 싱글 medium_merge / holdout 도달웨이브 p50 | 11 | 11 | = 0 | — |
| `single-runs` | 싱글 medium_merge / holdout 클리어율 | 0.0% | 0.0% | = 0.0%p (노이즈 한계 ±20%p 이내) | ±14%p (n=10) |
| `single-runs` | 싱글 medium_merge / reroller 도달웨이브 p50 | 11 | 11 | = 0 | — |
| `single-runs` | 싱글 medium_merge / reroller 클리어율 | 0.0% | 0.0% | = 0.0%p (노이즈 한계 ±20%p 이내) | ±14%p (n=10) |
| `single-runs` | 싱글 medium_merge / worker 도달웨이브 p50 | 11 | 10 | ▼ -1 | — |
| `single-runs` | 싱글 medium_merge / worker 클리어율 | 0.0% | 0.0% | = 0.0%p (노이즈 한계 ±20%p 이내) | ±14%p (n=10) |
| `single-runs` | 싱글 medium_merge / tera 도달웨이브 p50 | 12 | 10 | ▼ -2 | — |
| `single-runs` | 싱글 medium_merge / tera 클리어율 | 0.0% | 0.0% | = 0.0%p (노이즈 한계 ±20%p 이내) | ±14%p (n=10) |
| `single-runs` | 싱글 hard_dual_path / holdout 도달웨이브 p50 | 7 | 8 | ▲ 1 | — |
| `single-runs` | 싱글 hard_dual_path / holdout 클리어율 | 0.0% | 0.0% | = 0.0%p (노이즈 한계 ±20%p 이내) | ±14%p (n=10) |
| `single-runs` | 싱글 hard_dual_path / reroller 도달웨이브 p50 | 7 | 8 | ▲ 1 | — |
| `single-runs` | 싱글 hard_dual_path / reroller 클리어율 | 0.0% | 0.0% | = 0.0%p (노이즈 한계 ±20%p 이내) | ±14%p (n=10) |
| `single-runs` | 싱글 hard_dual_path / worker 도달웨이브 p50 | 8 | 7 | ▼ -1 | — |
| `single-runs` | 싱글 hard_dual_path / worker 클리어율 | 0.0% | 0.0% | = 0.0%p (노이즈 한계 ±20%p 이내) | ±14%p (n=10) |
| `single-runs` | 싱글 hard_dual_path / tera 도달웨이브 p50 | 8 | 7 | ▼ -1 | — |
| `single-runs` | 싱글 hard_dual_path / tera 클리어율 | 0.0% | 0.0% | = 0.0%p (노이즈 한계 ±20%p 이내) | ±14%p (n=10) |
| `single-runs` | 싱글 extreme_central / holdout 도달웨이브 p50 | 6 | 6 | = 0 | — |
| `single-runs` | 싱글 extreme_central / holdout 클리어율 | 0.0% | 0.0% | = 0.0%p (노이즈 한계 ±20%p 이내) | ±14%p (n=10) |
| `single-runs` | 싱글 extreme_central / reroller 도달웨이브 p50 | 6 | 6 | = 0 | — |
| `single-runs` | 싱글 extreme_central / reroller 클리어율 | 0.0% | 0.0% | = 0.0%p (노이즈 한계 ±20%p 이내) | ±14%p (n=10) |
| `single-runs` | 싱글 extreme_central / worker 도달웨이브 p50 | 6 | 6 | = 0 | — |
| `single-runs` | 싱글 extreme_central / worker 클리어율 | 0.0% | 0.0% | = 0.0%p (노이즈 한계 ±20%p 이내) | ±14%p (n=10) |
| `single-runs` | 싱글 extreme_central / tera 도달웨이브 p50 | 6 | 6 | = 0 | — |
| `single-runs` | 싱글 extreme_central / tera 클리어율 | 0.0% | 0.0% | = 0.0%p (노이즈 한계 ±20%p 이내) | ±14%p (n=10) |
| `single-runs` | 사다리 easiest_straight 클리어율 | 100.0% | 92.5% | ▼ -7.5%p (노이즈 한계 ±10%p 이내) | ±9%p (n=40) |
| `single-runs` | 사다리 easy_loop 클리어율 | 60.0% | 70.0% | ▲ 10.0%p (노이즈 한계 ±20%p 이내) | ±14%p (n=40) |
| `single-runs` | 사다리 medium_merge 클리어율 | 0.0% | 0.0% | = 0.0%p (노이즈 한계 ±6%p 이내) | ±4%p (n=40) |
| `single-runs` | 사다리 hard_dual_path 클리어율 | 0.0% | 0.0% | = 0.0%p (노이즈 한계 ±6%p 이내) | ±4%p (n=40) |
| `single-runs` | 사다리 extreme_central 클리어율 | 0.0% | 0.0% | = 0.0%p (노이즈 한계 ±6%p 이내) | ±4%p (n=40) |

## 읽는 법

- 싱글 도달웨이브 p50: 목표 밴드(예: medium 35±3)를 정하고 이탈 시 난이도/보상 조정.
- 멀티 게임 길이: 알바 해금(파견 후 5라운드)이 가능하려면 평균 12+라운드 필요.
- PvE 비중: 탈락 원인 축. PvP 밸런스보다 웨이브 난이도가 지배 중이면 여기부터.
- 선공 승률/엔진 일치율: 공정성 지표 — 50%/100%에서 멀수록 구조 문제.
- **노이즈 바닥**: 그 비율 지표가 표본만으로 흔들릴 수 있는 폭(95% Wilson 구간 반폭).
  변화량이 이 안에 있으면 "바뀌었다"고 읽으면 안 된다 — 시드를 늘려야 판정 가능하다.
