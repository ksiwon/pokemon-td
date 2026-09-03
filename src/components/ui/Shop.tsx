// src/components/ui/Shop.tsx
// [V9] embedded prop 추가: GameLayout 우측 패널에 인라인 렌더 지원
//      embedded=true 시 플로팅 오버레이·접기 제거, 타겟 선택 오버레이는 유지

import React, { useEffect, useState, useMemo } from "react";
import styled, { css } from "styled-components";
import { media, lMedia, isMobileOrTablet } from "../../utils/responsive.utils";
import { useTranslation } from "../../i18n";
import { useGameStore } from "../../store/gameStore";
import { canEvolveWithItem, getEvolvableWithItem } from "../../data/evolution";
import { Emoji } from "../shared/Emoji";
import { showToast } from "../shared/Toast";
import { C, FONT, SP, SCALE } from "../../styles/tokens";
import { win, btn, btnThin, sunken, pixelText, pixelBold, cursorMark, cursorOn, CURSOR_GUTTER, shadowLg, focusRing } from "../../styles/pixel";
import {
  EVOLUTION_ITEMS_BY_CATEGORY,
  EVOLUTION_ITEMS,
  EvolutionItem,
} from "../../data/evolutionItems";

type ItemMode =
  | "none"
  | "potion"
  | "potion_good"
  | "potion_super"
  | "candy"
  | "revive"
  | "exp_candy"
  | string;

type ShopTab = "general" | "evolution";

interface Props {
  /** true 시 position:fixed 없이 부모 패널 안에 인라인으로 렌더 */
  embedded?: boolean;
}

