// src/components/ui/PokemonPicker.tsx

import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { media, lMedia } from '../../utils/responsive.utils';
import { useTranslation } from '../../i18n';
import { pokeAPI, PokemonData } from '../../api/pokeapi';
import { useGameStore } from '../../store/gameStore';
import { GameMove, Gender } from '../../types/game';
import { Rarity, RARITY_COLORS } from '../../data/evolution';
import { getMapById, getFacilityTiles } from '../../data/maps';
import { rarityBoostFromWaves } from '../../data/heldItems';
import {
  pickUsableMove, toEquippedMove, pickRandomAbility,
  computePokemonCost, statTotalOf,
} from '../../game/towerFactory';
import { ModalOverlay, ModalBox, ModalCloseBtn, MODAL_ACCENT } from '../shared/modal.styles';
import { Emoji } from '../shared/Emoji';

const REROLL_COST = 20;
const TYPE_ICON_API_BASE = 'https://www.serebii.net/pokedex-bw/type/';

interface PokemonChoice {
  data: PokemonData;
  cost: number;
  rarity: Rarity;
  gender: Gender;
}

const determineGender = (pokemonId: number): Gender => {
  const genderlessIds = [
    // Gen 1
    81, 82, 100, 101, 120, 121, 132, 137, 144, 145, 146, 150, 151,

    // Gen 2
    201, 233, 243, 244, 245, 249, 250, 251,

    // Gen 3
    292, 337, 338, 343, 344, 374, 375, 376, 377, 378, 379, 382, 383, 384, 385, 386,

    // Gen 4
    436, 437, 462, 474, 479, 480, 481, 482, 483, 484, 486, 487,
    489, 490, 491, 492, 493,

    // Gen 5
    494, 599, 600, 601, 615, 622, 623, 638, 639, 640,
    643, 644, 646, 647, 648, 649,

    // Gen 6
    703, 716, 717, 718, 719, 720, 721,

    // Gen 7
    772, 773, 774, 781,
    785, 786, 787, 788, 789, 790, 791, 792,
    793, 794, 795, 796, 797, 798, 799,
    800, 801, 802, 803, 804, 805, 806, 807, 808, 809,

    // Gen 8
    854, 855, 870, 880, 881, 882, 883,
    888, 889, 890, 893, 894, 895, 896, 897, 898,

    // Gen 9
    924, 925,                // Tandemaus, Maushold 
    984, 985, 986, 987, 988, 989, // Great Tusk~Sandy Shocks 
    990, 991, 992, 993, 994, 995, // Iron Treads~Iron Thorns 
    999, 1000,                    // Gimmighoul, Gholdengo 
    1001, 1002, 1003, 1004,       // Wo-Chien, Chien-Pao, Ting-Lu, Chi-Yu 
    1005, 1006,                   // Roaring Moon, Iron Valiant
    1007, 1008,                   // Koraidon, Miraidon 
    1009, 1010,                   // Walking Wake, Iron Leaves 
    1012, 1013,                   // Poltchageist, Sinistcha
    1020, 1021, 1022, 1023,       // Gouging Fire, Raging Bolt, Iron Boulder, Iron Crown 
    1025                          // Pecharunt 
  ];

  if (genderlessIds.includes(pokemonId)) {
    return 'genderless';
  }
  
  return Math.random() < 0.5 ? 'male' : 'female';
};

const getGenderIcon = (gender: Gender) => {
  if (gender === 'male') return '♂';
  if (gender === 'female') return '♀';
  return '⚪';
};

const getGenderColor = (gender: Gender) => {
  if (gender === 'male') return '#4A90E2';
  if (gender === 'female') return '#E91E63';
  return '#999';
};

