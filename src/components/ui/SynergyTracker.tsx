// src/components/ui/SynergyTracker.tsx
// [V9] embedded prop 추가: GameLayout 좌측 패널에 인라인 렌더 지원

import React, { useState } from "react";
import styled from "styled-components";
import { media, lMedia, isMobileOrTablet } from "../../utils/responsive.utils";
import { useTranslation } from "../../i18n";
import { useGameStore } from "../../store/gameStore";
import { SPECIAL_SYNERGY_DEFS, getSpecialSynergyName, getSynergyDescription } from "../../utils/synergyManager";
import { Emoji } from "../shared/Emoji";
import { C, FONT, ICON, SP, SCALE } from "../../styles/tokens";
import { win, winThin, pixelText, pixelBold, type WinColor } from "../../styles/pixel";

const TYPE_ICON_API_BASE = "https://www.serebii.net/pokedex-bw/type/";

const getSynergyStyle = (
  id: string,
  t: (key: string, params?: { [key: string]: string | number }) => string
) => {
  const [type, value] = id.split(":");
  if (type === "type") {
    return { icon: null, imageUrl: `${TYPE_ICON_API_BASE}${value}.gif`, name: t(`types.${value}`) };
  }
  if (type === "gen") {
    return { icon: "G" + value, imageUrl: null, name: t("synergy.genName", { gen: value }) };
  }
  if (type === "special") {
    const def = SPECIAL_SYNERGY_DEFS.find(d => d.id === id);
    return { icon: def?.icon ?? "⭐", imageUrl: null, name: getSpecialSynergyName(id, t, def?.name) };
  }
  return { icon: "?", imageUrl: null, name: id };
};

interface Props {
  /** true 시 position:fixed 없이 부모 패널 안에 인라인으로 렌더 */
  embedded?: boolean;
}

export const SynergyTracker: React.FC<Props> = ({ embedded = false }) => {
  const { t } = useTranslation();
  const { activeSynergies, setHoveredSynergy } = useGameStore(state => ({
    activeSynergies:   state.activeSynergies,
    setHoveredSynergy: state.setHoveredSynergy,
  }));

  // 플로팅 모드에서만 접기/펼치기 사용
  const [isCollapsed, setIsCollapsed] = useState(() => !embedded && isMobileOrTablet());

  if (!activeSynergies || activeSynergies.length === 0) {
    // embedded: 안내 메시지
    if (embedded) {
      return (
        <EmbeddedWrapper>
          <EmptyState>
            <EmptyIcon><Emoji glyph="💎" size={20} /></EmptyIcon>
            <EmptyMsg>{t("synergy.empty")}</EmptyMsg>
            <EmptyHint>{t('synergy.emptyHintL1')}<br/>{t('synergy.emptyHintL2')}</EmptyHint>
          </EmptyState>
        </EmbeddedWrapper>
      );
    }
    return null;
  }

  const sorted = [...activeSynergies].sort((a, b) =>
    b.level !== a.level ? b.level - a.level : b.count - a.count
  );

  // ── embedded 모드 ──────────────────────────────────────────────
  if (embedded) {
    return (
      <EmbeddedWrapper onMouseLeave={() => setHoveredSynergy(null)}>
        {sorted.map(syn => {
          const si = getSynergyStyle(syn.id, t);
          const isSpecial = syn.id.startsWith("special:");
          return (
            <SynItem
              key={syn.id}
              $level={syn.level}
              $isSpecial={isSpecial}
              onMouseEnter={() => setHoveredSynergy(syn)}
            >
              {si.imageUrl ? (
                <SynImage src={si.imageUrl} alt={si.name} />
              ) : (
                <SynIcon $isSpecial={isSpecial}><Emoji glyph={si.icon ?? undefined} size={16} /></SynIcon>
              )}
              <SynInfo>
                <SynName>{si.name} ({syn.count})</SynName>
                <SynDesc>{getSynergyDescription(syn, t)}</SynDesc>
              </SynInfo>
            </SynItem>
          );
        })}
      </EmbeddedWrapper>
    );
  }

  // ── 기존 플로팅 모드 ──────────────────────────────────────────
  return (
    <FloatContainer
      $isCollapsed={isCollapsed}
      onMouseLeave={() => setHoveredSynergy(null)}
    >
      <FloatTitle onClick={() => setIsCollapsed(!isCollapsed)}>
        <span><Emoji glyph="💎" size={14} /> {t("synergy.title")}</span>
        <ToggleBtn><Emoji glyph={isCollapsed ? "➕" : "➖"} size={13} /></ToggleBtn>
      </FloatTitle>
      <CollapseContent $isCollapsed={isCollapsed}>
        <List>
          {sorted.map(syn => {
            const si = getSynergyStyle(syn.id, t);
            const isSpecial = syn.id.startsWith("special:");
            return (
              <SynItem
                key={syn.id}
                $level={syn.level}
                $isSpecial={isSpecial}
                onMouseEnter={() => setHoveredSynergy(syn)}
              >
                {si.imageUrl ? (
                  <SynImage src={si.imageUrl} alt={si.name} />
                ) : (
                  <SynIcon $isSpecial={isSpecial}><Emoji glyph={si.icon ?? undefined} size={16} /></SynIcon>
                )}
                <SynInfo>
                  <SynName>{si.name} ({syn.count})</SynName>
                  <SynDesc>{getSynergyDescription(syn, t)}</SynDesc>
                </SynInfo>
              </SynItem>
            );
          })}
        </List>
      </CollapseContent>
    </FloatContainer>
  );
};
// ─── Styled Components ────────────────────────────────────────────
// docs/DESIGN.md 의 디자인 시스템을 따른다.
//
// 걷어낸 것: 등급별 그라디언트 + 반투명 테두리(= 유리 카드), 둥근 모서리,
//           hover 밝기 변화, 7~10px 글자.