export const Shop: React.FC<Props> = ({ embedded = false }) => {
  const { t } = useTranslation();
  const { money, useItem, towers, evolvePokemon, isWaveActive } = useGameStore(s => ({
    money:       s.money,
    useItem:     s.useItem,
    towers:      s.towers,
    evolvePokemon: s.evolvePokemon,
    isWaveActive: s.isWaveActive,
  }));

  const [itemMode,    setItemMode]    = useState<ItemMode>("none");
  const [activeTab,   setActiveTab]   = useState<ShopTab>("general");
  // 플로팅 모드에서만 접기/펼치기 사용
  const [isCollapsed, setIsCollapsed] = useState(() => !embedded && isMobileOrTablet());

  useEffect(() => { if (isWaveActive) setActiveTab("general"); }, [isWaveActive]);

  // 현재 즉시 사용 가능한 진화 아이템 ID 집합
  const usableItemIds = useMemo(() => {
    const ids = new Set<string>();
    const alive = towers.filter(t => !t.isFainted);
    if (!alive.length) return ids;
    Object.values(EVOLUTION_ITEMS).forEach(item => {
      if (getEvolvableWithItem(item.id).some(id => alive.some(t => t.pokemonId === id)))
        ids.add(item.id);
    });
    return ids;
  }, [towers]);

  const sortedItems = (items: EvolutionItem[]) =>
    [...items].sort((a, b) => (usableItemIds.has(a.id) ? 0 : 1) - (usableItemIds.has(b.id) ? 0 : 1));

  // ── Handlers ──────────────────────────────────────────────────

  const handleBuyPotion      = () => { if (money < 20)  { showToast(t("alerts.notEnoughMoney")); return; } setItemMode("potion"); };
  const handleBuyPotionGood  = () => { if (money < 100) { showToast(t("alerts.notEnoughMoney")); return; } setItemMode("potion_good"); };
  const handleBuyPotionSuper = () => { if (money < 500) { showToast(t("alerts.notEnoughMoney")); return; } setItemMode("potion_super"); };
  const handleBuyCandy       = () => setItemMode("candy");
  const handleBuyRevive      = () => setItemMode("revive");

  const handleBuyExpCandy = () => {
    const alive = towers.filter(t => !t.isFainted);
    if (alive.length < 2) { showToast(t("alerts.cannotUseItem")); return; }
    const min = Math.min(...alive.map(t => t.level));
    if (!alive.some(t => t.level > min)) { showToast(t("alerts.cannotUseItem")); return; }
    setItemMode("exp_candy");
  };

  const handleBuyEvolutionItem = (item: EvolutionItem) => {
    if (money < item.price) { showToast(t("alerts.notEnoughMoney")); return; }
    if (!useGameStore.getState().spendMoney(item.price)) { showToast(t("alerts.notEnoughMoney")); return; }
    setItemMode(item.id);
  };

  const handleCancel = () => {
    const currentItem = Object.values(EVOLUTION_ITEMS).find(i => i.id === itemMode);
    if (currentItem) useGameStore.getState().addMoney(currentItem.price);
    setItemMode("none");
  };

  const handleTargetSelect = async (towerId: string) => {
    const tower = towers.find(t => t.id === towerId);
    if (!tower) return;

    if (["potion","potion_good","potion_super","revive","candy","exp_candy"].includes(itemMode)) {
      // 대상 레벨에 따라 비용이 달라지는 사탕/부활/경험치사탕 — 적용 직전 돈 부족 체크.
      // (물약류는 버튼 클릭 시 이미 체크되므로 cost 0 유지)
      let cost = 0;
      if (itemMode === "candy" && !tower.isFainted && tower.level < 100) {
        cost = tower.level * 25;
      } else if (itemMode === "revive" && tower.isFainted) {
        cost = tower.level * 10;
      } else if (itemMode === "exp_candy") {
        const alive = towers.filter(tt => !tt.isFainted);
        const higher = [...new Set(alive.map(tt => tt.level))].filter(l => l > tower.level).sort((a, b) => a - b);
        cost = higher.length ? higher[0] * 50 : 0;
      }
      if (cost > 0 && money < cost) { showToast(t("alerts.notEnoughMoney")); return; }
      useItem(itemMode, towerId);
      setItemMode("none");
    } else {
      const result = canEvolveWithItem(tower.pokemonId, itemMode);
      if (result) {
        // evolvePokemon은 item 문자열(itemMode)을 받음 — EvolutionData 객체 아님
        await evolvePokemon(towerId, itemMode);
        setItemMode("none");
      }
    }
  };

  // ── Target selection overlay (모드 공통) ──────────────────────

  const currentItem = Object.values(EVOLUTION_ITEMS).find(i => i.id === itemMode);

  if (itemMode !== "none") {
    return (
      <TargetOverlay>
        <TargetModal>
          <TargetTitle>{t("shop.targetTitle")}</TargetTitle>
          <TargetSubtitle>
            {itemMode === "potion"       && t("shop.targetPotion")}
            {itemMode === "potion_good"  && t("shop.targetPotionGood")}
            {itemMode === "potion_super" && t("shop.targetPotionSuper")}
            {itemMode === "candy"        && t("shop.targetCandy")}
            {itemMode === "revive"       && t("shop.targetRevive")}
            {itemMode === "exp_candy"    && t("shop.targetExpCandy")}
            {currentItem               && t("shop.targetItem", { name: t(`items.${currentItem.id}.name`) })}
          </TargetSubtitle>
          <TowerGrid>
            {towers.map(tower => {
              let isSelectable   = false;
              let isEvolveTarget = false;
              if (["potion","potion_good","potion_super"].includes(itemMode))
                isSelectable = !tower.isFainted && tower.currentHp < tower.maxHp;
              else if (itemMode === "candy")
                isSelectable = !tower.isFainted && tower.level < 100;
              else if (itemMode === "revive")
                isSelectable = !!tower.isFainted;
              else if (itemMode === "exp_candy") {
                const alive = towers.filter(t => !t.isFainted);
                if (alive.length >= 2) {
                  const min = Math.min(...alive.map(t => t.level));
                  isSelectable = !tower.isFainted && tower.level === min && alive.some(t => t.level > min);
                }
              } else if (currentItem) {
                const r = canEvolveWithItem(tower.pokemonId, itemMode);
                isSelectable   = !!r && !tower.isFainted;
                isEvolveTarget = isSelectable;
              }

              return (
                <TowerCard key={tower.id} $isSelectable={isSelectable} $isEvolveTarget={isEvolveTarget}
                  onClick={() => isSelectable && handleTargetSelect(tower.id)}>
                  <TowerImg src={tower.sprite} alt={tower.displayName} />
                  <TowerName>{tower.displayName}</TowerName>
                  <TowerInfo>Lv.{tower.level} | HP:{Math.floor(tower.currentHp)}/{tower.maxHp}</TowerInfo>
                  {tower.isFainted && <FaintedLabel>{t("manager.fainted")}</FaintedLabel>}
                  {isSelectable && itemMode === "candy" && (
                    <PriceLabel $type="candy">{t("shop.cost", { cost: tower.level * 25 })}</PriceLabel>
                  )}
                  {isSelectable && itemMode === "revive" && (
                    <PriceLabel $type="revive">{t("shop.cost", { cost: tower.level * 10 })}</PriceLabel>
                  )}
                  {isSelectable && itemMode === "exp_candy" && (() => {
                    const alive = towers.filter(t => !t.isFainted);
                    const higher = [...new Set(alive.map(t => t.level))]
                      .filter(l => l > tower.level).sort((a,b)=>a-b);
                    const next = higher[0] ?? tower.level;
                    return (
                      <PriceLabel $type="exp">
                        {t("shop.costLevelChange", { cost: next * 50, from: tower.level, to: next })}
                      </PriceLabel>
                    );
                  })()}
                  {isEvolveTarget && (
                    <PriceLabel $type="evolve"><Emoji glyph="✨" size={12} /> {t("manager.canEvolve")}</PriceLabel>
                  )}
                </TowerCard>
              );
            })}
          </TowerGrid>
          <CancelBtn onClick={handleCancel}>{t("shop.cancelRefund")}</CancelBtn>
        </TargetModal>
      </TargetOverlay>
    );
  }

  // ── Evolution item render helper ──────────────────────────────

  const renderEvoItems = (items: EvolutionItem[]) =>
    sortedItems(items).map(item => {
      const isUsable = usableItemIds.has(item.id);
      return (
        <ClickableItem key={item.id} $isUsable={isUsable} onClick={() => handleBuyEvolutionItem(item)}>
          <ItemTop>
            <ItemName>
              {t(`items.${item.id}.name`)}
              {isUsable && <UsableTag>{t('shop.usableTag')}</UsableTag>}
            </ItemName>
            <PriceBadge>{t("shop.itemCost", { cost: item.price })}</PriceBadge>
          </ItemTop>
          <ItemDesc>{t(`items.${item.id}.description`)}</ItemDesc>
        </ClickableItem>
      );
    });

  // ── Shared inner content ──────────────────────────────────────

  const shopContent = (
    <>
      {!embedded && (
        <MoneyDisplay>{t("shop.currentMoney", { money })}</MoneyDisplay>
      )}

      {!isWaveActive && (
        <TabContainer $embedded={embedded}>
          <TabButton $isActive={activeTab === "general"}   onClick={() => setActiveTab("general")}>
            <Emoji glyph="🛒" size={14} /> {t("shop.tabGeneral")}
          </TabButton>
          <TabButton $isActive={activeTab === "evolution"} onClick={() => setActiveTab("evolution")}>
            <Emoji glyph="✨" size={14} /> {t("shop.tabEvolution")}
            {usableItemIds.size > 0 && <TabBadge>{usableItemIds.size}</TabBadge>}
          </TabButton>
        </TabContainer>
      )}

      {activeTab === "general" && (
        <ItemsContainer>
          <ClickableItem onClick={handleBuyPotion}>
            <ItemTop>
              <ItemName>{t("shop.potionName")}</ItemName>
              <PriceBadge>{t("shop.potionCost")}</PriceBadge>
            </ItemTop>
            <ItemDesc>{t("shop.potionDesc")}</ItemDesc>
          </ClickableItem>
          <ClickableItem onClick={handleBuyPotionGood}>
            <ItemTop>
              <ItemName>{t("shop.potionGoodName")}</ItemName>
              <PriceBadge>{t("shop.potionGoodCost")}</PriceBadge>
            </ItemTop>
            <ItemDesc>{t("shop.potionGoodDesc")}</ItemDesc>
          </ClickableItem>
          <ClickableItem onClick={handleBuyPotionSuper}>
            <ItemTop>
              <ItemName>{t("shop.potionSuperName")}</ItemName>
              <PriceBadge>{t("shop.potionSuperCost")}</PriceBadge>
            </ItemTop>
            <ItemDesc>{t("shop.potionSuperDesc")}</ItemDesc>
          </ClickableItem>
          <ClickableItem onClick={handleBuyRevive}>
            <ItemTop>
              <ItemName>{t("shop.reviveName")}</ItemName>
              <PriceBadge>{t("shop.reviveCost")}</PriceBadge>
            </ItemTop>
            <ItemDesc>{t("shop.reviveDesc")}</ItemDesc>
          </ClickableItem>
          <ClickableItem onClick={handleBuyCandy}>
            <ItemTop>
              <ItemName>{t("shop.candyName")}</ItemName>
              <PriceBadge>{t("shop.candyCost")}</PriceBadge>
            </ItemTop>
            <ItemDesc>{t("shop.candyDesc")}</ItemDesc>
          </ClickableItem>
          <ClickableItem onClick={handleBuyExpCandy}>
            <ItemTop>
              <ItemName>{t("shop.expCandyName")}</ItemName>
              <PriceBadge>{t("shop.expCandyPrice")}</PriceBadge>
            </ItemTop>
            <ItemDesc>{t("shop.expCandyDesc")}</ItemDesc>
          </ClickableItem>
        </ItemsContainer>
      )}

      {activeTab === "evolution" && (
        <EvolutionTab>
          <CategorySection>
            <CategoryTitle><Emoji glyph="🔥" size={14} /> {t("shop.categoryStone")}</CategoryTitle>
            <ItemGrid>{renderEvoItems(EVOLUTION_ITEMS_BY_CATEGORY.stone)}</ItemGrid>
          </CategorySection>
          <CategorySection>
            <CategoryTitle><Emoji glyph="🔗" size={14} /> {t("shop.categoryTrade")}</CategoryTitle>
            <ItemGrid>{renderEvoItems(EVOLUTION_ITEMS_BY_CATEGORY.trade)}</ItemGrid>
          </CategorySection>
          <CategorySection>
            <CategoryTitle><Emoji glyph="💝" size={14} /> {t("shop.categoryFriendship")}</CategoryTitle>
            <ItemGrid>{renderEvoItems(EVOLUTION_ITEMS_BY_CATEGORY.friendship)}</ItemGrid>
          </CategorySection>
          <CategorySection>
            <CategoryTitle><Emoji glyph="⭐" size={14} /> {t("shop.categoryOthers")}</CategoryTitle>
            <ItemGrid>{renderEvoItems(EVOLUTION_ITEMS_BY_CATEGORY.others)}</ItemGrid>
          </CategorySection>
          <CategorySection>
            <CategoryTitle><Emoji glyph="✨" size={14} /> {t("shop.categorySpecial")}</CategoryTitle>
            <ItemGrid>{renderEvoItems(EVOLUTION_ITEMS_BY_CATEGORY.special)}</ItemGrid>
          </CategorySection>
        </EvolutionTab>
      )}
    </>
  );

  // ── embedded 모드 ──────────────────────────────────────────────

  if (embedded) {
    return (
      <EmbeddedContainer>
        {shopContent}
      </EmbeddedContainer>
    );
  }

  // ── 기존 플로팅 모드 ──────────────────────────────────────────

  return (
    <ShopOverlay>
      <ShopModal $isCollapsed={isCollapsed}>
        <ShopHeader onClick={() => setIsCollapsed(!isCollapsed)}>
          <ShopTitle><Emoji glyph="🏪" size={15} /> {t("shop.title")}</ShopTitle>
          <ToggleButton><Emoji glyph={isCollapsed ? "➕" : "➖"} size={14} /></ToggleButton>
        </ShopHeader>
        <CollapseContent $isCollapsed={isCollapsed}>
          {shopContent}
        </CollapseContent>
      </ShopModal>
    </ShopOverlay>
  );
};

