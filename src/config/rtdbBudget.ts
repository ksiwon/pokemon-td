// src/config/rtdbBudget.ts
// [FREE-TIER] Firebase Realtime Database 무료(Spark) 플랜의 **동시 연결 100개**를 나눠 쓰는 예산표.
//
// 왜 한 파일에 모으나: 예전엔 MultiplayerService 안에 MAX_ACTIVE_ROOMS(12)만 있었다.
// 12방 × 8명 = 96 + 여유 4 로 딱 맞춰 둔 값이라, RTDB를 쓰는 기능이 하나라도 더 생기면
// 그 즉시 한도를 넘는다(초과분은 연결 거부 = 신규 입장 실패). 실제로 퀴즈 속도전이
// 추가되면서 96 + 24 = 120이 될 뻔했다. 예산은 한 곳에서만 쪼갠다.
//
// 초과했을 때의 증상: Firebase가 신규 연결을 거절한다. 기존 접속자는 유지되지만
// 새로 들어오려는 사람만 조용히 실패하므로 원인 추적이 어렵다 → 사전에 방 수로 막는다.

/** 무료 플랜 동시 연결 한도. */
export const RTDB_FREE_CONNECTION_LIMIT = 100;

// 배분 근거: TD 멀티는 실제 동시 이용이 많지 않아 방을 많이 열어 둘 이유가 없다.
// 반대로 퀴즈 속도전은 "방이 있어야 사람이 모인다" → 몫을 두 배로 준다(TD 32 : 퀴즈 64).
// 인기가 반대로 바뀌면 아래 네 숫자만 조정하면 된다(합계는 DEV 빌드가 검사한다).

/** TD 멀티플레이 방 1개의 최대 인원. */
export const TD_MAX_PLAYERS_PER_ROOM = 8;
/** 동시 유지 가능한 TD 멀티플레이 방 수. */
export const TD_MAX_ACTIVE_ROOMS = 4;

/** 퀴즈 속도전 방 1개의 최대 인원. */
export const QUIZ_MAX_PLAYERS_PER_ROOM = 8;
/** 동시 유지 가능한 퀴즈 속도전 방 수. */
export const QUIZ_MAX_ACTIVE_ROOMS = 8;

/**
 * 전 방 만석일 때 **방 안에 있는 사람** 수. 32 + 64 = 96.
 *
 * ⚠️ 이건 동시 연결의 상한이 아니라 **하한**이다. 로비(TD `MultiplayerLobby`, 퀴즈
 * `SpeedQuizLobby`)만 열어 둔 사람도 화면이 떠 있는 동안 연결을 1개씩 잡는데, 그 수는
 * 방 수로 막히지 않는다. 즉 실제 동시 연결 ≈ (방 안 인원) + (로비 체류 인원)이고
 * 로비 쪽은 무제한이다. 방이 다 차면 남는 사람이 정확히 로비에 쌓이므로 하필 그때 초과가 난다.
 * 방 수 상한만으로는 100개를 보장할 수 없다 — 로비 연결을 짧게 잡거나(단발 조회 후 반납)
 * 인원 자체를 다른 백엔드로 옮겨야 한다.
 */
export const RTDB_IN_ROOM_CONNECTIONS =
  TD_MAX_ACTIVE_ROOMS * TD_MAX_PLAYERS_PER_ROOM +
  QUIZ_MAX_ACTIVE_ROOMS * QUIZ_MAX_PLAYERS_PER_ROOM; // 32 + 64 = 96

// 예산을 잘못 건드리면 배포 후에야 알게 되므로 개발 빌드에서 즉시 깨뜨린다.
// (로비 체류분은 여기서 셀 수 없으므로 이 검사는 '방 안 인원'만 본다 — 위 주석 참고)
if (import.meta.env.DEV && RTDB_IN_ROOM_CONNECTIONS > RTDB_FREE_CONNECTION_LIMIT) {
  throw new Error(
    `[rtdbBudget] 동시 연결 예산 초과: ${RTDB_IN_ROOM_CONNECTIONS} > ${RTDB_FREE_CONNECTION_LIMIT}. ` +
    '방 수나 인원 상한을 줄이세요.'
  );
}
