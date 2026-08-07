# 🛡️ Pokemon Aegis (포켓몬 타워 디펜스)

1세대부터 9세대까지, **1025마리의 모든 포켓몬**이 등장하는 차세대 웹 기반 전략 타워 디펜스 게임입니다.

싱글 플레이의 깊이 있는 전략, 멀티 플레이의 숨막히는 실시간 PvP 배틀, 그리고 카드 수집 오토배틀까지 — 세 가지 방식으로 즐기세요.

---

## ✨ 핵심 기능

### 📖 스토리 모드 (Story Mode)
- **시나리오 기반 전개**: 포켓몬스터 세계관을 바탕으로 구성된 챕터와 스테이지 라인업
- **몰입감 있는 연출**: 스테이지 진입 전후 타이핑 애니메이션이 적용된 시나리오 대사 출력
- **특별한 클리어 보상**: 스테이지 클리어에 따른 다음 진행 해금 및 특수 보상 제공

### 🎮 타워 디펜스 및 핵심 플레이
- **자유 배치 전략**: 격자 어디에나 자유롭게 타워를 배치 (길·입출구 3칸 keepout 등 최소 규칙만). 맵의 개성은 특수 타일이 담당
- **테라스탈 타일**: 점유한 타워에 맵별 고정 테라 타입 부여 — 자속(원래 타입과 일치 시 최대 ×2.0) 및 방어 상성 변환. 위치는 5웨이브마다 순환
- **알바(Part-time) 칸 2종**: 포켓몬을 올려두면 근무 웨이브 누적으로 시설이 등급업 (공격·경험치는 중단)
  - **프렌들리숍(🏪)**: 지닌도구 상점 해금 (Lv1~3)
  - **콘테스트 홀(🎀)**: 포켓몬 상점의 고레어도 등장 확률 상승
  - **회수 규칙**: 근무 중엔 이동·판매·합체가 잠긴다. 푸는 방법은 두 가지 —
    **5·10·15웨이브 마일스톤 모달**에서 회수를 고르거나, **누적 15웨이브(최고 등급)** 이후
    시설 모달의 *회수하기* 버튼으로 언제든(웨이브 사이) 빼는 것. 회수를 고르면 배치 모드로
    넘어가 원하는 빈 칸을 직접 찍는다. **근무 타일을 벗어나면 누적 웨이브는 0으로 초기화**된다
    (빼서 싸우고 다시 꽂는 무손실 운용 방지)
  - ⚠️ 알바는 **싱글/스토리 전용**이다. 멀티플레이(TFT식 PvP)에는 시설 타일 자체가 없다
- **지닌도구 시스템**: 일회성 열매/딜 증가/피흡 등 12종 지닌도구를 인벤토리로 관리하고 웨이브 사이 자유 장착·교체·회수
- **완벽한 포켓몬 구현**: PokeAPI 기반 실제 종족값, 타입 상성(18종), 특성(5종), 기술 구현
- **레어도 시스템**: 종족값 총합 기준 6단계 (Bronze / Silver / Gold / Diamond / Master / Legend)
- **상태이상**: 화상, 독, 마비, 냉동, 잠듦, 혼란 6종 — 적과 아군 모두 적용
- **진화 & 성장**: 레벨업 진화, 돌/친밀도/통신 등 아이템 진화(상점), **메가진화(48종)**, **거다이맥스(31종)**, **합체(6종)**
- **로그라이크 요소**: 매 웨이브 종료 후 **스킬 선택(Skill Picker)** 및 **아이템 보상(WaveEndPicker)** 제공
- **시너지 시스템**: TFT 스타일의 타입(18종) × 세대(9세대) × 특수 조합(23종) 삼중 시너지 효과

### 🃏 미니 포켓 (Mini Pocket) — Pocket TCG 감성 오토배틀, TD 본편과 독립
- **스타터 지급**: 첫 진입 시 카드 6장 + 기본 덱 + 코인을 지급해 바로 플레이 가능 (0장 데드락 방지)
- **카드 수집**: 코인·별조각으로 팩을 개봉해 **1025종 전부(진화형 포함)를 개별 카드로** 수집 — 이상해씨·이상해풀·이상해꽃이 각각 다른 카드. 레어도는 **각 종족값 기준**(리자몽=희귀·강함)이라 라벨=실제 전투력이 일치. 천장·최소 보장 포함. *(본편 TD 상점은 기존대로 베이스폼만 판매 — 카드 전용 추첨 풀로 분리)*
  - **일반 팩**(100코인): 기본 추첨 · **타입 팩**(300코인): **원하는 타입 선택 → 그 타입만 5장** · **고급 팩**(50별조각): 고레어 확률↑·Gold 이상 보장
- **별 합성**: 같은 카드 중복 시 별 등급 상승(중복 2장=★+1, 최대 ★5, TFT식), 5성 초과 중복은 레어도별 코인 환급. 파워 성장 = **좋은 카드 수집(레어=강함) + 별업** 두 축
- **도감**: 카드 클릭 시 진짜 포켓몬 도감식 상세(번호·분류·타입·설명·종족값 막대·별 반영 전투스탯·키/몸무게). **정렬(번호/레어도/별/최근/이름)·타입·레어도 필터·이름/번호 검색** 지원 (덱 편성 풀에도 동일)
- **덱 편성**: 6칸(전열 3 / 후열 3) 덱에 타입 시너지(2/4/6 브레이크포인트, 1.1/1.3/1.5×)를 실시간 확인하며 구성
- **트레이너 타워**: PvE 층별 자동 전투 아레나(배속·스킵·시드 결정론). 전열 보호 + 관통 시너지(비행/고스트). **난이도 곡선 = 초반 매우 쉬움 → 층마다 완만 상승**(스타터 덱 ~10층, 덱을 키울수록 더 높이)
- **경제 설계**: 미니 포켓 내부 수급(타워)은 **소액**, 큰 재화는 **싱글/멀티**에서 — 오토배틀 전에 본편·멀티를 플레이하도록 유도 (타워 한 층 ~10–50코인 ≪ 멀티 1판 최대 300 ≪ 싱글 완주 ~740)
- **완전 분리 저장**: 카드 데이터는 `pokemon-td-cards-v1` LocalStorage에 별도 저장 — TD 본편 세이브/업적에 **0 영향**. 보상은 웨이브·맵/스토리 클리어·멀티 결과·업적 달성 시 지급