// ─── Styled Components ────────────────────────────────────────────
// docs/DESIGN.md 의 디자인 시스템을 따른다. 값은 tokens.ts, 창틀·글자는 pixel.ts.
//
// 걷어낸 것: 가격 pill 배지(= 요금제 표로 읽히던 원인), 반투명 유리 행,
//           둥근 모서리, hover 밝기 변화, 12px 미만 글자.

// ── 반응형 헬퍼 → lMedia 사용 ────────────────────────────────────

// ── Embedded ──────────────────────────────────────────────────────

const EmbeddedContainer = styled.div`
  flex: 1; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column;

  /* 각진 도트 스크롤바 — modal.styles 의 scrollArea 와 같은 문법 */
  &::-webkit-scrollbar { width: 10px; }
  &::-webkit-scrollbar-track { background: ${C.panelSunk}; border: ${SCALE}px solid ${C.ink}; }
  &::-webkit-scrollbar-thumb { background: ${C.divider}; border: ${SCALE}px solid ${C.ink}; }
`;

// ── Floating (현재 미사용 — GameLayout이 embedded로만 렌더한다) ────

const ShopOverlay = styled.div`
  position: fixed;
  right: 10px; top: 10px;
  z-index: 999;
  pointer-events: auto;
  ${media.mobile} { right: 4px; top: 4px; }
`;

