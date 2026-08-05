// src/components/ui/SynergyTracker.tsx
// [V9] embedded prop 추가: GameLayout 좌측 패널에 인라인 렌더 지원

import React, { useState } from "react";
import styled from "styled-components";
import { media, lMedia, isMobileOrTablet } from "../../utils/responsive.utils";
import { useTranslation } from "../../i18n";
import { useGameStore } from "../../store/gameStore";
import { SPECIAL_SYNERGY_DEFS, getSpecialSynergyName } from "../../utils/synergyManager";
import { Emoji } from "../shared/Emoji";

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
                <SynDesc>{syn.description}</SynDesc>
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
                  <SynDesc>{syn.description}</SynDesc>
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

// ── 반응형 헬퍼 → lMedia 사용 ────────────────────────────────────
const L1024 = lMedia.tablet;
const L768  = lMedia.phone;

// ── Embedded wrapper ──────────────────────────────────────────────

const EmbeddedWrapper = styled.div`
  flex: 1; overflow-y: auto;
  padding: 6px 7px;
  display: flex; flex-direction: column; gap: 4px;

  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: rgba(76,175,255,.25); border-radius: 2px; }

  ${L1024} { padding: 5px 6px; gap: 3px; }
  ${L768}  { padding: 3px 4px; gap: 2px; }
`;

const EmptyState = styled.div`
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 16px 8px; gap: 6px; opacity: 0.55;
  ${L1024} { padding: 10px 6px; gap: 4px; }
  ${L768}  { padding: 6px 4px; gap: 3px; }
`;

const EmptyIcon = styled.div`
  font-size: 22px; opacity: 0.4;
  ${L768} { font-size: 16px; }
`;

const EmptyMsg = styled.p`
  font-size: 10px; color: #5a7090; text-align: center; font-weight: 500;
  ${L1024} { font-size: 9px; }
  ${L768}  { font-size: 8px; }
`;

const EmptyHint = styled.p`
  font-size: 9px; color: #3a5060; text-align: center; line-height: 1.5;
  ${L1024} { font-size: 8px; }
  ${L768}  { display: none; }  /* 폰에서는 힌트 숨김 (공간 부족) */
`;

// ── Synergy item (shared by both modes) ───────────────────────────

const getLevelStyles = (level: number, isSpecial: boolean) => {
  if (isSpecial) {
    if (level >= 4) return `
      background: linear-gradient(145deg, rgba(60,20,80,.9), rgba(40,10,60,.95));
      border: 1px solid rgba(255,180,50,.9);
    `;
    if (level >= 3) return `
      background: linear-gradient(145deg, rgba(50,20,70,.9), rgba(30,10,50,.95));
      border: 1px solid rgba(200,100,255,.8);
    `;
    if (level >= 2) return `
      background: linear-gradient(145deg, rgba(30,40,60,.9), rgba(15,20,35,.95));
      border: 1px solid rgba(76,175,255,.7);
    `;
    return `
      background: rgba(30,40,60,.7);
      border: 1px solid rgba(205,127,50,.5);
      opacity: .85;
    `;
  }
  switch (level) {
    case 1: return `
      background: rgba(30,40,60,.7);
      border: 1px solid rgba(205,127,50,.5);
      opacity: .8;
    `;
    case 2: return `
      background: linear-gradient(145deg, rgba(30,40,60,.9), rgba(15,20,35,.95));
      border: 1px solid rgba(76,175,255,.7);
    `;
    case 3: return `
      background: linear-gradient(145deg, rgba(40,30,60,.9), rgba(25,15,35,.95));
      border: 1px solid rgba(155,89,182,.8);
    `;
    default: return "";
  }
};