// ── 반응형 헬퍼 → lMedia 사용 ────────────────────────────────────

// ── Embedded wrapper ──────────────────────────────────────────────

const EmbeddedWrapper = styled.div`
  flex: 1; overflow-y: auto;
  padding: ${SP.sm};
  display: flex; flex-direction: column; gap: ${SP.xs};

  /* 각진 도트 스크롤바 */
  &::-webkit-scrollbar { width: 10px; }
  &::-webkit-scrollbar-track { background: ${C.panelSunk}; border: ${SCALE}px solid ${C.ink}; }
  &::-webkit-scrollbar-thumb { background: ${C.divider}; border: ${SCALE}px solid ${C.ink}; }

  ${lMedia.phone} { padding: ${SP.xs}; }
`;

const EmptyState = styled.div`
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: ${SP.lg} ${SP.sm}; gap: ${SP.sm};
  ${lMedia.phone} { padding: ${SP.sm} ${SP.xs}; gap: ${SP.xs}; }
`;

const EmptyIcon = styled.div`
  font-size: ${ICON.xl}px; line-height: 1;
  ${lMedia.phone} { font-size: ${ICON.md}px; }
`;

/* 예전에는 #5a7090 에 opacity 0.55 라 배경에 묻혀 읽히지 않았다. */
const EmptyMsg = styled.p`
  ${pixelText}
  font-size: ${FONT.sm}; color: ${C.textSub}; text-align: center;
  margin: 0;
`;

const EmptyHint = styled.p`
  ${pixelText}
  font-size: ${FONT.sm}; color: ${C.textDim}; text-align: center;
  margin: 0;
  ${lMedia.phone} { display: none; }  /* 폰에서는 힌트 숨김 (공간 부족) */
`;

// ── Synergy item (shared by both modes) ───────────────────────────

/**
 * 시너지 등급 → 창틀 색.
 *
 * 예전에는 등급마다 배경 그라디언트와 반투명 테두리를 따로 만들어 총 7가지
 * 조합이 있었다. 디자인 시스템 원칙 ①(채움은 고정, 테마는 테두리만)에 따라
 * 등급은 창틀 색 하나로만 표현한다.
 */
const levelColor = (level: number, isSpecial: boolean): WinColor => {
  if (isSpecial) {
    if (level >= 4) return 'gold';
    if (level >= 3) return 'purple';
    if (level >= 2) return 'blue';
    return 'plain';
  }
  if (level >= 3) return 'purple';
  if (level >= 2) return 'blue';
  return 'plain';
};

const SynItem = styled.div<{ $level: number; $isSpecial: boolean }>`
  ${p => winThin(levelColor(p.$level, p.$isSpecial))}
  display: flex; align-items: center; gap: ${SP.sm};
  padding: ${SP.xs} ${SP.xs} ${SP.xs} 0;
  cursor: default;
  /* 1단계는 아직 효과가 약하다는 걸 채도로 알린다 */
  opacity: ${p => (p.$level <= 1 ? 0.75 : 1)};
  ${lMedia.phone} { gap: ${SP.xs}; }
`;

const SynIcon = styled.div<{ $isSpecial?: boolean }>`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.blue}; flex-shrink: 0;
  width: 44px;
  display: flex; align-items: center; justify-content: center; text-align: center;
  ${lMedia.phone} { width: 32px; }
`;

const SynImage = styled.img`
  width: 44px; height: 14px; flex-shrink: 0;
  object-fit: contain; align-self: center;
  ${lMedia.phone} { width: 32px; }
`;

const SynInfo = styled.div`
  display: flex; flex-direction: column; overflow: hidden; min-width: 0;
`;

const SynName = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.text};
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
`;

const SynDesc = styled.div`
  font-size: ${FONT.sm}; color: ${C.textDim};
  word-break: keep-all;
`;

// ── Floating mode only (현재 미사용 — GameLayout이 embedded로만 렌더한다) ──

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${SP.xs};
`;

const FloatContainer = styled.div<{ $isCollapsed: boolean }>`
  ${win('blue')}
  ${pixelText}
  position: fixed;
  left: 10px; top: 10px;
  width: 260px;
  max-height: ${p => p.$isCollapsed ? "52px" : "45vh"};
  overflow: hidden;
  color: ${C.text};
  z-index: 3000;

  ${media.mobile} {
    width: 180px; left: 4px; top: 4px;
    max-height: ${p => p.$isCollapsed ? "44px" : "40vh"};
  }
`;

const FloatTitle = styled.h3`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${C.gold};
  display: flex; justify-content: space-between; align-items: center;
  margin: 0; padding-bottom: ${SP.sm};
  border-bottom: ${SCALE}px solid ${C.ink};
  cursor: pointer; user-select: none;
`;

const ToggleBtn = styled.span`
  font-size: ${FONT.sm}; color: ${C.textDim};
`;

const CollapseContent = styled.div<{ $isCollapsed: boolean }>`
  max-height: ${p => p.$isCollapsed ? "0" : "40vh"};
  opacity:    ${p => p.$isCollapsed ? 0   : 1  };
  overflow-y: auto;
  margin-top: ${p => p.$isCollapsed ? "0" : `${SP.sm}`};

  &::-webkit-scrollbar { width: 10px; }
  &::-webkit-scrollbar-track { background: ${C.panelSunk}; border: ${SCALE}px solid ${C.ink}; }
  &::-webkit-scrollbar-thumb { background: ${C.divider}; border: ${SCALE}px solid ${C.ink}; }
`;