const ShopModal = styled.div<{ $isCollapsed: boolean }>`
  ${win('gold')}
  ${pixelText}
  color: ${C.text};
  width: 260px;
  max-height: ${p => p.$isCollapsed ? "52px" : "70vh"};
  overflow: hidden;
  ${media.mobile} { width: 200px; max-height: ${p => p.$isCollapsed ? "44px" : "60vh"}; }
`;

const ShopHeader = styled.div`
  padding: ${SP.sm} ${SP.md};
  background: ${C.panelSunk};
  border-bottom: ${SCALE}px solid ${C.ink};
  display: flex; justify-content: space-between; align-items: center;
  cursor: pointer; user-select: none;
`;

const ToggleButton = styled.span`
  font-size: ${FONT.sm}; color: ${C.textDim};
`;

const ShopTitle = styled.h2`
  ${pixelBold}
  font-size: ${FONT.sm}; margin: 0;
  color: ${C.gold};
  display: flex; align-items: center; gap: ${SP.xs};
`;

const CollapseContent = styled.div<{ $isCollapsed: boolean }>`
  max-height: ${p => p.$isCollapsed ? "0" : "65vh"};
  opacity:    ${p => p.$isCollapsed ? 0   : 1  };
  overflow-y: auto;

  &::-webkit-scrollbar { width: 10px; }
  &::-webkit-scrollbar-track { background: ${C.panelSunk}; border: ${SCALE}px solid ${C.ink}; }
  &::-webkit-scrollbar-thumb { background: ${C.divider}; border: ${SCALE}px solid ${C.ink}; }
`;

