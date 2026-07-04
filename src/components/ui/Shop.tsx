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

  const handleBuyPotion      = () => { if (money < 20)  { alert(t("alerts.notEnoughMoney")); return; } setItemMode("potion"); };
  const handleBuyPotionGood  = () => { if (money < 100) { alert(t("alerts.notEnoughMoney")); return; } setItemMode("potion_good"); };
  const handleBuyPotionSuper = () => { if (money < 500) { alert(t("alerts.notEnoughMoney")); return; } setItemMode("potion_super"); };
  const handleBuyCandy       = () => setItemMode("candy");
  const handleBuyRevive      = () => setItemMode("revive");

  const handleBuyExpCandy = () => {
    const alive = towers.filter(t => !t.isFainted);
    if (alive.length < 2) { alert(t("alerts.cannotUseItem")); return; }
    const min = Math.min(...alive.map(t => t.level));
    if (!alive.some(t => t.level > min)) { alert(t("alerts.cannotUseItem")); return; }
    setItemMode("exp_candy");
  };

  const handleBuyEvolutionItem = (item: EvolutionItem) => {
    if (money < item.price) { alert(t("alerts.notEnoughMoney")); return; }
    if (!useGameStore.getState().spendMoney(item.price)) { alert(t("alerts.notEnoughMoney")); return; }
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
      if (cost > 0 && money < cost) { alert(t("alerts.notEnoughMoney")); return; }
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

// ── 반응형 헬퍼 → lMedia 사용 ────────────────────────────────────
const L1024 = lMedia.tablet;
const L768  = lMedia.phone;

// ── Embedded ──────────────────────────────────────────────────────

const EmbeddedContainer = styled.div`
  flex: 1; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column;

  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: rgba(243,156,18,.3); border-radius: 2px; }
`;

// ── Floating ──────────────────────────────────────────────────────

const ShopOverlay = styled.div`
  position: fixed;
  right: 10px; top: 10px;
  z-index: 999;
  pointer-events: auto;
  ${media.mobile} { right: 4px; top: 4px; }
`;

const ShopModal = styled.div<{ $isCollapsed: boolean }>`
  background: linear-gradient(145deg, rgba(26,31,46,.98), rgba(15,20,25,.98));
  color: #e8edf3;
  border-radius: 12px;
  padding: 0;
  width: 240px;
  max-height: ${p => p.$isCollapsed ? "46px" : "70vh"};
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(243,156,18,.4), 0 0 2px 1px rgba(243,156,18,.3);
  border: 3px solid rgba(243,156,18,.4);
  backdrop-filter: blur(10px);
  transition: all .4s cubic-bezier(.4,0,.2,1);
  animation: slideInRight .3s ease-out;
  ${media.mobile} {
    width: 150px;
    max-height: ${p => p.$isCollapsed ? "36px" : "60vh"};
    border-width: 2px; border-radius: 10px;
  }
`;

const ShopHeader = styled.div`
  padding: 12px;
  background: linear-gradient(90deg, rgba(243,156,18,.2), transparent);
  border-bottom: 2px solid rgba(243,156,18,.3);
  display: flex; justify-content: space-between; align-items: center;
  cursor: pointer; user-select: none; min-height: 36px;
  @media (hover: hover) { &:hover { background: linear-gradient(90deg, rgba(243,156,18,.3), transparent); } }
  ${media.mobile} { padding: 8px; min-height: 34px; }
`;

const ToggleButton = styled.span`
  font-size: 14px; opacity: .8; transition: transform .3s ease;
`;

const ShopTitle = styled.h2`
  font-size: 16px; font-weight: bold; margin: 0;
  color: #f39c12;
  text-shadow: 0 0 10px rgba(243,156,18,.6);
`;

const CollapseContent = styled.div<{ $isCollapsed: boolean }>`
  max-height: ${p => p.$isCollapsed ? "0" : "65vh"};
  opacity:    ${p => p.$isCollapsed ? 0   : 1  };
  overflow-y: auto;
  transition: all .4s cubic-bezier(.4,0,.2,1);

  &::-webkit-scrollbar { width: 6px; }
  &::-webkit-scrollbar-track { background: rgba(0,0,0,.1); }
  &::-webkit-scrollbar-thumb { background: rgba(243,156,18,.3); border-radius: 3px; }
`;

const MoneyDisplay = styled.div`
  font-size: 13px; font-weight: bold; color: #ffd700;
  margin: 8px 12px; text-align: center;
  text-shadow: 0 0 10px rgba(255,215,0,.7);
  padding: 6px; background: rgba(255,215,0,.1); border-radius: 8px;
  ${media.mobile} { font-size: 11px; margin: 4px 8px; padding: 4px; }
`;

// ── Shared shop UI ────────────────────────────────────────────────

const TabContainer = styled.div<{ $embedded?: boolean }>`
  display: flex;
  gap: ${p => p.$embedded ? "4px" : "6px"};
  padding: ${p => p.$embedded ? "5px 7px" : "0 12px 10px"};
  flex-shrink: 0;
  ${L1024} { padding: ${(p: any) => p.$embedded ? "4px 6px" : "0 10px 8px"}; gap: 3px; }
  ${L768}  { padding: ${(p: any) => p.$embedded ? "3px 5px" : "0 8px 6px"}; gap: 3px; }
`;

const TabBadge = styled.span`
  position: absolute; top: -6px; right: -6px;
  background: #e74c3c; color: #fff;
  border-radius: 50%; width: 16px; height: 16px;
  font-size: 10px; font-weight: bold;
  display: flex; align-items: center; justify-content: center;
`;

const TabButton = styled.button<{ $isActive: boolean }>`
  flex: 1; position: relative; padding: 6px 8px;
  background: ${p => p.$isActive
    ? "linear-gradient(145deg,rgba(243,156,18,.3),rgba(243,156,18,.15))"
    : "linear-gradient(145deg,rgba(30,40,60,.6),rgba(15,20,35,.6))"};
  color: ${p => p.$isActive ? "#f39c12" : "#a0aec0"};
  border: ${p => p.$isActive
    ? "2px solid rgba(243,156,18,.6)"
    : "1px solid rgba(255,255,255,.1)"};
  border-radius: 8px;
  font-size: 12px; font-weight: bold; cursor: pointer;
  transition: all .2s ease;
  @media (hover: hover) { &:hover { background: linear-gradient(145deg,rgba(243,156,18,.2),rgba(243,156,18,.1)); } }
  ${L1024} { font-size: 10px; padding: 5px 6px; }
  ${L768}  { font-size: 9px;  padding: 4px 5px; }
`;

const ItemsContainer = styled.div`
  padding: 0 8px 8px;
  display: flex; flex-direction: column; gap: 5px;
  ${L1024} { padding: 0 6px 6px; gap: 4px; }
  ${L768}  { padding: 0 5px 5px; gap: 3px; }
`;

/* ── 일반/진화 공통 클릭 가능 아이템 ── */
const ClickableItem = styled.div<{ $isUsable?: boolean }>`
  background: ${p => p.$isUsable ? "rgba(46,204,113,.07)" : "rgba(255,255,255,.03)"};
  border: 1px solid ${p => p.$isUsable ? "rgba(46,204,113,.35)" : "rgba(255,255,255,.09)"};
  border-radius: 8px; padding: 7px 9px; cursor: pointer;
  display: flex; flex-direction: column; gap: 3px;
  transition: filter .15s, border-color .15s;
  @media (hover: hover) { &:hover { filter: brightness(1.14); border-color: rgba(243,156,18,.4); } }
  &:active { filter: brightness(0.88); }
  ${L1024} { padding: 6px 7px; gap: 2px; border-radius: 7px; }
  ${L768}  { padding: 4px 6px; gap: 2px; border-radius: 6px; }
`;

/* 이름 | 가격 (같은 줄) */
const ItemTop = styled.div`
  display: flex; align-items: center;
  justify-content: space-between; gap: 6px;
  ${L768} { gap: 4px; }
`;

const ItemName = styled.div`
  font-size: 13px; font-weight: bold; color: #e8edf3;
  display: flex; align-items: center; gap: 5px; flex-wrap: wrap;
  word-break: keep-all;
  ${L1024} { font-size: 11px; gap: 4px; }
  ${L768}  { font-size: 9px;  gap: 3px; }
`;

const PriceBadge = styled.span`
  flex-shrink: 0; font-size: 11px; font-weight: 700;
  color: #f5b030; background: rgba(245,176,48,.12);
  border: 1px solid rgba(245,176,48,.45);
  border-radius: 5px; padding: 2px 9px; white-space: nowrap;
  ${L1024} { font-size: 10px; padding: 2px 7px; }
  ${L768}  { font-size: 8px;  padding: 1px 5px; border-radius: 4px; }
`;

/* 설명 (두 번째 줄) */
const ItemDesc = styled.div`
  font-size: 10px; color: #7a8a9a;
  word-break: keep-all; line-height: 1.4;
  ${L1024} { font-size: 9px; }
  ${L768}  { font-size: 8px; }
`;

const UsableTag = styled.span`
  font-size: 9px; font-weight: 600; color: #4fe08a;
  background: rgba(46,204,113,.18); border-radius: 3px;
  padding: 1px 5px; white-space: nowrap;
  ${L1024} { font-size: 8px; padding: 1px 4px; }
  ${L768}  { font-size: 7px; padding: 1px 3px; }
`;

/* 진화 탭 */
const EvolutionTab = styled.div`
  padding: 0 8px 12px; display: flex; flex-direction: column; gap: 10px;
  ${L1024} { padding: 0 6px 10px; gap: 8px; }
  ${L768}  { padding: 0 5px 8px;  gap: 6px; }
`;
const CategorySection = styled.div`display:flex;flex-direction:column;gap:5px;`;
const CategoryTitle   = styled.div`
  font-size: 11px; font-weight: bold; color: #a8b8c8;
  padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,.07);
  ${L1024} { font-size: 10px; }
  ${L768}  { font-size: 9px; }
`;
const ItemGrid = styled.div`
  display: flex; flex-direction: column; gap: 4px;
  ${L768} { gap: 3px; }
`;

// ── Target selection overlay ──────────────────────────────────────

const TargetOverlay = styled.div`
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: radial-gradient(circle at center, rgba(0,0,0,.85), rgba(0,0,0,.95));
  backdrop-filter: blur(8px);
  display: flex; justify-content: center; align-items: center;
  z-index: 9999;
  animation: fadeIn .3s ease-out;
  @keyframes fadeIn { from{opacity:0} to{opacity:1} }
`;

const TargetModal = styled.div`
  background: linear-gradient(145deg, #1a1f2e 0%, #0f1419 100%);
  color: #e8edf3; border-radius: 24px; padding: 32px;
  max-width: 1000px; width: 90%; max-height: 90vh; overflow-y: auto;
  box-shadow: 0 25px 80px rgba(0,0,0,.6), 0 0 1px 1px rgba(76,175,255,.3);
  border: 2px solid rgba(76,175,255,.2);
  animation: slideInUp .4s ease-out;
  @keyframes slideInUp { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:translateY(0)} }
  ${media.mobile} { padding: 16px; width: 96%; border-radius: 16px; max-height: 92vh; }
`;
const TargetTitle    = styled.h2`text-align:center;font-size:24px;font-weight:bold;color:#4cafff;margin-bottom:16px;`;
const TargetSubtitle = styled.p`text-align:center;font-size:16px;color:#a8b8c8;margin-bottom:24px;`;

const TowerGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 20px; padding-bottom: 24px;
  ${media.mobile} { grid-template-columns: repeat(auto-fill,minmax(130px,1fr)); gap:10px; padding-bottom:12px; }
`;

const TowerCard = styled.div<{ $isSelectable: boolean; $isEvolveTarget: boolean }>`
  background: linear-gradient(145deg, rgba(30,40,60,.9), rgba(15,20,35,.95));
  border: 2px solid ${p => p.$isEvolveTarget ? "#2ecc71" : "rgba(52,152,219,.4)"};
  border-radius: 16px; padding: 20px; text-align: center;
  transition: all .3s ease;
  box-shadow: 0 8px 24px rgba(0,0,0,.3);
  opacity: ${p => p.$isSelectable ? 1 : 0.3};
  cursor: ${p => p.$isSelectable ? "pointer" : "not-allowed"};
  ${p => p.$isSelectable && css`
    @media (hover: hover) {
      &:hover {
        transform: translateY(-2px);
        border-color: ${p.$isEvolveTarget ? "#34f58b" : "#4cafff"};
      }
    }
  `}
`;
const TowerImg  = styled.img`width:80px;height:80px;image-rendering:pixelated;margin-bottom:12px;filter:drop-shadow(0 4px 8px rgba(0,0,0,.6));`;
const TowerName = styled.h4`font-size:16px;font-weight:700;margin:0 0 8px;color:#fff;`;
const TowerInfo = styled.p`font-size:12px;margin:4px 0;color:#a8b8c8;`;
const FaintedLabel = styled.p`color:#e74c3c;font-weight:bold;font-size:12px;margin-top:8px;`;

const priceColorMap: Record<string, string> = {
  candy:  "#f39c12",
  revive: "#e74c3c",
  exp:    "#9b59b6",
  evolve: "#2ecc71",
};
const PriceLabel = styled.p<{ $type: "candy"|"revive"|"exp"|"evolve" }>`
  font-weight: bold; font-size: 12px; margin-top: 8px;
  color: ${p => priceColorMap[p.$type] ?? "#fff"};
`;

const CancelBtn = styled.button`
  width: 100%; margin-top: 24px; padding: 16px; font-size: 18px;
  background: linear-gradient(135deg,#e74c3c 0%,#c0392b 100%);
  color: #fff; border: 2px solid rgba(231,76,60,.4);
  border-radius: 14px; cursor: pointer; font-weight: bold;
  box-shadow: 0 6px 20px rgba(231,76,60,.4), inset 0 1px 0 rgba(255,255,255,.2);
  @media (hover: hover) { &:hover { background: linear-gradient(135deg,#c0392b 0%,#a93226 100%); } }
`;