### 🧠 포켓몬 퀴즈 (Pokémon Quiz) — PokeAPI 소재 지식 퀴즈, 본편과 독립
- **15개 종목 + 수능 모의고사**: 한 판에 풀 **문항 수(10 / 30 / 50, 기본값 30)** 를 화면 최상단에서 먼저 고르고 도전. 진행 중 우측 상단에 **정답(초록)·오답(빨강) 개수** 실시간 표시
  - **누구게?**(실루엣), **울음소리**(cry `.ogg` 재생), **확대 퀴즈**(공식아트 ×15 초근접 정사각 크롭), **도감설명**(도감 텍스트·이름 마스킹), **타입 (쉬움/어려움)**, **종족값 대결**, **도감번호**, **초성 (쉬움/어려움)**, **랜덤 힌트**, **타입 오드원**, **전설 · 환상**, **헷갈리는 이름**, **전용기술**
  - **💡 랜덤 힌트**: 타입 · 세대 · 종족값 총합 · 최고 능력치 · 키/몸무게 · 분류 · 특성 · 도감설명 중 **무작위 3개**만 보고 이름 입력(주관식). 도감설명 힌트는 이름을 `○○○`으로 마스킹하고 현재 언어로 존재할 때만 사용
  - **🔀 타입 오드원**: 4마리 중 **타입 조합이 혼자 다른** 한 마리 고르기. 타입 순서는 구별하지 않으며(물/땅 = 땅/물), 오답 후보는 한 타입을 공유하는 근접 조합으로 뽑는다
  - **✨ 전설 · 환상**: 제시된 포켓몬이 **전설 / 환상 / 패러독스 / 울트라비스트 / 일반** 중 무엇인지. 특별 분류가 전체의 ~12%뿐이라 특별 65% : 일반 35%로 편향 추첨. 코라이돈·미라이돈은 전설이면서 패러독스라 출제 제외
  - **🅰 헷갈리는 이름**: 아트를 보고 **편집 거리 + 앞뒤 글자 일치**로 뽑은 비슷한 이름 4개 중 진짜 고르기(예: 우츠보트/우츠동, Exeggutor/Exeggcute)
  - **⚡ 전용기술**: 한 종족만 배우는 기술을 제시하고 그 포켓몬 고르기. 오답은 정답과 타입을 공유하는 포켓몬으로 구성
  - **🔡 초성 퀴즈**: 한글 초성만 보고 이름 맞히기(주관식). 소재는 **포켓몬 · 기술 · 특성 · 도구** 4종을 PokeAPI에서 실시간 추첨 — *쉬움*은 유형 힌트 제공, *어려움*은 유형까지 비공개
  - **🧬 타입 퀴즈**: *쉬움*=포켓몬 보고 (복합)타입 고르기(오답은 한 타입만 다른 유사조합). *어려움*=제시된 타입(1~2개)을 가진 포켓몬 이름 입력(번들된 1025종 타입 인덱스로 즉시 동적 채점)
  - **⚔️ 종족값 대결**: HigherLower 방식 — 스탯 하나(HP/공/방/특공/특방/스피드)를 지정해 왼쪽 값 공개 후 오른쪽이 더 높은지/낮은지 선택
  - 실루엣·울음소리·확대·도감설명·초성·타입(어려움)·랜덤 힌트는 **주관식**(띄어쓰기·기호 무관, 복수 정답 인정), 나머지는 4지선다
  - **오프라인 출제**: 타입 오드원·헷갈리는 이름·전용기술은 번들 인덱스(JSON)만으로 문제를 만들어 **PokeAPI 요청 0회**(아트 이미지 제외)
- **🎓 수능 모의고사**: 고인물용 큐레이션 문제은행 종합 시험 — 정답률을 **1~9등급**으로 산출
- **⚡ 속도전 (실시간 멀티)**: 캐치마인드·끄투식 동시 풀이. 공개 방 목록에서 입장하거나 직접 방을 만들고(문항 10/20/30 · 제한 10/15/20/30초), 최대 8명이 **같은 문제를 동시에** 받아 먼저 정답을 타이핑한 사람이 고득점
  - **점수 = 남은 시간 비례(최대 100) + 순위 보너스(1등 50 · 2등 30 · 3등 15)**. 시간 비례만 쓰면 1등의 쾌감이 없고 순위 보너스만 쓰면 빨리 칠 이유가 없어 둘을 겹쳤다
  - 출제는 **주관식 9종**(실루엣·울음소리·확대·도감설명·랜덤 힌트·타입 쉬움/어려움·초성 쉬움/어려움) 중 방을 만들 때 고른 것만. 객관식은 넣지 않는다 — 찍어도 0.3초에 눌려 속도 경쟁이 운으로 흐른다
  - 정답이 이름이 아닌 종목도 있다. **타입(쉬움)** 은 타입 조합을 입력하고(한/영 타입명 × 순서 무관 인정), **타입(어려움)** 은 그 타이핑에 정확히 맞는 포켓몬 아무거나 입력한다. 속도전 채점은 `accept` 목록 대조뿐이라 솔로판의 술어 채점 대신 **해당 타이핑의 풀 전체를 정답 후보로 넘긴다**(호스트만 갖는 값이라 방송량과 무관하고, 번들 인덱스만 써서 PokeAPI 요청 0)
  - **정답은 호스트만 안다**: 방 데이터는 참가자 전원이 읽을 수 있어서, 문제 페이로드에 정답을 넣으면 콘솔에 그대로 보인다. 호스트가 로컬에서 채점하고 결과만 방송하며, 정답 공개도 공개 시점에만 전송
  - **제출 시각은 RTDB `serverTimestamp`**, 보안 룰이 `now`와 대조 → 클라이언트가 시각을 앞당겨 "0.01초 만에 정답"을 만들 수 없다
  - 한국어·영어 유저가 같은 방에 섞여도 **양쪽 언어를 모두 정답 인정**하고(포켓몬 이름도 타입명도), 지문은 각자 자기 언어로 렌더링한다(도감설명·힌트 본문만 호스트 언어). 방 언어가 영어면 초성 2종은 목록에서 아예 빠진다 — 초성열이 한글 음절에서만 만들어져 영어 이름에 걸면 정답이 그대로 보인다
  - 호스트가 나가면 그 시점 점수로 게임이 종료된다 — 정답과 출제권이 호스트에게만 있어 진행을 이어받을 수 없기 때문