const MoneyDisplay = styled.div`
  ${sunken()}
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.gold};
  margin: ${SP.sm}; padding: ${SP.xs}; text-align: center;
`;

// ── Shared shop UI ────────────────────────────────────────────────

const TabContainer = styled.div<{ $embedded?: boolean }>`
  display: flex;
  gap: ${SP.xs};
  padding: ${SP.sm};
  flex-shrink: 0;
  ${lMedia.phone} { padding: ${SP.xs}; }
`;

/** 미사용 갯수 배지 — 원이 아니라 네모. 도트 UI에 정원은 없다. */
const TabBadge = styled.span`
  position: absolute; top: -6px; right: -4px;
  background: ${C.red}; color: ${C.text};
  border: 2px solid ${C.ink};
  min-width: 18px; height: 18px; padding: 0 2px;
  ${pixelBold}
  font-size: ${FONT.sm}; line-height: 1;
  text-shadow: none;
  display: flex; align-items: center; justify-content: center;
`;

/** 탭 — 선택된 쪽만 골드 창틀. 배경 그라디언트로 상태를 알리지 않는다. */
const TabButton = styled.button<{ $isActive: boolean }>`
  ${p => btnThin(p.$isActive ? 'gold' : 'plain')}
  ${pixelBold}
  flex: 1; position: relative; min-width: 0;
  padding: ${SP.xs} 2px;
  font-size: ${FONT.sm};
  color: ${p => p.$isActive ? C.gold : C.textSub};
  display: flex; align-items: center; justify-content: center; gap: ${SP.xs};
  white-space: nowrap;
  ${focusRing}
`;