const SynItem = styled.div<{ $level: number; $isSpecial: boolean }>`
  display: flex; align-items: center; gap: 6px;
  padding: 4px 5px; border-radius: 6px;
  transition: all .25s ease; cursor: default;
  ${p => getLevelStyles(p.$level, p.$isSpecial)}
  @media (hover: hover) { &:hover { filter: brightness(1.12); } }
  ${L1024} { padding: 3px 4px; gap: 5px; }
  ${L768}  { padding: 2px 3px; gap: 3px; }
`;

const SynIcon = styled.div<{ $isSpecial?: boolean }>`
  font-size: ${p => p.$isSpecial ? "15px" : "13px"};
  font-weight: bold; color: #4cafff; flex-shrink: 0;
  width: 44px; height: 13px;
  display: flex; align-items: center; justify-content: center; text-align: center;
  ${L1024} { width: 38px; font-size: ${(p: any) => p.$isSpecial ? "13px" : "11px"}; }
  ${L768}  { width: 30px; font-size: ${(p: any) => p.$isSpecial ? "11px" : "9px"}; height: 11px; }
`;

const SynImage = styled.img`
  width: 44px; height: 13px; flex-shrink: 0;
  object-fit: contain; align-self: center;
  ${L1024} { width: 38px; }
  ${L768}  { width: 30px; height: 11px; }
`;

const SynInfo = styled.div`
  display: flex; flex-direction: column; gap: 1px; overflow: hidden;
`;

const SynName = styled.div`
  font-size: 12px; font-weight: bold; color: #e8edf3;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  ${L1024} { font-size: 10px; }
  ${L768}  { font-size: 8px; }
`;

const SynDesc = styled.div`
  font-size: 10px; color: #7a8a9a; line-height: 1.3;
  ${L1024} { font-size: 8px; }
  ${L768}  { font-size: 7px; }
`;

// ── Floating mode only ────────────────────────────────────────────

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const FloatContainer = styled.div<{ $isCollapsed: boolean }>`
  position: fixed;
  left: 10px;
  top: 10px;
  width: 240px;
  max-height: ${p => p.$isCollapsed ? "46px" : "45vh"};
  overflow: hidden;
  background: linear-gradient(145deg, rgba(26,31,46,.95), rgba(15,20,25,.95));
  border: 3px solid rgba(76,175,255,.4);
  border-radius: 16px;
  padding: 12px;
  box-shadow: 0 15px 40px rgba(0,0,0,.5);
  backdrop-filter: blur(10px);
  z-index: 3000;
  transition: all .4s cubic-bezier(.4,0,.2,1);
  animation: slideInLeft .3s ease-out;

  ${media.mobile} {
    width: 130px; left: 4px; top: 4px; padding: 6px;
    max-height: ${p => p.$isCollapsed ? "34px" : "40vh"};
    border-width: 2px; border-radius: 10px;
  }
`;

const FloatTitle = styled.h3`
  font-size: 16px;
  font-weight: bold;
  color: #4cafff;
  display: flex; justify-content: space-between; align-items: center;
  margin: 0; padding-bottom: 6px;
  border-bottom: 2px solid rgba(76,175,255,.2);
  cursor: pointer; user-select: none;
  @media (hover: hover) { &:hover { color: #8ccfff; } }
  ${media.mobile} { font-size: 11px; padding-bottom: 4px; }
`;

const ToggleBtn = styled.span`
  font-size: 14px; opacity: .8; transition: transform .3s ease;
`;

const CollapseContent = styled.div<{ $isCollapsed: boolean }>`
  max-height: ${p => p.$isCollapsed ? "0" : "40vh"};
  opacity:    ${p => p.$isCollapsed ? 0   : 1  };
  overflow-y: auto;
  margin-top: ${p => p.$isCollapsed ? "0" : "10px"};
  transition: all .4s cubic-bezier(.4,0,.2,1);

  &::-webkit-scrollbar { width: 6px; }
  &::-webkit-scrollbar-track { background: rgba(0,0,0,.1); }
  &::-webkit-scrollbar-thumb { background: rgba(76,175,255,.3); border-radius: 3px; }
`;