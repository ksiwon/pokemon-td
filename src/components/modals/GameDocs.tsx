// src/components/modals/GameDocs.tsx
//
// 자료실 — 가이드(TutorialModal)가 "어떻게 노느냐"를 알려준다면, 여기는
// **"실제로 어떤 수치로 도느냐"**를 적어 둔다. 데미지식·확률·재화 수급표.
//
// 왜 가이드에서 분리했나:
//   가이드는 모드에 처음 들어갈 때 자동으로 뜬다. 거기에 계산식을 넣으면 처음 온
//   사람에게 필요 없는 숫자를 들이밀게 되고, 정작 수치가 궁금해진 뒤에는 "가이드
//   몇 번째 슬라이드였더라"를 뒤져야 한다. 슬라이드는 표를 담기에도 나쁜 그릇이다.
//   그래서 미니 포켓 가이드에 붙어 있던 재화·전투계산 슬라이드 2장을 여기로 옮겼다.
//
// [i18n] **값 칸에는 숫자와 기호만 넣는다.** 말은 전부 라벨이나 각주로 뺀다.
//   라벨·각주는 어차피 번역되지만 값 칸까지 번역 키로 만들면 표 한 줄마다 키가
//   두 개씩 늘고, 영어판에서 값만 한국어로 남는 사고가 나기 쉽다(과거 사례:
//   세이브에 굳은 한국어 이름). 어쩔 수 없는 몇 줄만 `vk`(번역되는 값)를 쓴다.
//
// [단일 출처] 숫자를 손으로 적으면 밸런스를 고칠 때마다 문서가 조용히 낡는다.
//   코드에서 끌어올 수 있는 값(퀴즈 마일스톤·팩 정의·레어도 가중치·폼 개수)은
//   import 해서 표를 만든다. 나머지는 `src`에 소스 파일명을 적어 두었다(개발용 메모 —
//   화면에는 나가지 않는다).

import { useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from '../../i18n';
import { C, FONT, SP, SCALE } from '../../styles/tokens';
import { winThin, sunken, pixelText, pixelBold, BtnColor, FRAME_W_THIN, focusRing } from '../../styles/pixel';
import {
  ModalOverlay, ModalBox, ModalHeader, ModalTitle, ModalCloseBtn,
  modalPadX, ModalTabBtn,
} from '../shared/modal.styles';
import { getExamMilestones, getKindMilestones } from '../../services/QuizService';
import { PACK_DEFS, MERGE_COPIES, MAX_STARS, CARDS_PER_PACK } from '../../services/CardService';
import { RARITY_WEIGHTS, MEGA_EVOLUTIONS, GIGANTAMAX_FORMS, FUSION_DATA } from '../../data/evolution';
import { RANKED_ROUND_SIZE, ROUND_SIZES, QUIZ_BOARD_KEYS } from '../../types/quiz';

type TFunc = (key: string, params?: Record<string, string | number>) => string;

/**
 * 표 한 줄.
 * `k`  = 라벨 번역 키
 * `v`  = 값(숫자·기호만)
 * `vk` = 번역해야만 하는 값. 날짜 표기처럼 언어마다 순서가 달라지는 것만.
 */
type Row = { k: string; v?: string; vk?: string };
/**
 * 한 덩이.
 * `src` 는 **화면에 나가지 않는다.** 수치의 실제 정의 위치를 적어 둔 개발용 메모로,
 * 이 표가 코드와 어긋났을 때 어디를 열어야 하는지 알려 준다. 플레이어에게 소스
 * 파일 경로를 보여 줄 이유는 없다.
 */
type Section = { k: string; src?: string; rows: Row[]; foot?: string };

type TabId = 'single' | 'multi' | 'cards' | 'quiz';
/** 바깥(메인 메뉴·가이드)에서 열 탭을 지정할 때 쓰는 이름. */
export type DocsTab = TabId;

const TAB_COLOR: Record<TabId, BtnColor> = {
  single: 'blue', multi: 'teal', cards: 'purple', quiz: 'cyan',
};

const TABS: TabId[] = ['single', 'multi', 'cards', 'quiz'];

/** 최종 갱신일. 수치를 고치면 여기도 같이 올린다. */
const UPDATED = '2026-08-30';

// ─── 내용 ────────────────────────────────────────────────────────────────────
// 수치 출처: docs/BALANCE.md(밸런스 단일 출처 요약본)와 각 소스 파일.

const singleSections = (): Section[] => [
  {
    k: 'docs.single.damage', src: 'utils/typeEffectiveness.ts',
    rows: [
      { k: 'docs.single.dmgLevel',  v: '50' },
      { k: 'docs.single.dmgEff',    v: '×0 / ×0.25 / ×0.5 / ×1 / ×2 / ×4' },
      { k: 'docs.single.dmgStab',   v: '×1.5' },
      { k: 'docs.single.dmgTera',   v: '×2.0' },
      { k: 'docs.single.dmgCrit',   v: '1/24 · ×1.5' },
      { k: 'docs.single.dmgRandom', v: '×0.85 ~ ×1.00' },
      { k: 'docs.single.dmgEnemy',  v: '40' },
      { k: 'docs.single.dmgSplash', v: '100px · 30%' },
    ],
    foot: 'docs.single.damageFoot',
  },
  {
    k: 'docs.single.growth', src: 'store/gameStore.ts',
    rows: [
      { k: 'docs.single.xpPerLevel', v: '100' },
      { k: 'docs.single.levelGain',  v: '+5%' },
      { k: 'docs.single.killXp',     v: '10 · 50' },
      { k: 'docs.single.maxLevel',   v: '100' },
      { k: 'docs.single.range',      v: '192px' },
    ],
    foot: 'docs.single.growthFoot',
  },
  {
    k: 'docs.single.economy', src: 'game/towerFactory.ts',
    rows: [
      { k: 'docs.single.startGold',  v: '500' },
      { k: 'docs.single.pickerCost', v: '20' },
      { k: 'docs.single.killGold',   v: '10 · 50' },
      { k: 'docs.single.rewardMult', v: '0.8 / 0.9 / 1.0 / 1.1 / 1.2' },
    ],
    foot: 'docs.single.economyFoot',
  },
  {
    k: 'docs.single.enemy', src: 'game/WaveSystem.ts',
    rows: [
      { k: 'docs.single.enemyCount', v: '5 + 1.5W' },
      { k: 'docs.single.enemyScale', v: '1.07 ^ (W−1)' },
      { k: 'docs.single.storyScale', v: '1.08 ^ (W−1)' },
      { k: 'docs.single.diffMult',   v: '0.4 / 0.55 / 0.7 / 0.85 / 1.0' },
      { k: 'docs.single.boss',       v: '×4 · ×2' },
      { k: 'docs.single.bossLife',   v: '−3' },
    ],
    foot: 'docs.single.enemyFoot',
  },
  {
    k: 'docs.single.forms', src: 'data/evolution.ts',
    rows: [
      { k: 'docs.single.megaCount',   v: `${MEGA_EVOLUTIONS.length}` },
      { k: 'docs.single.gmaxCount',   v: `${GIGANTAMAX_FORMS.length}` },
      { k: 'docs.single.fusionCount', v: `${FUSION_DATA.length}` },
      { k: 'docs.single.fusionCost',  v: '500G' },
      { k: 'docs.single.dropRate',    v: '0.1 × n' },
    ],
    foot: 'docs.single.formsFoot',
  },
];

const multiSections = (): Section[] => [
  {
    k: 'docs.multi.flow',
    rows: [
      { k: 'docs.multi.players',   v: '8' },
      { k: 'docs.multi.startLife', v: '50' },
    ],
    foot: 'docs.multi.flowFoot',
  },
  {
    k: 'docs.multi.reward', src: 'services/battleRewards.ts',
    rows: [
      { k: 'docs.multi.win',        v: '40G' },
      { k: 'docs.multi.winStreak',  v: '+15 · +30 · +50G' },
      { k: 'docs.multi.winAlive',   v: '+20G' },
      { k: 'docs.multi.loseLife',   v: '−(3 + n)' },
      { k: 'docs.multi.loseStreak', v: '60 · 100 · 150 · 200G' },
      { k: 'docs.multi.lowLife',    v: '+30 · +60G' },
    ],
    foot: 'docs.multi.rewardFoot',
  },
  {
    k: 'docs.multi.arena', src: 'services/AIPlayer.ts',
    rows: [
      { k: 'docs.multi.board',    v: '6×6' },
      { k: 'docs.multi.myZone',   v: '2' },
      { k: 'docs.multi.aiGrowth', v: '0.4 / 0.7 / 1.0' },
    ],
    foot: 'docs.multi.arenaFoot',
  },
];

const cardsSections = (): Section[] => [
  {
    k: 'docs.cards.pack', src: 'services/CardService.ts',
    rows: [
      { k: 'docs.cards.packNormal',  v: `${PACK_DEFS.normal.cost}` },
      { k: 'docs.cards.packType',    v: `${PACK_DEFS.type.cost}` },
      { k: 'docs.cards.packPremium', v: `${PACK_DEFS.premium.cost}` },
      { k: 'docs.cards.packSize',    v: `${CARDS_PER_PACK}` },
      { k: 'docs.cards.packMin',     v: 'Silver / Silver / Gold' },
      { k: 'docs.cards.packBoost',   v: `${PACK_DEFS.normal.rarityBoost} / ${PACK_DEFS.type.rarityBoost} / ${PACK_DEFS.premium.rarityBoost}` },
      { k: 'docs.cards.packPity',    v: '20' },
    ],
    foot: 'docs.cards.packFoot',
  },
  {
    k: 'docs.cards.rarity', src: 'data/evolution.ts',
    rows: [
      { k: 'docs.cards.weights', v: Object.entries(RARITY_WEIGHTS).map(([r, w]) => `${r} ${w}`).join('  ') },
      { k: 'docs.cards.cutoff',  v: '660 / 600 / 540 / 480 / 400' },
      { k: 'docs.cards.pool',    v: '#1 ~ #1025' },
    ],
    foot: 'docs.cards.rarityFoot',
  },
  {
    k: 'docs.cards.stars',
    rows: [
      { k: 'docs.cards.merge',     v: `${MERGE_COPIES}` },
      { k: 'docs.cards.maxStars',  v: `${MAX_STARS}` },
      { k: 'docs.cards.level',     v: '30 → 62' },
      { k: 'docs.cards.perStarLv', v: '+8' },
      { k: 'docs.cards.statMult',  v: '+12%' },
      { k: 'docs.cards.refund',    v: '10 / 20 / 50 / 100 / 150 / 250' },
    ],
  },
  {
    k: 'docs.cards.battle', src: 'services/CardBattleService.ts',
    rows: [
      { k: 'docs.cards.power',  v: '(50 + Lv) × 1.5 × 0.40' },
      { k: 'docs.cards.crit',   v: '1/24 · ×1.5' },
      { k: 'docs.cards.random', v: '×0.85 ~ ×1.00' },
      { k: 'docs.cards.immune', v: '0' },
    ],
    foot: 'docs.cards.battleFoot',
  },
  {
    k: 'docs.cards.synergy',
    rows: [
      { k: 'docs.cards.tier',      v: '×1.1 · ×1.3 · ×1.5' },
      { k: 'docs.cards.dot',       v: '20% · 30% · 45%' },
      { k: 'docs.cards.stun',      v: '15% · 22% · 30%' },
      { k: 'docs.cards.lifesteal', v: '20% · 30% · 45%' },
      { k: 'docs.cards.critAdd',   v: '+10 · +15 · +25%p' },
      { k: 'docs.cards.critMult',  v: '×1.75 · ×2.0 · ×2.25' },
    ],
    foot: 'docs.cards.synergyFoot',
  },
  {
    k: 'docs.cards.currency',
    rows: [
      { k: 'docs.cards.tdWave',   v: '4 + W÷6' },
      { k: 'docs.cards.tdClear',  v: '350 · 50' },
      { k: 'docs.cards.multiTop', v: '300 · 40' },
      { k: 'docs.cards.multiLow', v: '80 · 8' },
      { k: 'docs.cards.tower',    v: '10 + 2F' },
      { k: 'docs.cards.pvp',      v: '5 · 1' },
      { k: 'docs.cards.daily',    v: '30 · 1' },
      { k: 'docs.cards.ach',      v: '2 / 5 / 12 / 25 / 50' },
    ],
    foot: 'docs.cards.currencyFoot',
  },
];

const quizSections = (): Section[] => {
  /** "코인 · 별조각" 두 칸. 단위 말은 섹션 제목이 지고 값은 숫자만 남긴다. */
  const money = (m: { coins: number; starShards: number }) => `${m.coins} · ${m.starShards}`;
  const sum = (list: readonly { coins: number; starShards: number }[]) => ({
    coins: list.reduce((a, m) => a + m.coins, 0),
    starShards: list.reduce((a, m) => a + m.starShards, 0),
  });
  const exam = getExamMilestones();
  const kind = getKindMilestones();

  return [
    {
      k: 'docs.quiz.round',
      rows: [
        { k: 'docs.quiz.roundSizes', v: ROUND_SIZES.join(' / ') },
        { k: 'docs.quiz.ranked',     v: `${RANKED_ROUND_SIZE}` },
      ],
      foot: 'docs.quiz.roundFoot',
    },
    {
      // 마일스톤 표는 코드에서 뽑는다 — 액수를 고쳐도 문서가 같이 움직인다.
      k: 'docs.quiz.examReward', src: 'services/QuizService.ts',
      rows: [
        ...exam.map(m => ({ k: `docs.quiz.at|${m.threshold}`, v: money(m) })),
        { k: 'docs.quiz.total', v: money(sum(exam)) },
      ],
      foot: 'docs.quiz.examRewardFoot',
    },
    {
      k: 'docs.quiz.kindReward',
      rows: [
        ...kind.map(m => ({ k: `docs.quiz.at|${m.threshold}`, v: money(m) })),
        { k: 'docs.quiz.total', v: money(sum(kind)) },
      ],
      foot: 'docs.quiz.kindRewardFoot',
    },
    {
      k: 'docs.quiz.rank', src: 'services/DatabaseService.ts',
      rows: [
        { k: 'docs.quiz.boards',  v: `${QUIZ_BOARD_KEYS.length}` },
        { k: 'docs.quiz.reset',   vk: 'docs.quiz.resetV' },
        { k: 'docs.quiz.needLogin', vk: 'docs.quiz.needLoginV' },
      ],
      foot: 'docs.quiz.rankFoot',
    },
    {
      k: 'docs.quiz.speed', src: 'services/QuizRoomService.ts',
      rows: [
        { k: 'docs.quiz.speedTime',  v: '0 ~ 100' },
        { k: 'docs.quiz.speedOrder', v: '+50 · +30 · +15' },
        { k: 'docs.quiz.speedMiss',  v: '0' },
        { k: 'docs.quiz.speedRound', v: '10 / 20 / 30' },
        { k: 'docs.quiz.speedSec',   v: '10 / 15 / 20' },
      ],
      foot: 'docs.quiz.speedFoot',
    },
  ];
};

const SECTIONS: Record<TabId, () => Section[]> = {
  single: singleSections,
  multi:  multiSections,
  cards:  cardsSections,
  quiz:   quizSections,
};

// ─── 컴포넌트 ────────────────────────────────────────────────────────────────
interface GameDocsProps {
  onClose: () => void;
  /** 처음 열 때 보여 줄 탭. 가이드에서 넘어올 때 그 모드로 맞춘다. */
  initialTab?: TabId;
}

export const GameDocs = ({ onClose, initialTab = 'single' }: GameDocsProps) => {
  const { t }: { t: TFunc } = useTranslation();
  const [tab, setTab] = useState<TabId>(initialTab);
  const sections = SECTIONS[tab]();

  /**
   * "키|숫자" 꼴로 파라미터를 실어 보낸 라벨을 푼다.
   * 마일스톤처럼 같은 문장이 값만 바뀌며 반복되는 줄에서 키 폭증을 막는 장치.
   */
  const label = (k: string): string => {
    const [key, param] = k.split('|');
    return param ? t(key, { n: param }) : t(key);
  };

  return (
    <ModalOverlay onClick={onClose}>
      <ModalBox $size="md" $accent="gold" onClick={e => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>{t('docs.title')}</ModalTitle>
          <ModalCloseBtn onClick={onClose}>✕</ModalCloseBtn>
        </ModalHeader>

        <TabRow>
          {TABS.map(id => (
            <TabBtn key={id} $c={TAB_COLOR[id]} $on={tab === id} onClick={() => setTab(id)}>
              {t(`docs.tab.${id}`)}
            </TabBtn>
          ))}
        </TabRow>

        <Body>
          <Lead>{t(`docs.lead.${tab}`)}</Lead>

          {sections.map(sec => (
            <Section key={sec.k}>
              <SecHdr>
                <SecName>{t(sec.k)}</SecName>
              </SecHdr>
              <Table>
                {sec.rows.map((r, i) => (
                  <Tr key={i}>
                    <Th>{label(r.k)}</Th>
                    <Td>{r.vk ? t(r.vk) : r.v}</Td>
                  </Tr>
                ))}
              </Table>
              {sec.foot && <Foot>{t(sec.foot)}</Foot>}
            </Section>
          ))}

          <Updated>{t('docs.updated', { date: UPDATED })}</Updated>
        </Body>
      </ModalBox>
    </ModalOverlay>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// 스타일 — docs/DESIGN.md
// ═══════════════════════════════════════════════════════════════════════════════

const TabRow = styled.div`
  ${modalPadX}
  display: flex; gap: ${SP.xs}; flex-wrap: wrap;
  margin: 0 0 ${SP.md};
`;

/** 주 탭 — 네 모드를 갈아끼운다. 다른 창들과 같은 크기·같은 규칙. */
const TabBtn = styled(ModalTabBtn).attrs({ $grow: true })`
  justify-content: center;
`;

/**
 * 좌우 여백은 공용 토큰에서. 아래도 같은 만큼 비워 마지막 줄이 창틀에 붙지 않게 한다.
 *
 * 공용 `ModalScrollBody` 를 안 쓰고 자체 스크롤을 두고 있어서 포커스 링을 직접
 * 붙인다(크롬은 스크롤 컨테이너를 키보드로 잡게 해 주고, 그때 기본 링을 그린다).
 * 언젠가 공용 껍데기로 합치는 게 맞다 — 그러면 이 줄도 필요 없다.
 */
const Body = styled.div`
  ${modalPadX}
  ${focusRing}
  overflow-y: auto;
  padding-bottom: ${SP.lg};
  display: flex; flex-direction: column; gap: ${SP.md};
`;

const Lead = styled.p`
  ${pixelText}
  margin: 0;
  font-size: ${FONT.sm}; color: ${C.textSub};
  word-break: keep-all;
`;

const Section = styled.section`
  ${winThin('plain')}
  display: flex; flex-direction: column; gap: ${SP.sm};
`;

/**
 * 머리띠 — 창틀 '안쪽'을 꽉 채운다. 좌우로 창틀 두께만큼 나가므로 패딩으로 되돌린다.
 * (모달 헤더처럼 전면 띠로 만들면 얇은 창틀 위로 삐져나온다 — docs/DESIGN.md)
 */
const SecHdr = styled.div`
  display: flex; align-items: baseline; justify-content: space-between;
  gap: ${SP.sm};
  margin: 0 -${FRAME_W_THIN}px 0;
  padding: ${SP.xs} ${FRAME_W_THIN}px;
  background: ${C.panelSunk};
  border-bottom: ${SCALE}px solid ${C.ink};
`;

const SecName = styled.h3`
  ${pixelBold}
  margin: 0; font-size: ${FONT.md}; color: ${C.gold};
`;

const Table = styled.div`
  display: flex; flex-direction: column; gap: ${SP.xs};
`;

/**
 * 라벨 | 값 한 줄. 좁아지면 **필요한 줄만** 값이 아래로 내려간다.
 * 좁은 화면에서 무조건 column으로 쌓으면 "랭킹 반영 문항 수 / 50" 같은 짧은 줄까지
 * 두 줄을 먹어 표가 두 배로 길어진다.
 */
const Tr = styled.div`
  ${sunken()}
  display: flex; align-items: baseline; justify-content: space-between;
  gap: ${SP.sm} ${SP.md};
  flex-wrap: wrap;
`;

const Th = styled.span`
  ${pixelText}
  font-size: ${FONT.sm}; color: ${C.textSub};
  flex: 0 1 auto; word-break: keep-all;
`;

/** 값 칸 — 골드로 통일해 눈이 바로 숫자를 찾게 한다. */
const Td = styled.span`
  ${pixelText}
  font-size: ${FONT.sm}; color: ${C.gold};
  text-align: right; flex: 1 1 auto; min-width: 0;
  word-break: break-word;
`;

const Foot = styled.p`
  ${pixelText}
  margin: 0;
  font-size: ${FONT.sm}; color: ${C.textDim};
  word-break: keep-all;
`;

const Updated = styled.div`
  ${pixelText}
  font-size: ${FONT.sm}; color: ${C.textDim};
  text-align: center; padding: ${SP.xs} 0 0;
`;