const ItemsContainer = styled.div`
  padding: 0 ${SP.sm} ${SP.sm};
  display: flex; flex-direction: column; gap: ${SP.xs};
  ${lMedia.phone} { padding: 0 ${SP.xs} ${SP.xs}; }
`;

/**
 * 상점 한 줄 — 파인 칸 + ▶ 커서.
 *
 * 예전에는 반투명 유리 행에 둥근 가격 pill이 붙어 있어 요금제 표로 읽혔다.
 * 게임 상점은 목록이고, 선택은 커서로 알린다.
 */
const ClickableItem = styled.div<{ $isUsable?: boolean }>`
  ${p => sunken(p.$isUsable ? '#2f4038' : C.panelSunk)}
  ${cursorMark}
  padding: ${SP.sm} ${SP.sm} ${SP.sm} ${CURSOR_GUTTER}px;
  cursor: pointer;
  display: flex; flex-direction: column; gap: 2px;
  @media (hover: hover) { &:hover { ${cursorOn} } }

  /* 폰 가로에서는 패널이 152px이라 커서 자리(24px)를 빼면 글자가 넘친다. */
  ${lMedia.phone} {
    padding: ${SP.sm} ${SP.xs};
    &::before { display: none; }
  }
`;

/* 이름 | 가격 (같은 줄) */
const ItemTop = styled.div`
  display: flex; align-items: baseline;
  justify-content: space-between; gap: ${SP.xs};
`;

const ItemName = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.text};
  display: flex; align-items: center; gap: ${SP.xs}; flex-wrap: wrap;
  word-break: keep-all; min-width: 0;
`;

/** 가격 — 테두리 없는 골드 글자. 배지로 감싸면 가격표가 된다. */
const PriceBadge = styled.span`
  ${pixelBold}
  flex-shrink: 0;
  font-size: ${FONT.sm}; color: ${C.gold};
  white-space: nowrap;
`;

/* 설명 (두 번째 줄) */
const ItemDesc = styled.div`
  font-size: ${FONT.sm}; color: ${C.textDim};
  word-break: keep-all;
`;

const UsableTag = styled.span`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.green};
  white-space: nowrap;
`;

/* 진화 탭 */
const EvolutionTab = styled.div`
  padding: 0 ${SP.sm} ${SP.md};
  display: flex; flex-direction: column; gap: ${SP.md};
  ${lMedia.phone} { padding: 0 ${SP.xs} ${SP.sm}; gap: ${SP.sm}; }
`;
const CategorySection = styled.div`display:flex;flex-direction:column;gap:${SP.xs};`;
const CategoryTitle   = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.gold};
  padding-bottom: ${SP.xs};
  border-bottom: ${SCALE}px solid ${C.ink};
  display: flex; align-items: center; gap: ${SP.xs};
`;
const ItemGrid = styled.div`
  display: flex; flex-direction: column; gap: ${SP.xs};
`;