export const PokemonPicker: React.FC<{ onClose: () => void; storyHeroPool?: number[] | null }> = ({ onClose, storyHeroPool }) => {
  const { t } = useTranslation();
  const [choices, setChoices] = useState<PokemonChoice[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // 스토리 모드에서 배치 가능한 포켓몬이 모두 배치됐을 때 true
  const [allPlaced, setAllPlaced] = useState(false);
  const setPokemonToPlace = useGameStore(state => state.setPokemonToPlace);
  const { money, spendMoney } = useGameStore(state => ({
    money: state.money,
    spendMoney: state.spendMoney,
  }));

  const loadChoices = async () => {
    setIsLoading(true);
    // [OFFLINE-FIX] try/finally로 감싸 어떤 경로로 실패해도 isLoading이 반드시 해제되게 함.
    //   (기존엔 getPokemon/getRarity가 reject하면 로딩 스피너가 영영 멈춰 있었음 — PokeAPI 무응답 시)
    try {
      // 매 호출마다 스토어에서 최신 towers를 읽어 stale closure 방지
      const currentTowers = useGameStore.getState().towers;
      // [DUP-FIX] 진화 후에도 같은 히어로가 다시 뽑히지 않도록 기본형(basePokemonId) 기준 판정
      const placedPokemonIds = new Set(currentTowers.map(t => t.basePokemonId ?? t.pokemonId));

      let ids: number[];

      if (storyHeroPool && storyHeroPool.length > 0) {
        // ── 스토리 모드: heroPool에서 중복 없이 선택 ──────────────────────────
        const available = storyHeroPool.filter(id => !placedPokemonIds.has(id));

        // 배치 가능한 후보가 전혀 없으면 → "모두 배치됨" 상태로 전환
        if (available.length === 0) {
          setAllPlaced(true);
          return;
        }

        setAllPlaced(false);
        // 풀에서 최대 3개 중복 없이 뽑기
        const shuffled = [...available].sort(() => Math.random() - 0.5);
        ids = shuffled.slice(0, 3);
      } else {
        // ── 일반 모드: 기존 랜덤 가중치 방식 ─────────────────────────────────
        // 콘테스트 홀에 포켓몬을 내보냈으면 근무 누적 웨이브만큼 고레어 등장 확률을 끌어올린다.
        const st = useGameStore.getState();
        const contestTiles = getFacilityTiles(getMapById(st.currentMap)).contestTiles;
        const scout = st.towers.find(t =>
          contestTiles.some(s => s.x === Math.floor(t.position.x / 64) && s.y === Math.floor(t.position.y / 64)));
        const boost = scout ? rarityBoostFromWaves(scout.shopWavesHeld ?? 0) : 0;
        const [id1, id2, id3] = await Promise.all([
          pokeAPI.getRandomPokemonIdWithRarity(boost),
          pokeAPI.getRandomPokemonIdWithRarity(boost),
          pokeAPI.getRandomPokemonIdWithRarity(boost),
        ]);
        ids = [id1, id2, id3];
      }

      const data = await Promise.all(ids.map(id => pokeAPI.getPokemon(id)));

      const withCostAndRarityAndGender = await Promise.all(data.map(async (p) => {
        const cost = computePokemonCost(statTotalOf(p));
        const rarity = await pokeAPI.getRarity(p.id);
        const gender = determineGender(p.id);
        return { data: p, cost, rarity, gender };
      }));

      setChoices(withCostAndRarityAndGender);
    } catch (e) {
      console.error('[PokemonPicker] 포켓몬 후보 로드 실패', e);
      setChoices([]);
      alert(t('alerts.skillLoadFailed'));
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    loadChoices();
  // loadChoices는 항상 useGameStore.getState()로 최신 값을 읽으므로 deps 불필요
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = async (choice: PokemonChoice) => {
    if (isLoading) return;

    setIsLoading(true);
    try {
      const poke = choice.data;
      // [SIM-EXTRACT] 기술 선택/효과 파싱/특성 배정은 towerFactory로 이동(동작 동일) —
      //   밸런스 시뮬 봇과 사람 구매가 같은 코드로 만들어지도록 공유한다.
      const usableMove = await pickUsableMove(poke, t('picker.fallbackMove'));
      const equippedMoves: GameMove[] = [toEquippedMove(usableMove)];
      const ability = pickRandomAbility(poke);

      // [NEW] Pay-on-Pick Logic
      // [SECURITY-FIX] 무한 골드 익스플로잇 차단.
      //   기존: 보유 포켓몬 환불을 '먼저' 하고 결제 실패 시 그냥 return → 환불금은 남고 보유물도 유지
      //   → 못 사는 카드를 반복 클릭할 때마다 +환불금이 무한 누적됐음.
      //   수정: 환불 후 결제가 실패하면 방금 돌려준 환불금을 즉시 회수(롤백)해 순증을 0으로.
      const store = useGameStore.getState();
      const currentHeld = store.pokemonToPlace;
      const refund = (currentHeld && currentHeld.originalCost) ? currentHeld.originalCost : 0;
      if (refund) store.addMoney(refund);

      // Pay for the new pokemon
      if (!store.spendMoney(choice.cost)) {
        if (refund) store.spendMoney(refund); // 롤백: 방금 준 환불 회수(보유물 변경 없음)
        alert(t('alerts.notEnoughMoneyWithCost', { cost: choice.cost }));
        setIsLoading(false);
        return;
      }

      setPokemonToPlace({
        ...poke,
        equippedMoves: equippedMoves,
        ability: ability,
        cost: 0, // Cost is already paid
        originalCost: choice.cost, // Store for refund/sell logic
        gender: choice.gender,
      });
    } catch (error) {
      console.error("Failed to fetch moves:", error);
      alert(t('alerts.skillLoadFailed'));
    }

    setIsLoading(false);
    onClose();
  };
  
  const handleReroll = () => {
    if (!spendMoney(REROLL_COST)) {
      alert(t('alerts.notEnoughMoneyWithCost', { cost: REROLL_COST }));
      return;
    }
    loadChoices();
  };
  
  // ── 모두 배치됨 화면 (스토리 모드 전용) ──────────────────────────────────
  if (allPlaced) {
    return (
      <ModalOverlay>
        <AllPlacedModal>
          <AllPlacedIcon><Emoji glyph="🛡️" size={28} /></AllPlacedIcon>
          <AllPlacedTitle>{t('picker.allPlacedTitle')}</AllPlacedTitle>
          <AllPlacedDesc>
            {t('picker.allPlacedDesc1L1')}<br />
            {t('picker.allPlacedDesc1L2')}
          </AllPlacedDesc>
          <AllPlacedSub>
            {t('picker.allPlacedDesc2L1')}<br />{t('picker.allPlacedDesc2L2')}
          </AllPlacedSub>
          <ModalCloseBtn onClick={onClose} style={{ fontSize: '16px', padding: '10px 28px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '10px', cursor: 'pointer', color: '#fff', marginTop: '8px' }}>{t('common.close')}</ModalCloseBtn>
        </AllPlacedModal>
      </ModalOverlay>
    );
  }

  return (
    <ModalOverlay>
      <ModalBox $size="xl" $accent={MODAL_ACCENT.blue} $scroll>
        <InnerPad>
        <Header>
          <div>
            <Title>{isLoading ? t('picker.loading') : t('picker.title')}</Title>
          </div>
          <ModalCloseBtn onClick={onClose}>✕</ModalCloseBtn>
        </Header>

        <Subtitle>{t('picker.subtitle')}</Subtitle>

        <CardGrid>
           {choices.map((choice, i) => {
            const p = choice.data;
            const statTotal = p.stats.hp + p.stats.attack + p.stats.defense + 
                                p.stats.specialAttack + p.stats.specialDefense + p.stats.speed;
            
            return (
              <Card
                key={i}
                $rarityColor={RARITY_COLORS[choice.rarity] || '#888'}
                onClick={() => handleSelect(choice)}
              >
                <Sprite src={p.sprite} alt={p.displayName} />
                <Info>
                  <NameRow>
                    <Name>{p.displayName}</Name>
                    <GenderIcon $gender={choice.gender}>
                       <Emoji glyph={getGenderIcon(choice.gender)} size={13} />
                    </GenderIcon>
                  </NameRow>
                  
                  <Types>
                     {p.types.map((type: string) => (
                      <TypeImage 
                        key={type} 
                        src={`${TYPE_ICON_API_BASE}${type}.gif`} 
                        alt={type} 
                      />
                    ))}
                  </Types>
                  
                  <Stats>
                    <div>{t('picker.hp')}: {p.stats.hp}</div>
                    <div>{t('picker.attack')}: {p.stats.attack}</div>
                    <div>{t('picker.defense')}: {p.stats.defense}</div>
                    <div>{t('picker.spAttack')}: {p.stats.specialAttack}</div>
                    <div>{t('picker.spDefense')}: {p.stats.specialDefense}</div>
                    <div>{t('picker.speed')}: {p.stats.speed}</div>
                     <TotalStats>{t('picker.total')}: {statTotal}</TotalStats>
                  </Stats>
                  <Cost>{t('picker.cost', { cost: choice.cost })}</Cost>
                </Info>
              </Card>
            );
          })}
        </CardGrid>

        <Actions>
          <MoneyDisplay>{t('picker.currentMoney', { money: money })}</MoneyDisplay>
          <RerollBtn onClick={handleReroll} disabled={isLoading}>
            <Emoji glyph="🔄" size={14} /> {t('picker.reroll')}
          </RerollBtn>
        </Actions>
        </InnerPad>
      </ModalBox>
    </ModalOverlay>
  );
};

// ── 반응형 헬퍼 (landscape 전용) ─────────────────────────────────
const L1024 = lMedia.tablet;
const L768  = lMedia.phone;

// ── AllPlaced 전용 스타일 ─────────────────────────────────────────────────────
const AllPlacedModal = styled.div`
  background: linear-gradient(160deg, #0d1117 0%, #080c14 100%);
  border-radius: 20px;
  padding: 48px 40px 36px;
  max-width: 420px;
  width: 90%;
  text-align: center;
  box-shadow: 0 32px 80px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.10);
  border-top: 3px solid #2ecc71;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  animation: fadeIn 0.3s ease-out;
`;
const AllPlacedIcon = styled.div`font-size: 52px; line-height: 1;`;
const AllPlacedTitle = styled.h2`
  font-size: 22px; font-weight: 800; color: #7effa0; margin: 0;
`;
const AllPlacedDesc = styled.p`
  font-size: 15px; color: #d0e8d8; line-height: 1.7; margin: 0;
`;
const AllPlacedSub = styled.p`
  font-size: 13px; color: rgba(255,255,255,0.35); line-height: 1.6; margin: 0;
`;



const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  ${L768} { margin-bottom: 8px; }
`;

const Title = styled.h2`
  font-size: 24px;
  font-weight: 800;
  color: #fff;
  margin-bottom: 4px;
  ${L1024} { font-size: 20px; }
  ${L768}  { font-size: 16px; }
  ${media.mobile} { font-size: 20px; }
`;


const Subtitle = styled.p`
  font-size: 16px;
  color: #aaa;
  margin-bottom: 20px;
  text-align: center;
  ${L768} { font-size: 12px; margin-bottom: 8px; }
`;

const CardGrid = styled.div`
  /* [FIX] 항상 3장 고정 → repeat(3, 1fr) + 중앙 정렬 */
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-bottom: 20px;
  justify-items: center;
  ${L1024} { gap: 14px; margin-bottom: 12px; }
  ${L768}  { gap: 10px; margin-bottom: 8px; }
  ${media.mobile} { gap: 10px; }
`;

const Card = styled.div<{ $rarityColor: string }>`
  background: rgba(255, 255, 255, 0.05);
  border-radius: 15px;
  /* [FIX] 카드 너비 고정 — 모달 1/3 을 꽉 채우되 최대폭 제한 */
  width: 100%;
  max-width: 260px;
  padding: 20px 18px;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 4px solid ${props => props.$rarityColor};
  @media (hover: hover) {
    &:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 20px ${props => props.$rarityColor}60;
    }
  }
  ${L1024} { padding: 14px 12px; border-width: 3px; border-radius: 10px; max-width: 220px; }
  ${L768}  { padding: 10px 8px;  border-width: 2px; border-radius: 8px;  max-width: 180px; }
  ${media.mobile} { padding: 8px; border-width: 3px; border-radius: 10px; }
`;

const Sprite = styled.img`
  width: 120px;
  height: 120px;
  margin: 0 auto 8px;
  display: block;
  image-rendering: pixelated;
  ${L1024} { width: 90px;  height: 90px; }
  ${L768}  { width: 70px;  height: 70px; }
  ${media.mobile} { width: 72px; height: 72px; }
`;

const Info = styled.div`
  margin-top: 10px;
`;

const NameRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
`;

const Name = styled.h3`
  font-size: 20px;
  font-weight: bold;
  margin: 0;
  color: #fff;
`;

const GenderIcon = styled.span<{ $gender: Gender }>`
  font-size: 16px;
  font-weight: bold;
  color: ${props => getGenderColor(props.$gender)};
`;

const Types = styled.div`
  display: flex;
  gap: 5px;
  justify-content: center;
  margin-bottom: 10px;
  flex-wrap: wrap;
  height: 24px;
  align-items: center;
`;

const TypeImage = styled.img`
  height: 18px;
  object-fit: contain;
`;

const Stats = styled.div`
  font-size: 13px;
  /* [FIX] 스탯 레이블+값이 한 줄에 표시되도록 nowrap */
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 3px 8px;
  margin-bottom: 10px;
  color: #ddd;
  /* 각 셀이 줄바꿈 없이 표시되도록 */
  & > div { white-space: nowrap; }
  ${L1024} { font-size: 11px; }
  ${L768}  { font-size: 10px; gap: 2px 4px; margin-bottom: 6px; }
  ${media.mobile} { font-size: 10px; gap: 3px; margin-bottom: 6px; }
`;

const TotalStats = styled.div`
  font-weight: bold;
  color: #FFD700;
  margin-bottom: 6px;
`;

const Cost = styled.div`
  font-size: 20px;
  font-weight: bold;
  text-align: center;
  color: #FFD700;
  padding-top: 6px;
  border-top: 1px solid rgba(255,255,255,0.08);
  ${L768} { font-size: 16px; }
`;

const Actions = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 15px;
  padding-top: 4px;
`;

const MoneyDisplay = styled.div`
  font-size: 16px;
  color: #FFD700;
  font-weight: bold;
`;

const RerollBtn = styled.button`
  padding: 12px 30px;
  font-size: 16px;
  font-weight: bold;
  background: linear-gradient(135deg, #2980b9 0%, #1a6ea8 100%);
  color: white;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  ${L768} { padding: 8px 20px; font-size: 13px; }
  &:hover { background: linear-gradient(135deg, #3498db, #2980b9); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const InnerPad = styled.div`
  padding: 20px 24px 24px;
  ${L1024} { padding: 16px 18px 20px; }
  ${L768}  { padding: 12px 14px 16px; }
  ${media.mobile} { padding: 16px 16px 20px; }
`;