- **한글 우선 출제**: PokeAPI에 한글 도감설명이 없는 개체(9세대 등)는 자동 제외해 항상 한국어로 출제
- **로컬 기록**: 종목별 최고 점수·최고 연속 정답을 LocalStorage(`pokemon-td-quiz-v1`)에 저장(본편/카드와 분리)
- **🏆 랭킹 3종** (랭킹 모달 → 퀴즈 탭 안의 싱글 / 멀티 / 주간)
  | 보드 | 기준 | 경로 |
  |---|---|---|
  | 싱글 | 수능 모의고사 **통산** 최고점 | `quizRankings/{uid}` |
  | 멀티 | 속도전 **통산** 1등 횟수 | `quizSpeedRankings/{uid}` |
  | 주간 | **종목별** 그 주 최고 기록(17개 보드: 15종목+모의고사+속도전) | `seasons/{주차}/quizRankings/{uid}` |
  - 주간 보드는 종목마다 문서를 나누지 않고 **유저당 주 1문서의 `scores` 맵**에 모은다. 문서 수가 유저 수만큼만 늘고, `orderBy('scores.<보드>')`는 Firestore **자동 단일 필드 색인**으로 처리돼 `firestore.indexes.json` 추가가 필요 없다
  - 주가 바뀌면 경로가 바뀌어 **서버 개입 없이 리셋**되고, 2주 이상 지난 내 문서는 다음 쓰기 때 스스로 지운다(미니 포켓 시즌과 동일 패턴)
  - [FREE-TIER] 한 판 끝날 때마다 쓰지 않는다. **이번 주 최고를 경신했을 때만 1 write**(로컬 `weeklyBest`로 판정). 읽기도 지금 보고 있는 보드 하나만
- ⚠️ 퀴즈 데이터는 PokeAPI에서 실시간 로드 → **인터넷 연결 필요**

### 🗺️ 맵 시스템 (8종)
| 맵 | 난이도 | 특징 |
| :--- | :--- | :--- |
| 초보자의 좁은 길 | Easiest | 단일 직선 경로, 화력 집중 가능 |
| 성벽 순환로 | Easy | 맵 외곽 순환, 내부 배치 공간 한정 |
| 위험한 지름길 | Medium | 우회로 + 어그로 섬 전략 |
| 구불구불 동굴 | Medium | 긴 S자 경로, 공격 시간 극대화 |
| 합류 지점 | Medium | 2갈래 동시 방어 필요 |
| 넓은 초원 | Hard | 폭 3칸 동시 진입 |
| 분리된 설원 | Hard | 상하단 완전 분리 경로 |
| 중앙 제단 | Expert | 4방향 동시 돌격 |

### ⚔️ 멀티플레이어 PvP — 핵심 모드

> 이 게임의 가장 큰 특징. **타워 디펜스 + TFT(팀파이트 택틱스)** 를 결합한 독창적인 PvP 시스템입니다.

#### 🏟️ 기본 구조
- **최대 8인 실시간 대전**: Firebase Realtime Database 기반 끊김 없는 동기화
- **배틀 로얄 서바이벌**: 라이프가 0이 되면 탈락, 최후의 1인이 우승
- **웨이브 루프**: `준비(waiting_wave) → 웨이브(wave) → 전투(battle)` 3단계 반복
  - 웨이브 단계: 자기 맵에서 적을 막는 싱글 플레이와 동일
  - **매 3웨이브마다** PvP 배틀 페이즈 자동 돌입

#### ⚔️ TFT 배틀 아레나
- 각 플레이어의 타워 배치 데이터를 Firebase를 통해 실시간 공유
- **TFTBattleArena**: 자신의 타워가 상대방 필드에 배치되어 자동으로 전투 시뮬레이션
- 배틀 결과에 따라 승자/패자 보상 차등 지급:

| 결과 | 보상 |
| :--- | :--- |
| 승리 | 골드 +40 (기본) + 연승 보너스 (2/3/4연승 → +15/+30/+50) + 잔여 포켓몬 3마리↑ 시 +20 |
| 패배 | 라이프 감소 (3 + 상대 잔여 포켓몬 수) + 연패 위로금 (2~5연패 → +60~+200) + 저라이프 위로금 (≤20: +30, ≤10: +60) |
| 바이(Bye) | 배틀 없이 다음 라운드 진행, 골드 +50 자동 지급 |

#### 🎯 PvP 심화 시스템
- **배틀 페이즈 관전**: `BattlePhaseUI`에서 자신의 매치 TFT 전투를 실시간 관전(사람 매치 완주 보장·워치독 포함)
- **ELO 레이팅**: 기본값 1000, 승패·상대 레이팅에 따라 등락
- **연승/연패 보너스**: 2/3/4연속 시 추가 골드 지급으로 역전 기회 제공
- **스마트 AI 봇**: Easy / Medium / Hard — 인원 부족 시 호스트가 추가 가능
- **매치업 공정성**: 과거 대전 기록(`encounterRecord`) 기반으로 중복 매칭 최소화