// ── Target selection overlay ──────────────────────────────────────

const TargetOverlay = styled.div`
  position: fixed; inset: 0;
  /* blur 없는 단순 딤 */
  background: rgba(20, 16, 26, 0.86);
  display: flex; justify-content: center; align-items: center;
  z-index: 9999;
  padding: ${SP.lg};
`;

const TargetModal = styled.div`
  ${win('blue')}
  ${pixelText}
  color: ${C.text};
  padding: ${SP.xl};
  max-width: 1000px; width: 100%; max-height: 90vh; overflow-y: auto;

  &::-webkit-scrollbar { width: 10px; }
  &::-webkit-scrollbar-track { background: ${C.panelSunk}; border: ${SCALE}px solid ${C.ink}; }
  &::-webkit-scrollbar-thumb { background: ${C.divider}; border: ${SCALE}px solid ${C.ink}; }

  ${media.mobile}  { padding: ${SP.md}; max-height: 92vh; }
  ${lMedia.phone}  { padding: ${SP.md}; max-height: 94vh; }
`;
const TargetTitle    = styled.h2`
  ${pixelBold}
  ${shadowLg}
  text-align: center; font-size: ${FONT.xl}; color: ${C.blue};
  margin: 0 0 ${SP.md};
  ${lMedia.phone} { font-size: ${FONT.sm}; }
`;
const TargetSubtitle = styled.p`
  text-align: center; font-size: ${FONT.sm}; color: ${C.textSub};
  margin: 0 0 ${SP.xl};
`;

const TowerGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: ${SP.lg}; padding-bottom: ${SP.xl};
  ${media.mobile} { grid-template-columns: repeat(auto-fill,minmax(130px,1fr)); gap:${SP.sm}; padding-bottom:${SP.md}; }
  ${lMedia.phone} { grid-template-columns: repeat(auto-fill,minmax(130px,1fr)); gap:${SP.sm}; padding-bottom:${SP.md}; }
`;

/** 대상 카드 — 진화 가능하면 초록 창틀, 아니면 파랑. hover로 떠오르지 않는다. */
const TowerCard = styled.div<{ $isSelectable: boolean; $isEvolveTarget: boolean }>`
  ${p => win(p.$isEvolveTarget ? 'green' : 'blue')}
  ${cursorMark}
  padding: ${SP.md} ${SP.sm};
  text-align: center;
  opacity: ${p => p.$isSelectable ? 1 : 0.35};
  cursor: ${p => p.$isSelectable ? "pointer" : "not-allowed"};
  ${p => p.$isSelectable && css`
    @media (hover: hover) { &:hover { ${cursorOn} } }
  `}
`;
const TowerImg  = styled.img`
  width: 80px; height: 80px; image-rendering: pixelated; margin-bottom: ${SP.sm};
`;
const TowerName = styled.h4`
  ${pixelBold}
  font-size: ${FONT.sm}; margin: 0 0 ${SP.sm}; color: ${C.text};
`;
const TowerInfo = styled.p`font-size:${FONT.sm};margin:2px 0;color:${C.textSub};`;
const FaintedLabel = styled.p`
  ${pixelBold}
  color: ${C.red}; font-size: ${FONT.sm}; margin-top: ${SP.sm};
`;

const PRICE_COLOR: Record<string, string> = {
  candy:  C.gold,
  revive: C.red,
  exp:    C.purple,
  evolve: C.green,
};
const PriceLabel = styled.p<{ $type: "candy"|"revive"|"exp"|"evolve" }>`
  ${pixelBold}
  font-size: ${FONT.sm}; margin-top: ${SP.sm};
  color: ${p => PRICE_COLOR[p.$type] ?? C.text};
`;

const CancelBtn = styled.button`
  ${btn('red')}
  ${pixelBold}
  width: 100%; margin-top: ${SP.xl}; padding: ${SP.md};
  font-size: ${FONT.sm};
  color: ${C.text};
`;
