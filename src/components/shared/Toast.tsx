// src/components/shared/Toast.tsx
// ──────────────────────────────────────────────────────────────────────────────
// 전역 토스트 — 브라우저 `alert()`의 대체재.
//
// alert()을 쓰면 안 되는 이유(프로덕션 검증에서 실제로 겪은 것들):
//  ① 다이얼로그를 억제하는 환경(인앱 브라우저, 일부 모바일 크롬)에서는 **아무것도 안 뜬다**.
//     유저 눈엔 "버튼이 먹통"으로 보인다. 골드 부족·배치 불가처럼 초반에 누구나 밟는
//     경로에서 이게 터지면 게임이 고장난 줄 안다.
//  ② 렌더러 메인 스레드를 통째로 멈춘다. 웨이브 타이머·애니메이션·자동 저장이 같이 선다.
//  ③ 게임의 다른 UI와 톤이 완전히 다르다.
//
// 설계 의도:
//  · 스토어를 zustand(gameStore)에 두지 않는다. 메뉴·카드·퀴즈 등 게임 밖에서도 쓰고,
//    resetGame()에 안내 메시지가 딸려 지워지면 안 되기 때문.
//  · showToast는 **컴포넌트 밖에서도** 부를 수 있어야 한다(GameCanvas의 Konva 핸들러,
//    서비스 콜백 등). 그래서 모듈 레벨 스토어 + useSyncExternalStore 조합.
// ──────────────────────────────────────────────────────────────────────────────

import { useSyncExternalStore } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { lMedia } from '../../utils/responsive.utils';

export type ToastKind = 'error' | 'success' | 'info';

export interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

/** 한 화면에 쌓아둘 최대 개수. 넘으면 오래된 것부터 밀어낸다. */
const MAX_TOASTS = 3;
/** 자동으로 사라지기까지(ms). */
const TOAST_TTL = 2600;
/** 같은 메시지가 이 시간 안에 또 오면 새로 쌓지 않고 무시한다(연타 방지). */
const DEDUPE_WINDOW = 700;

let items: ToastItem[] = [];
let nextId = 1;
let lastShown: { message: string; at: number } | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(l => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot() {
  return items;
}

function remove(id: number) {
  const next = items.filter(i => i.id !== id);
  if (next.length === items.length) return;
  items = next;
  emit();
}

/**
 * 화면 상단에 안내 메시지를 띄운다. `alert()` 자리에 그대로 넣으면 된다.
 * 컴포넌트 안팎 어디서나 호출 가능하고, 호출자를 블로킹하지 않는다.
 */
export function showToast(message: string, kind: ToastKind = 'error'): void {
  if (!message) return;

  const now = Date.now();
  if (lastShown && lastShown.message === message && now - lastShown.at < DEDUPE_WINDOW) return;
  lastShown = { message, at: now };

  const item: ToastItem = { id: nextId++, message, kind };
  items = [...items, item].slice(-MAX_TOASTS);
  emit();

  setTimeout(() => remove(item.id), TOAST_TTL);
}

/** 화면 전환 등으로 남은 안내를 즉시 정리할 때. */
export function clearToasts(): void {
  if (!items.length) return;
  items = [];
  emit();
}

// ──────────────────────────────────────────────────────────────────────────────
// 호스트 — App 최상단에 딱 한 번 렌더한다.
// ──────────────────────────────────────────────────────────────────────────────

export function ToastHost() {
  const list = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (!list.length) return null;

  return (
    <Layer aria-live="polite" role="status">
      {list.map(item => (
        <Bubble key={item.id} $kind={item.kind}>{item.message}</Bubble>
      ))}
    </Layer>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 스타일
// ──────────────────────────────────────────────────────────────────────────────

const slideIn = keyframes`
  from { opacity: 0; transform: translateY(-12px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0)     scale(1);    }
`;

const KIND = {
  error:   { fg: '#fca5a5', bg: 'rgba(127,29,29,0.92)',  bd: 'rgba(248,113,113,0.45)' },
  success: { fg: '#86efac', bg: 'rgba(6,78,59,0.92)',    bd: 'rgba(74,222,128,0.45)'  },
  info:    { fg: '#bae6fd', bg: 'rgba(12,44,74,0.92)',   bd: 'rgba(125,211,252,0.40)' },
} as const;

/**
 * z-index 9500 — 전체화면 모달(ModalOverlay 1000)과 햄버거 패널(4001)보다 위.
 * 로딩 오버레이(9999)보다는 아래에 둔다(그 위엔 띄울 일이 없다).
 *
 * pointer-events는 **버블까지 전부 끈다**. 토스트가 뜨는 위치(상단 중앙)는 인게임 보드와
 * 겹치는데, 클릭으로 닫게 만들면 웨이브 도중 배치 클릭 한 번을 토스트가 삼킨다.
 * 어차피 2.6초면 사라지므로 닫기 인터랙션 없이 순수 안내로 둔다.
 */
const Layer = styled.div`
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9500;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: none;
  width: max-content;
  max-width: min(92vw, 460px);

  ${lMedia.phone} { top: 8px; gap: 6px; }
`;

const Bubble = styled.div<{ $kind: ToastKind }>`
  pointer-events: none;
  padding: 11px 18px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
  text-align: center;
  white-space: pre-line;
  backdrop-filter: blur(6px);
  box-shadow: 0 10px 30px rgba(0,0,0,0.55);
  animation: ${slideIn} 0.18s ease-out;

  ${p => {
    const c = KIND[p.$kind];
    return css`
      color: ${c.fg};
      background: ${c.bg};
      border: 1px solid ${c.bd};
    `;
  }}

  ${lMedia.phone} { font-size: 12.5px; padding: 8px 14px; }
`;
