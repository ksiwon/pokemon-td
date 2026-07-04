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
- **지닌도구 시스템**: 일회성 열매/딜 증가/피흡 등 12종 지닌도구를 인벤토리로 관리하고 웨이브 사이 자유 장착·교체·회수
- **완벽한 포켓몬 구현**: PokeAPI 기반 실제 종족값, 타입 상성(18종), 특성(5종), 기술 구현
- **레어도 시스템**: 종족값 총합 기준 6단계 (Bronze / Silver / Gold / Diamond / Master / Legend)
- **상태이상**: 화상, 독, 마비, 냉동, 잠듦, 혼란 6종 — 적과 아군 모두 적용
- **진화 & 성장**: 레벨업 진화, 돌/친밀도/통신 등 아이템 진화(상점), **메가진화(48종)**, **거다이맥스(31종)**, **합체(6종)**
- **로그라이크 요소**: 매 웨이브 종료 후 **스킬 선택(Skill Picker)** 및 **아이템 보상(WaveEndPicker)** 제공
- **시너지 시스템**: TFT 스타일의 타입(18종) × 세대(9세대) × 특수 조합(23종) 삼중 시너지 효과

### 🃏 카드 오토배틀 모드 (Card Lab) — TD 본편과 독립
- **카드 수집**: 코인·별조각으로 팩(일반/타입/고급)을 개봉해 1025종 포켓몬 카드를 수집. 천장·최소 보장 시스템 포함
- **별 합성**: 같은 카드 중복 시 별 등급 상승(최대 ★5, TFT식 합성), 5성 초과 중복은 코인 환급
- **덱 편성**: 6칸(전열 3 / 후열 3) 덱에 타입 시너지(2/4/6 브레이크포인트)를 실시간 확인하며 구성
- **트레이너 타워**: PvE 층별 자동 전투 아레나(배속·스킵 지원). 전열 보호 + 관통 시너지(비행/고스트) 규칙
- **완전 분리 저장**: 카드 데이터는 `pokemon-td-cards-v1` LocalStorage에 별도 저장 — TD 본편 세이브/업적에 **0 영향**. 보상은 웨이브·맵/스토리 클리어·업적 달성 시 지급

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
│   ├── cards/                   # 🃏 카드 오토배틀 모드 (독립 콘텐츠)
│   │   ├── CardLabView.tsx      # 미니 포켓 허브 (지갑/팩 상점/도감 + 서브뷰 전환)
│   │   ├── CardView.tsx         # 카드 렌더 (레어도 프레임 + 홀로그래픽 효과)
│   │   ├── PackOpening.tsx      # 팩 개봉 연출 (봉인→섬광→공개→요약)
│   │   ├── DeckBuilder.tsx      # 6칸 덱 편성 + 실시간 시너지 계산
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
│   └── storyChapters.ts     # 스토리 모드 챕터, 대사, 보상, 난이도 데이터
├── game/
│   ├── GameManager.ts       # 핵심 게임 루프 (적 이동, 타워 공격, 투사체, 웨이브 관리)
│   └── WaveSystem.ts        # 웨이브 적 스폰 시스템 (보스 포함)
├── hooks/
│   └── useCardState.ts      # 카드 모드 상태 구독 훅 (useSyncExternalStore)
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
│   ├── SaveService.ts       # LocalStorage 저장/불러오기 (업적, 통계)
│   ├── SoundService.ts      # Howler.js 오디오 매니저
│   └── StoryProgressService.ts # 스토리 모드 진행 상태 관리
├── store/
│   └── gameStore.ts         # Zustand 전역 게임 상태
├── types/
│   ├── cards.ts             # 카드 모드 타입 (CardSaveState, Deck, PackType 등)
│   ├── game.ts              # 핵심 타입 (GamePokemon, Enemy, Item, Achievement 등)
│   └── multiplayer.ts       # 멀티플레이 타입 (Room, PlayerGameState, GamePhase 등)
└── utils/
    ├── abilities.ts         # 특성 효과 계산 (크리티컬, 흡혈, AOE, 속도, 탱크)
    ├── responsive.utils.ts  # 반응형 유틸리티
    ├── synergyManager.ts    # 시너지 계산 (타입/세대/특수 23종) + 스탯 버프 적용
    └── typeEffectiveness.ts # 18종 타입 상성 + STAB + 데미지 계산
```

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

---

## ☁️ 배포 (Deployment)

프론트엔드는 **Netlify**, 백엔드 보안 규칙은 **Firebase CLI**로 배포합니다.
(`firebase.json`은 Firestore·RTDB 규칙만 관리하며 호스팅은 Netlify가 담당합니다.)

> ⚠️ **배포 순서(중요)**: 반드시 **① 프론트엔드 → ② RTDB 규칙** 순서로.
> 새 RTDB 규칙은 방 문서의 `memberIds`(멤버십 맵)를 참조하는데 이 필드는 최신 클라이언트만
> 생성합니다. 규칙을 먼저 올리면 구버전 번들 사용자와 진행 중인 멀티 게임이 권한 오류로 멈춥니다.
> 프론트 배포 후 몇 분 지나 규칙을 올리세요. (한산한 시간대 권장)

### 1. 프론트엔드 — Netlify
`netlify.toml`에 SPA 리다이렉트와 팝업 로그인용 COOP 헤더가 포함되어 있습니다.
- **Git 연동(자동 배포)**: Netlify가 자체 빌드하므로 `VITE_FIREBASE_*` 변수를
  **Site configuration → Environment variables**에 등록해야 합니다(미등록 시 로그인 깨짐).
  Build command `npm run build`, Publish directory `dist`.
- **수동 배포**: 로컬 `dist/`를 업로드 — `npx netlify deploy --dir=dist --prod`

### 2. 백엔드 보안 규칙 — Firebase
```bash
firebase login
firebase deploy --only database    # RTDB 규칙 (database.rules.json)
firebase deploy --only firestore   # Firestore 규칙 (firestore.rules) — 변경 시에만
```
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
| `/game` | `GameLayout` | 실제 게임 화면 (싱글/멀티/스토리 공통) |

> 모든 라우트는 `ProtectedRoute`로 보호되며, 비인증 사용자는 `/login`으로 리다이렉트됩니다.
> 오프라인 모드에서는 로컬 유저 세션으로 `/`, `/map-select`, `/story`, `/cards`, `/game`은 이용 가능하나, `/lobby`(멀티)는 차단됩니다.

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

> 참고: 라운드별 배틀 결과는 게임 상태(`gameStates.battleResults`) 안에 트랜잭션으로 저장됩니다.

### 🔒 보안 규칙
- **RTDB** (`database.rules.json`): 게임 상태 쓰기는 방 `memberIds`에 속한 참가자로 제한.
  `towerDetails`·`presence`의 유저별 경로는 **방 멤버 본인(또는 호스트가 구동하는 AI)** 만 쓰기 가능.
  존재하지 않는 방에 대한 **오펀 노드 생성 차단**(정리 삭제만 허용)으로 무료 용량 남용 방지.
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