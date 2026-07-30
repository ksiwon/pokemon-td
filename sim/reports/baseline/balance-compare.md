# 밸런스 전후 비교 리포트

생성 기준: sim/reports/current vs sim/reports/baseline

## 표본 크기 대조

| 시뮬 | 단위 | 기준선 | 현재 | 판정 |
| --- | --- | --- | --- | --- |
| `multi-runs` | 게임 | 2 | 4 | ⚠️ 불일치 |
| `pvp-matrix` | 시드/쌍 | 40 | 40 | ✅ 동일 |
| `single-runs` | 시드/맵·페르소나 | 3 | 10 | ⚠️ 불일치 |

> ⚠ **표본 크기가 기준선과 다릅니다** — `multi-runs` (게임: 기준선 2 vs 현재 4), `single-runs` (시드/맵·페르소나: 기준선 3 vs 현재 10).
> 아래 변화량에는 코드 변화와 표본 변화가 섞여 있습니다. 같은 조건으로 다시 돌리거나 기준선을 갱신하세요.

## 지표 비교

| 시뮬 | 지표 | 기준선 | 현재 | 변화 | 노이즈 바닥 |
| --- | --- | --- | --- | --- | --- |
| `arena-placement` | 배치 민감도(무작위 스프레드) | 64.6% | 66.7% | ▲ 2.1%p | — |
| `arena-placement` | 역할배치(탱전열) 효과 | 6.3% | 8.3% | ▲ 2.1%p | — |
| `engine-cross-validation` | 두 전투엔진 승자 일치율 | 78.6% | 80.5% | ▲ 2.0%p | — |
| `engine-cross-validation` | 우세 방향 뒤집힌 쌍 수 | 5 | 4 | ▼ -1 | — |
| `multi-runs` | 멀티 평균 게임 길이(라운드) | 45 | 45 | = 0 | — |
| `multi-runs` | 멀티 평균 배틀 수 | 49 | 53.5 | ▲ 4.5 | — |
| `multi-runs` | 라이프 손실 중 PvE 비중 | 6.2% | 0.1% | ▼ -6.1%p | — |
| `multi-runs` | 2연패 후 다음 배틀 승률 | 25.6% | 37.9% | ▲ 12.3%p (노이즈 한계 ±16%p 이내) | ±9%p (n=103) |
| `multi-runs` | 멀티 holdout 평균순위 | 4.17 | 3.67 | ▼ -0.5 | — |
| `multi-runs` | 멀티 reroller 평균순위 | 5.5 | 4.38 | ▼ -1.12 | — |
| `multi-runs` | 멀티 worker 평균순위 | 5 | 5.25 | ▲ 0.25 | — |
| `multi-runs` | 멀티 tera 평균순위 | 2.5 | 5 | ▲ 2.5 | — |
| `multi-runs` | 멀티 lossStreaker 평균순위 | 5 | 6 | ▲ 1 | — |
| `pvp-matrix` | 선공(p1) 승률 (AI매치 공정성) | 55.0% | 50.4% | ▼ -4.6%p | — |
| `pvp-matrix` | 보드 nosyn6 평균승률 | 22.3% | 8.4% | ▼ -13.9%p | — |
| `pvp-matrix` | 보드 water6 평균승률 | 10.2% | 20.7% | ▲ 10.5%p | — |
| `pvp-matrix` | 보드 gen1x6 평균승률 | 16.4% | 39.5% | ▲ 23.0%p | — |
| `pvp-matrix` | 보드 mid4 평균승률 | 37.0% | 24.5% | ▼ -12.5%p | — |
| `pvp-matrix` | 보드 expensive3 평균승률 | 65.7% | 70.7% | ▲ 5.0%p | — |
| `pvp-matrix` | 보드 tank6 평균승률 | 62.7% | 50.9% | ▼ -11.8%p | — |
| `pvp-matrix` | 보드 charizard3 평균승률 | 100.0% | 100.0% | = 0.0%p | — |
| `pvp-matrix` | 보드 charmander3 평균승률 | 85.7% | 85.4% | ▼ -0.4%p | — |
| `single-runs` | 싱글 easiest_straight / holdout 도달웨이브 p50 | 50 | 50 | = 0 | — |
| `single-runs` | 싱글 easiest_straight / holdout 클리어율 | 100.0% | 100.0% | = 0.0%p (노이즈 한계 ±31%p 이내) | ±14%p (n=10) |
| `single-runs` | 싱글 easiest_straight / reroller 도달웨이브 p50 | 50 | 50 | = 0 | — |
| `single-runs` | 싱글 easiest_straight / reroller 클리어율 | 100.0% | 100.0% | = 0.0%p (노이즈 한계 ±31%p 이내) | ±14%p (n=10) |
| `single-runs` | 싱글 easiest_straight / worker 도달웨이브 p50 | 50 | 50 | = 0 | — |
| `single-runs` | 싱글 easiest_straight / worker 클리어율 | 100.0% | 100.0% | = 0.0%p (노이즈 한계 ±31%p 이내) | ±14%p (n=10) |
| `single-runs` | 싱글 easiest_straight / tera 도달웨이브 p50 | 50 | 50 | = 0 | — |
| `single-runs` | 싱글 easiest_straight / tera 클리어율 | 100.0% | 100.0% | = 0.0%p (노이즈 한계 ±31%p 이내) | ±14%p (n=10) |
| `single-runs` | 싱글 easy_loop / holdout 도달웨이브 p50 | 50 | 50 | = 0 | — |
| `single-runs` | 싱글 easy_loop / holdout 클리어율 | 100.0% | 70.0% | ▼ -30.0%p (노이즈 한계 ±37%p 이내) | ±25%p (n=10) |
| `single-runs` | 싱글 easy_loop / reroller 도달웨이브 p50 | 50 | 50 | = 0 | — |
| `single-runs` | 싱글 easy_loop / reroller 클리어율 | 100.0% | 60.0% | ▼ -40.0%p | ±26%p (n=10) |
| `single-runs` | 싱글 easy_loop / worker 도달웨이브 p50 | 50 | 22 | ▼ -28 | — |
| `single-runs` | 싱글 easy_loop / worker 클리어율 | 66.7% | 40.0% | ▼ -26.7%p (노이즈 한계 ±45%p 이내) | ±26%p (n=10) |
| `single-runs` | 싱글 easy_loop / tera 도달웨이브 p50 | 50 | 50 | = 0 | — |
| `single-runs` | 싱글 easy_loop / tera 클리어율 | 66.7% | 70.0% | ▲ 3.3%p (노이즈 한계 ±44%p 이내) | ±25%p (n=10) |
| `single-runs` | 싱글 medium_merge / holdout 도달웨이브 p50 | 21 | 11 | ▼ -10 | — |
| `single-runs` | 싱글 medium_merge / holdout 클리어율 | 33.3% | 0.0% | ▼ -33.3%p (노이즈 한계 ±39%p 이내) | ±14%p (n=10) |
| `single-runs` | 싱글 medium_merge / reroller 도달웨이브 p50 | 12 | 11 | ▼ -1 | — |
| `single-runs` | 싱글 medium_merge / reroller 클리어율 | 33.3% | 0.0% | ▼ -33.3%p (노이즈 한계 ±39%p 이내) | ±14%p (n=10) |
| `single-runs` | 싱글 medium_merge / worker 도달웨이브 p50 | 44 | 11 | ▼ -33 | — |
| `single-runs` | 싱글 medium_merge / worker 클리어율 | 33.3% | 0.0% | ▼ -33.3%p (노이즈 한계 ±39%p 이내) | ±14%p (n=10) |
| `single-runs` | 싱글 medium_merge / tera 도달웨이브 p50 | 44 | 12 | ▼ -32 | — |
| `single-runs` | 싱글 medium_merge / tera 클리어율 | 33.3% | 0.0% | ▼ -33.3%p (노이즈 한계 ±39%p 이내) | ±14%p (n=10) |
| `single-runs` | 싱글 hard_dual_path / holdout 도달웨이브 p50 | 8 | 7 | ▼ -1 | — |
| `single-runs` | 싱글 hard_dual_path / holdout 클리어율 | 0.0% | 0.0% | = 0.0%p (노이즈 한계 ±31%p 이내) | ±14%p (n=10) |
| `single-runs` | 싱글 hard_dual_path / reroller 도달웨이브 p50 | 7 | 7 | = 0 | — |
| `single-runs` | 싱글 hard_dual_path / reroller 클리어율 | 0.0% | 0.0% | = 0.0%p (노이즈 한계 ±31%p 이내) | ±14%p (n=10) |
| `single-runs` | 싱글 hard_dual_path / worker 도달웨이브 p50 | 8 | 8 | = 0 | — |
| `single-runs` | 싱글 hard_dual_path / worker 클리어율 | 0.0% | 0.0% | = 0.0%p (노이즈 한계 ±31%p 이내) | ±14%p (n=10) |
| `single-runs` | 싱글 hard_dual_path / tera 도달웨이브 p50 | 8 | 8 | = 0 | — |
| `single-runs` | 싱글 hard_dual_path / tera 클리어율 | 0.0% | 0.0% | = 0.0%p (노이즈 한계 ±31%p 이내) | ±14%p (n=10) |
| `single-runs` | 싱글 extreme_central / holdout 도달웨이브 p50 | 6 | 6 | = 0 | — |
| `single-runs` | 싱글 extreme_central / holdout 클리어율 | 0.0% | 0.0% | = 0.0%p (노이즈 한계 ±31%p 이내) | ±14%p (n=10) |
| `single-runs` | 싱글 extreme_central / reroller 도달웨이브 p50 | 6 | 6 | = 0 | — |
| `single-runs` | 싱글 extreme_central / reroller 클리어율 | 0.0% | 0.0% | = 0.0%p (노이즈 한계 ±31%p 이내) | ±14%p (n=10) |
| `single-runs` | 싱글 extreme_central / worker 도달웨이브 p50 | 6 | 6 | = 0 | — |
| `single-runs` | 싱글 extreme_central / worker 클리어율 | 0.0% | 0.0% | = 0.0%p (노이즈 한계 ±31%p 이내) | ±14%p (n=10) |
| `single-runs` | 싱글 extreme_central / tera 도달웨이브 p50 | 6 | 6 | = 0 | — |
| `single-runs` | 싱글 extreme_central / tera 클리어율 | 0.0% | 0.0% | = 0.0%p (노이즈 한계 ±31%p 이내) | ±14%p (n=10) |
| `single-runs` | 사다리 easiest_straight 클리어율 | 100.0% | 100.0% | = 0.0%p | ±4%p (n=40) |
| `single-runs` | 사다리 easy_loop 클리어율 | 83.3% | 60.0% | ▼ -23.3%p | ±15%p (n=40) |
| `single-runs` | 사다리 medium_merge 클리어율 | 33.3% | 0.0% | ▼ -33.3%p | ±4%p (n=40) |
| `single-runs` | 사다리 hard_dual_path 클리어율 | 0.0% | 0.0% | = 0.0%p | ±4%p (n=40) |
| `single-runs` | 사다리 extreme_central 클리어율 | 0.0% | 0.0% | = 0.0%p | ±4%p (n=40) |

## 읽는 법

- 싱글 도달웨이브 p50: 목표 밴드(예: medium 35±3)를 정하고 이탈 시 난이도/보상 조정.
- 멀티 게임 길이: 알바 해금(파견 후 5라운드)이 가능하려면 평균 12+라운드 필요.
- PvE 비중: 탈락 원인 축. PvP 밸런스보다 웨이브 난이도가 지배 중이면 여기부터.
- 선공 승률/엔진 일치율: 공정성 지표 — 50%/100%에서 멀수록 구조 문제.
- **노이즈 바닥**: 그 비율 지표가 표본만으로 흔들릴 수 있는 폭(95% Wilson 구간 반폭).
  변화량이 이 안에 있으면 "바뀌었다"고 읽으면 안 된다 — 시드를 늘려야 판정 가능하다.