### 🏆 도전과 경쟁
- **랭킹 시스템**: 맵별 최단 클리어 타임, 최고 웨이브, 업적 포인트(AP), 그리고 실시간 멀티플레이 ELO 레이팅을 기록하는 Firebase 리더보드
- **전당 등록 (Hall of Fame)**: Wave 50 클리어 시 영구 보존 기록
- **업적 시스템 (Achievement Points)**: 5단계 티어(Bronze/Silver/Gold/Diamond/Legendary), 총 **65종** 업적 (8카테고리)
  - 웨이브(wave), 전투(combat), 경제(economy), 성장(growth), 수집(collect), 시너지(synergy), 도전(challenge), 멀티플레이(multi) 카테고리
  - 각 업적 달성 시 AP(Achievement Points) 누적 지급
- **Wave 50 챌린지**: 싱글 플레이 궁극 목표 — 클리어 시 전당 등록 + 특수 모달

### 🌍 다국어 및 편의성 지원
- **한국어 / 영어** 실시간 전환 (React Context 기반 자체 i18n — `I18nProvider`)
- 게임 내 모든 텍스트, 업적명, 아이템명 번역 지원
- **플로팅 설정 (Floating Settings)**: 로비, 게임 중 어디서든 화면 내 설정 버튼을 통해 BGM 볼륨, 속도, 언어 즉시 변경 및 **실시간 버그 제보** 가능
- **오프라인 모드**: Firebase 무료 사용량 초과 등으로 로그인이 불가능할 때, 로그인 화면에서 "오프라인으로 플레이"로 진입하여 **싱글 플레이 / 스토리 모드를 로컬에서 정상 이용** 가능 (멀티플레이·랭킹·전당은 비활성). 모든 데이터는 LocalStorage에 보존

---

## 🛠️ 기술 스택 (Tech Stack)

| 분류 | 기술 | 비고 |
| :--- | :--- | :--- |
| **Frontend** | ![React](https://img.shields.io/badge/React-18.2-61DAFB?logo=react) ![TypeScript](https://img.shields.io/badge/TypeScript-5.2-3178C6?logo=typescript) | Vite 5 기반 빌드 |
| **State** | ![Zustand](https://img.shields.io/badge/Zustand-4.4-orange) | 단일 `gameStore.ts`로 전체 게임 상태 관리 |
| **Styling** | ![Styled Components](https://img.shields.io/badge/Styled--Components-6.1-DB7093?logo=styled-components) | 컴포넌트 기반 스타일링 |
| **Graphics** | ![Konva](https://img.shields.io/badge/Konva-9.2-green) ![React Konva](https://img.shields.io/badge/React--Konva-18.2-green) | 고성능 2D 캔버스 렌더링 |
| **Backend** | ![Firebase](https://img.shields.io/badge/Firebase-12.5-FFCA28?logo=firebase) | Auth + Firestore + Realtime Database |
| **Data** | ![PokeAPI](https://img.shields.io/badge/PokeAPI-v2-EF5350) | 1025마리 포켓몬 데이터 캐시 및 레어도 산출 |
| **Audio** | ![Howler.js](https://img.shields.io/badge/Howler.js-2.2-blueviolet) | 배경음(BGM) |
| **Routing** | ![React Router](https://img.shields.io/badge/React--Router-7.9-CA4245?logo=reactrouter) | SPA 라우팅 |
| **HTTP** | ![Axios](https://img.shields.io/badge/Axios-1.6-5A29E4) | PokeAPI 통신 |
| **i18n** | 자체 구현 (React Context) | `I18nProvider` 기반 한국어/영어 다국어 지원 (외부 i18next 미사용) |

---

## 📂 프로젝트 구조

```
src/
├── api/
│   └── pokeapi.ts           # PokeAPI 통신 + 1025마리 레어도 캐시 + 프리로딩
├── components/
│   ├── auth/
│   │   ├── LoginScreen.tsx      # 로그인 화면 (Google / 게스트 / 오프라인 진입)
│   │   └── ProtectedRoute.tsx   # 인증 라우트 가드 (오프라인 로컬 유저도 통과)
│   ├── cards/                   # 🃏 미니 포켓 (독립 오토배틀 콘텐츠)
│   │   ├── CardLabView.tsx      # 미니 포켓 허브 (지갑/팩 상점/도감 + 서브뷰 전환)
│   │   ├── CardView.tsx         # 카드 렌더 (레어도 프레임 + 홀로그래픽 효과)
│   │   ├── CardDetailModal.tsx  # 도감식 카드 상세 (종족값/전투스탯/설명/타입/신체)
│   │   ├── CardControls.tsx     # 공용 검색·정렬·타입/레어도 필터 바
│   │   ├── PackOpening.tsx      # 팩 개봉 연출 (봉인→섬광→공개→요약)
│   │   ├── DeckBuilder.tsx      # 6칸 덱 편성 + 실시간 시너지 계산 + 카드 상세(ⓘ)
│   │   └── TrainerTower.tsx     # PvE 트레이너 타워 (층별 자동 전투 아레나)
│   ├── game/
│   │   ├── GameCanvas.tsx       # 메인 게임 캔버스 (Konva 기반 렌더링)
│   │   └── GameLayout.tsx       # 싱글/멀티/스토리 전환 레이아웃 + 게임루프 제어
│   ├── menu/
│   │   └── MainMenu.tsx         # 메인 메뉴 (싱글/멀티/스토리/랭킹/업적 진입)
│   ├── modals/
│   │   ├── Achievements.tsx          # 업적 목록 (카테고리 필터, AP 표시)
│   │   ├── BugReport.tsx             # 버그 제보 모달
│   │   ├── EvolutionConfirmModal.tsx # 진화 확인 모달
│   │   ├── HallOfFame.tsx            # 전당 등록 기록
│   │   ├── Rankings.tsx              # 리더보드 (맵/AP/PVP 레이팅 랭킹)
│   │   ├── Settings.tsx              # BGM/속도/언어 설정 및 버그 제보
│   │   ├── SkillPicker.tsx           # 레벨업 스킬 선택
│   │   ├── TutorialModal.tsx         # 게임 튜토리얼
│   │   ├── Wave50ClearModal.tsx      # 웨이브 50 클리어 모달
│   │   └── WaveEndPicker.tsx         # 웨이브 종료 아이템 보상 선택
│   ├── multiplayer/
│   │   ├── BattlePhaseUI.tsx         # PvP 배틀 페이즈 UI (4분할 관전 + 디버프)
│   │   ├── MultiplayerGameOverModal.tsx # 멀티 게임 오버/순위 모달
│   │   ├── MultiplayerLobby.tsx      # 로비 (방 생성/참가/AI 추가)
│   │   ├── MultiplayerView.tsx       # 멀티 게임 뷰 (상대방 미니뷰 포함)
│   │   └── TFTBattleArena.tsx        # TFT 스타일 배틀 아레나 시뮬레이션
│   ├── shared/
│   │   └── modal.styles.ts           # 공통 모달 스타일
│   ├── story/                        # 스토리 모드
│   │   ├── StoryEnding.tsx           # 스토리 스테이지 클리어/엔딩 연출
│   │   ├── StoryOpening.tsx          # 스토리 오프닝 대사 (타이핑 효과)
│   │   └── StorySelector.tsx         # 챕터 및 스테이지 선택 UI
│   ├── quiz/                         # 🧠 포켓몬 퀴즈 (PokeAPI 소재, 독립)
│   │   ├── QuizView.tsx              # 퀴즈 허브 (문항 수·종목 선택·모의고사·최고점)
│   │   └── QuizPlay.tsx              # 라운드 진행 엔진 (문제 렌더·채점·결과)
│   └── ui/
│       ├── FloatingSettings.tsx      # 플로팅 설정 버튼
│       ├── MapSelector.tsx           # 맵 선택 화면 (8종 맵 카드)
│       ├── PokemonManager.tsx        # 배치된 포켓몬 관리 패널
│       ├── PokemonPicker.tsx         # 포켓몬 뽑기/구매 (레어도별 확률)
│       ├── ShootingStarsBackground.tsx # 별똥별 배경 애니메이션
│       ├── Shop.tsx                  # 인게임 상점 (아이템 구매/판매)
│       ├── SynergyDetails.tsx        # 시너지 상세 툴팁
│       └── SynergyTracker.tsx        # 활성 시너지 트래커
├── config/
│   └── firebase.ts          # Firebase 초기화 + serverNow() + Presence
├── data/
│   ├── achievements.ts      # 65종 업적 정의 (5티어, 8카테고리)
│   ├── evolution.ts         # 진화 체인 + 메가진화(48종) + 거다이맥스(31종) + 합체(6종)
│   ├── evolutionItems.ts    # 진화 아이템 정의
│   ├── heldItems.ts         # 지닌도구 12종 정의 (열매/딜증가/피흡)
│   ├── maps.ts              # 8종 맵 데이터 (경로, 스폰, 테라 타일, 알바 칸)
│   ├── pokedexTypeIndex.json # 퀴즈 타입(어려움)·타입 오드원·헷갈리는 이름용 1025종 인덱스 (id·한/영이름·타입)
│   ├── pokedexSpecialIndex.json # 퀴즈 '전설·환상'용 분류 인덱스 (전설/환상/패러독스/UB) ※scripts/genQuizData.mjs 생성
│   ├── signatureMoves.json   # 퀴즈 '전용기술'용 전용기술 123건 (기술 한/영이름 → 유일 학습 포켓몬) ※동일 스크립트 생성
│   └── storyChapters.ts     # 스토리 모드 챕터, 대사, 보상, 난이도 데이터
├── game/
│   ├── GameManager.ts       # 핵심 게임 루프 (적 이동, 타워 공격, 투사체, 웨이브 관리)
│   └── WaveSystem.ts        # 웨이브 적 스폰 시스템 (보스 포함)
├── hooks/
│   ├── useCardState.ts      # 카드 모드 상태 구독 훅 (useSyncExternalStore)
│   └── useCardMeta.ts       # 보유 카드 이름·타입·레어도 로더 (정렬/필터/검색·시너지 공용)
├── i18n/
│   ├── I18nProvider.tsx     # React Context 기반 i18n 프로바이더 (자체 구현)
│   ├── index.ts             # I18nProvider / useTranslation re-export
│   └── translations/
│       ├── en.json          # 영어 번역
│       └── ko.json          # 한국어 번역
├── services/
│   ├── AIPlayer.ts          # AI 봇 로직 (Easy/Normal/Hard 전략)
│   ├── AchievementService.ts # 업적 이벤트 중앙 처리기
│   ├── AuthService.ts       # Firebase Auth 래퍼 (Google/게스트) + 오프라인 모드 세션
│   ├── CardService.ts       # 카드 모드 영속(지갑/도감/천장/덱) + 팩깡 로직 (LocalStorage)
│   ├── CardBattleService.ts # 카드 오토배틀 전투 엔진 (전/후열 + 관통 시너지)
│   ├── DatabaseService.ts   # Firestore (리더보드, 전당 등록)
│   ├── MultiplayerService.ts # Firebase RTDB 기반 멀티플레이 동기화 (V7)
│   ├── PvPBattleService.ts  # PvP 매치업 생성 및 배틀 결과 계산
│   ├── QuizEngine.ts        # 퀴즈 문제 생성기 (종목별 생성·초성 변환·오답·셔플·프리페치)
│   ├── QuizService.ts       # 퀴즈 로컬 영속 (종목별 최고점/최고 연속) LocalStorage
│   ├── quizExamBank.ts      # 수능 모의고사 큐레이션 문제은행
│   ├── SaveService.ts       # LocalStorage 저장/불러오기 (업적, 통계)
│   ├── SoundService.ts      # Howler.js 오디오 매니저
│   └── StoryProgressService.ts # 스토리 모드 진행 상태 관리
├── store/
│   └── gameStore.ts         # Zustand 전역 게임 상태
├── types/
│   ├── cards.ts             # 카드 모드 타입 (CardSaveState, Deck, PackType 등)
│   ├── game.ts              # 핵심 타입 (GamePokemon, Enemy, Item, Achievement 등)
│   ├── multiplayer.ts       # 멀티플레이 타입 (Room, PlayerGameState, GamePhase 등)
│   └── quiz.ts              # 퀴즈 타입 (QuizKind, QuizQuestion, QuizSaveState)
└── utils/
    ├── abilities.ts         # 특성 효과 계산 (크리티컬, 흡혈, AOE, 속도, 탱크)
    ├── cardCatalog.ts       # 미니 포켓 도감/덱 공용 정렬·필터·검색 로직
    ├── facility.utils.ts    # 알바(숍·콘테스트) 규칙 단일 출처 (모드 판별·잠금·이동 시 누적 초기화)
    ├── responsive.utils.ts  # 반응형 유틸리티
    ├── synergyManager.ts    # 시너지 계산 (타입/세대/특수 23종) + 스탯 버프 적용
    └── typeEffectiveness.ts # 18종 타입 상성 + STAB + 데미지 계산
```

### 정적 에셋 (`public/` · `assets-src/`)

```
public/images/
├── favicon-64.png            # 파비콘 (WebP 파비콘은 일부 Safari 미표시 → PNG 유지)
├── pokemon-aegis.webp        # 로고 400px
└── maps/
    ├── *.webp                # 맵 배경 1920px — 게임 캔버스·스토리 오프닝용
    └── thumbs/*.webp         # 맵 썸네일 480px — 맵 선택·스토리 챕터·멀티 로비 카드용

assets-src/                   # 원본 PNG 보관 (public 밖 = 배포 제외). 재인코딩 방법은 assets-src/README.md
```

> ⚠️ 화면에서 `` `/images/maps/${id}.png` `` 처럼 경로를 직접 조립하지 말 것.
> `maps.ts`의 `mapThumbnailById()` / `MapData.backgroundImage`를 쓴다.
> 예전에 문자열 조립 3곳이 확장자 전환에서 누락돼 이미지가 조용히 깨진 적이 있다
> (Netlify SPA 폴백 때문에 404가 아니라 `index.html`이 200으로 온다).

---

## 🔥 시너지 시스템 상세

### 타입 시너지 (18종 × 3단계)
| 마리 수 | 효과 |
| :--- | :--- |
| 2마리 | 해당 타입 스탯 **×1.1배** |
| 4마리 | 해당 타입 스탯 **×1.3배** |
| 6마리 | 스탯 **×1.3배** + 해당 타입 **약점 데미지 0.5배** (피격 감소) |

### 세대 시너지 (9세대 × 3단계)
| 마리 수 | 효과 |
| :--- | :--- |
| 2마리 | 해당 세대 스탯 **×1.1배** |
| 4마리 | 해당 세대 스탯 **×1.2배** |
| 6마리 | 해당 세대 스탯 **×1.3배** |

### 특수 시너지 (23종)
베이비 포켓몬, 전설의 새/개/해파리, 카푸 4형제, 울트라비스트, 레지 시리즈, 지우의 팀, 화석 포켓몬, 사흉수 등 스페셜 그룹 — 2마리 이상 배치 시 **×1.1~1.5배** 보너스.

> 스탯 버프는 **타입 × 세대 × 특수** 3종 모두 누적 곱산됩니다.

---

## 🚀 설치 및 실행 방법

### 1. 프로젝트 클론
```bash
git clone <repository-url>
cd pokemon-td
```

### 2. 패키지 설치
```bash
npm install
```

### 3. 환경 변수 설정 (`.env`)
저장소에 포함된 [`.env.example`](.env.example)을 복사해 `.env`를 만들고 Firebase 값을 채우세요.
```bash
cp .env.example .env
```
값은 **Firebase Console → 프로젝트 설정(⚙) → 일반 → 내 앱 → SDK 설정 및 구성**의
`firebaseConfig`에서 확인할 수 있습니다. 필요한 키 목록은 `.env.example`을 참고하세요.
> `VITE_FIREBASE_DATABASE_URL`은 멀티플레이(Realtime Database)용이며, 미지정 시 SDK가 자동 유추합니다.
> `VITE_` 접두 변수는 클라이언트 번들에 포함됩니다(Firebase 웹 설정은 비밀키가 아니므로 정상).

### 4. 개발 서버 실행
```bash
npm run dev
```

### 5. 프로덕션 빌드
```bash
npm run build   # tsc 타입 검사 후 vite 빌드 → dist/
```

### 6. 퀴즈 번들 데이터 재생성 (선택)
```bash
npm run quiz:data   # PokeAPI 전수 조사 → pokedexSpecialIndex.json + signatureMoves.json
```
새 세대가 추가됐을 때만 돌리면 되는 1회성 스크립트(`scripts/genQuizData.mjs`)입니다. 약 2,000회 요청이라 수 분 걸리며,
`node scripts/genQuizData.mjs special` / `... moves`로 한쪽만 갱신할 수 있습니다. 런타임에는 생성된 JSON만 읽습니다.

---

## ☁️ 배포 (Deployment)

프론트엔드는 **Netlify**, 백엔드 보안 규칙은 **Firebase CLI**로 배포합니다.
(`firebase.json`은 Firestore·RTDB 규칙만 관리하며 호스팅은 Netlify가 담당합니다.)

> ⚠️ **배포 순서(중요)**: 반드시 **① 프론트엔드 → ② RTDB 규칙** 순서로.
> 새 RTDB 규칙은 방 문서의 `memberIds`(멤버십 맵)를 참조하는데 이 필드는 최신 클라이언트만
> 생성합니다. 규칙을 먼저 올리면 구버전 번들 사용자와 진행 중인 멀티 게임이 권한 오류로 멈춥니다.
> 프론트 배포 후 몇 분 지나 규칙을 올리세요. (한산한 시간대 권장)

### 1. 프론트엔드 — Netlify
`netlify.toml`에 SPA 리다이렉트, 팝업 로그인용 COOP 헤더, **캐시 정책**이 포함되어 있습니다.
- `/assets/*` — 해시 파일명이라 `immutable` 1년
- `/images/*`, `/sounds/*` — 30일 + `stale-while-revalidate`
  > ⚠️ 이미지·사운드는 파일명이 고정입니다. 교체할 땐 **파일명을 바꾸거나** Netlify 캐시를
  > 비워야 유저에게 반영됩니다.
- **Git 연동(자동 배포)**: Netlify가 자체 빌드하므로 `VITE_FIREBASE_*` 변수를
  **Site configuration → Environment variables**에 등록해야 합니다(미등록 시 로그인 깨짐).
  Build command `npm run build`, Publish directory `dist`.
- **수동 배포**: 로컬 `dist/`를 업로드 — `npx netlify deploy --dir=dist --prod`

> **배포 순간 탭을 열어둔 유저**: Netlify는 새 스냅샷으로 통째 교체하므로 이전 배포의 청크
> (`assets/MapSelector-<해시>.js`)가 사라집니다. 그 탭이 지연 로드를 시도하면
> `Failed to fetch dynamically imported module`로 실패합니다(SPA 폴백 탓에 404가 아니라
> `index.html`이 200으로 와서 모듈 파싱이 깨지는 것). 실제로 2026-08-03 배포 67분 뒤 발생.
> `src/utils/chunkReload.ts`가 이 경우 **자동으로 1회 새로고침**해 조용히 최신 버전으로
> 복귀시킵니다(`App.tsx`의 `lazyRoute` + `main.tsx`의 `vite:preloadError` 리스너).
> 단 이 장치는 **탭에 이미 로드된 번들**에서 도는 것이라, 어떤 배포든 그 시점의 구버전 탭까지
> 구하지는 못합니다 — 한산한 시간대 배포를 병행하는 편이 좋습니다.
> 회귀 테스트: `sim/app/chunkReload.sim.ts`

### 2. 백엔드 보안 규칙 — Firebase
```bash
firebase login
firebase deploy --only database    # RTDB 규칙 (database.rules.json)
firebase deploy --only firestore   # Firestore 규칙 (firestore.rules) — 변경 시에만
```

> **규칙이 '추가만' 된 릴리스는 규칙을 먼저 올리세요.** 위 순서 경고(프론트 → 규칙)는 기존 규칙을
> *조이는* 변경에 대한 것입니다. 퀴즈 주간 랭킹(`seasons/{주차}/quizRankings`)·속도전
> (`quizSpeedRankings`, RTDB `quizRooms`)처럼 **새 경로만 추가**하는 릴리스는 기존 클라이언트가
> 그 경로를 건드리지 않으므로 규칙을 먼저 올려도 안전하고, 오히려 나중에 올리면 새 기능이
> 배포 직후부터 권한 거부로 조용히 실패합니다(쓰기는 catch되어 화면상 아무 일도 안 일어남).
>
> 색인은 추가할 필요가 없습니다 — `orderBy('scores.<보드>')`는 Firestore **자동 단일 필드 색인**으로
> 처리됩니다(복합 색인이 필요한 `where`+`orderBy` 조합을 쓰지 않도록 쿼리를 짰습니다).
> `.firebaserc`가 없으면 `--project <PROJECT_ID>`로 프로젝트를 지정하거나
> `firebase use --add`로 기본 프로젝트를 설정하세요.

### 3. Firebase Console 설정
- **Authentication → Settings → Authorized domains**에 배포 도메인(예: `*.netlify.app`) 추가
  (누락 시 Google/게스트 로그인이 `auth/unauthorized-domain`으로 실패)

---

## 🗺️ 화면 라우팅

| 경로 | 컴포넌트 | 설명 |
| :--- | :--- | :--- |
| `/login` | `LoginScreen` | Google / 게스트 로그인 + 오프라인 진입 |
| `/` | `MainMenu` | 메인 메뉴 (싱글/멀티/스토리/랭킹 등) |
| `/map-select` | `MapSelector` | 싱글 플레이 맵 선택 |
| `/story` | `StorySelector` | 스토리 챕터 및 스테이지 선택 |
| `/lobby` | `MultiplayerLobby` | 멀티플레이 로비 |
| `/cards` | `CardLabView` | 카드 오토배틀 모드 (도감/덱/트레이너 타워) |
| `/quiz` | `QuizView` | 포켓몬 퀴즈 (15종목 + 수능 모의고사) |
| `/game` | `GameLayout` | 실제 게임 화면 (싱글/멀티/스토리 공통) |

> 모든 라우트는 `ProtectedRoute`로 보호되며, 비인증 사용자는 `/login`으로 리다이렉트됩니다.
> 오프라인 모드에서는 로컬 유저 세션으로 `/`, `/map-select`, `/story`, `/cards`, `/game`은 이용 가능하나, `/lobby`(멀티)는 차단됩니다.
> `/quiz`는 진입할 수 있으나 문제 데이터를 PokeAPI에서 실시간으로 받아오므로 **인터넷 연결이 필요**합니다.

---

## 🧩 멀티플레이어 아키텍처

```
클라이언트 (Host)          Firebase RTDB            클라이언트 (Guest)
      │                         │                         │
      ├─ createRoom() ─────────►│                         │
      │                         │◄──── joinRoom() ────────┤
      ├─ addAI(difficulty) ────►│                         │
      ├─ startGame() ──────────►│                         │
      │                         │ initializePvPGameState  │
      │   markPlayerLoaded() ──►│◄── markPlayerLoaded() ──┤
      │                         │  (모두 로딩 완료 시)     │
      │                         │  currentPhase: waiting_wave
      │                  ┌──────┴──────┐
      │                  │  웨이브 루프  │
      │                  │  Wave ──────► WaveEnd ──► Battle (매 3웨이브)
      │                  └──────┬──────┘
      │   submitBattleResult() ►│ (배틀 결과 + 보상 트랜잭션)
      │   playerDefeated() ────►│ (탈락 처리)
      └─ finalizeGame() ───────►│ (게임 종료 + 레이팅 업데이트)
```

**주요 Firebase RTDB 경로:**
- `rooms/{roomId}` — 방 메타데이터, 플레이어 목록, `memberIds`(보안 규칙용 멤버십 맵)
- `gameStates/{roomId}` — 게임 진행 상태 (페이즈, 라이프, 골드, 순위)
- `towerDetails/{roomId}/{userId}` — 타워 배치 상세 (배틀 시뮬레이션용)
- `presence/{roomId}` — 연결 상태 (접속 끊김 감지 → 장기 오프라인 시 몰수 처리)
- `quizRooms/{roomId}` — 퀴즈 속도전 방 (대기실·문제·답안·점수판을 노드 하나에. TD 경로와 완전 분리)

> 참고: 라운드별 배틀 결과는 게임 상태(`gameStates.battleResults`) 안에 트랜잭션으로 저장됩니다.

### 📶 RTDB 동시 연결 예산 (`src/config/rtdbBudget.ts`)
Spark 무료 플랜의 **동시 연결 100개**를 RTDB 사용 기능들이 나눠 쓴다. 예전엔 이 값이
`MultiplayerService` 안에만 있어서(12방 × 8명 = 96) 기능이 하나만 늘어도 곧바로 한도를 넘었다.
지금은 한 파일에서만 쪼개고, **DEV 빌드가 합계를 검사해 초과 시 즉시 실패**한다.

| 기능 | 방 | 인원 | 방 안 인원 |
|---|---|---|---|
| TD 멀티플레이 | 4 | 8 | 32 |
| 퀴즈 속도전 | 8 | 8 | 64 |
| **합계** | | | **96** |

한도를 넘으면 Firebase가 **신규 연결만 거절**한다(기존 접속자는 멀쩡). 앱에는 "서버가 붐빔"이
아니라 목록 로딩 실패·무한 로딩으로만 보이므로, 방 생성 단계에서 미리 막는다.

**연결은 "방에 들어간 사람"만 잡는다.** 예전엔 로비(`MultiplayerLobby`·`SpeedQuizLobby`)를 열어 둔
사람도 화면이 떠 있는 내내 연결을 1개씩 물고 있었고, 그 수는 방 수로 막히지 않아 위 96이 상한이
아니라 하한이었다. **방이 다 차면 남는 사람이 정확히 로비에 쌓이므로 하필 그 순간 초과가 났다.**

- 두 로비 모두 방 목록을 **실시간 구독 → 단발 조회 + 새로고침 버튼**으로 바꿨다
  (`fetchWaitingRooms` / `listWaitingRooms`). 목록은 몇 초 늦어도 무해하다.
- 조회·방 만들기·입장은 `MultiplayerService.withRtdb()`로 **그 순간만** 연결을 잡고 반납한다.
- 방에 들어간 뒤에는 반납이 무시된다 — `currentRoomId`(TD)와 `registerRtdbBusyProbe`(퀴즈)가
  막는다. ⚠️ 이게 없으면 `goOffline` 순간 서버가 `onDisconnect`를 발동시켜 **방금 들어간 자기 자리가
  즉시 삭제된다.**

### 🔒 보안 규칙
- **RTDB** (`database.rules.json`): 게임 상태 쓰기는 방 `memberIds`에 속한 참가자로 제한.
  `towerDetails`·`presence`의 유저별 경로는 **방 멤버 본인(또는 호스트가 구동하는 AI)** 만 쓰기 가능.
  존재하지 않는 방에 대한 **오펀 노드 생성 차단**(정리 삭제만 허용)으로 무료 용량 남용 방지.
- **RTDB — 퀴즈 속도전** (`quizRooms`): 방 노드 전체 쓰기는 **호스트만**. 참가자는 자기 `players/{uid}`를
  만들거나 지울 수만 있고(점수 필드는 호스트만 갱신), `answers/{uid}`는 `at === now` 검증으로
  **제출 시각 위조를 차단**한다. 예외로 `status`만은 호스트가 방에서 사라진 경우 남은 사람이
  `finished`로 바꿀 수 있다(호스트 이탈 시 게임이 영영 안 끝나는 것 방지).
- **Firestore** (`firestore.rules`): 유저 문서/리더보드/전당/업적은 본인 소유 문서만 쓰기 가능.
  `rating`·`highestWave`·`totalAP` 등에 **범위 상한**을 둬 클라이언트 위조 점수의 랭킹 도배를 억제
  (Spark 무료 플랜엔 Cloud Functions가 없어 완전 서버 검증은 불가 — 클라이언트 신뢰 모델의 한계).
- 무료 사용량 초과·장애 시 **오프라인 모드**로 자동 폴백하여 싱글/스토리/카드 모드는 계속 이용 가능.
- **재접속·연결끊김**: `presence` 기반으로 장기 오프라인 참가자를 자동 몰수(forfeit)하여 게임이 멈추지 않도록 하고, 재접속 시 서버 상태에서 라이프·골드·타워를 복원.

---

## 🤝 기여하기 (Contributing)
Pull Request는 언제나 환영합니다! 버그 제보나 기능 제안은 Issue 탭을 이용해주세요.

---

**Note**: This game is a fan-made project and is not affiliated with Nintendo, Game Freak, or The Pokémon Company.