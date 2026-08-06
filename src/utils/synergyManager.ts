// src/utils/synergyManager.ts
import { GamePokemon, Synergy } from '../types/game';

// ─── Special Form Generation Mapping ────────────────────────────────────────
// Source: evolution.ts → MEGA_EVOLUTIONS / GIGANTAMAX_FORMS / FUSION_DATA
// Mega IDs: 10033–10090, Gigantamax IDs: 10195–10225, Fusion IDs: 10022/10023/10155/10156/10193/10194

const GEN_1_SPECIAL_FORMS = new Set<number>([
  // ── Gen 1 Mega Evolutions ────────────────────────────────────────────────
  10033,        // Mega Venusaur       (#3)
  10034, 10035, // Mega Charizard X/Y  (#6)
  10036,        // Mega Blastoise      (#9)
  10073,        // Mega Pidgeot        (#18)
  10090,        // Mega Beedrill       (#15)
  10037,        // Mega Alakazam       (#65)
  10071,        // Mega Slowbro        (#80)
  10038,        // Mega Gengar         (#94)
  10039,        // Mega Kangaskhan     (#115)
  10040,        // Mega Pinsir         (#127)
  10041,        // Mega Gyarados       (#130)
  10042,        // Mega Aerodactyl     (#142)
  10043, 10044, // Mega Mewtwo X/Y     (#150)
  // ── Gen 1 Gigantamax ────────────────────────────────────────────────────
  10195,        // Gigantamax Venusaur    (#3)
  10196,        // Gigantamax Charizard   (#6)
  10197,        // Gigantamax Blastoise   (#9)
  10198,        // Gigantamax Butterfree  (#12)
  10199,        // Gigantamax Pikachu     (#25)
  10200,        // Gigantamax Meowth      (#52)
  10201,        // Gigantamax Machamp     (#68)
  10202,        // Gigantamax Gengar      (#94)
  10203,        // Gigantamax Kingler     (#99)
  10204,        // Gigantamax Lapras      (#131)
  10205,        // Gigantamax Eevee       (#133)
  10206,        // Gigantamax Snorlax     (#143)
]);

const GEN_2_SPECIAL_FORMS = new Set<number>([
  // ── Gen 2 Mega Evolutions ────────────────────────────────────────────────
  10045,        // Mega Ampharos        (#181)
  10072,        // Mega Steelix         (#208)
  10046,        // Mega Scizor          (#212)
  10047,        // Mega Heracross       (#214)
  10048,        // Mega Houndoom        (#229)
  10049,        // Mega Tyranitar       (#248)
]);

const GEN_3_SPECIAL_FORMS = new Set<number>([
  // ── Gen 3 Mega Evolutions ────────────────────────────────────────────────
  10065,        // Mega Sceptile        (#254)
  10050,        // Mega Blaziken        (#257)
  10064,        // Mega Swampert        (#260)
  10051,        // Mega Gardevoir       (#282)
  10066,        // Mega Sableye         (#302)
  10052,        // Mega Mawile          (#303)
  10053,        // Mega Aggron          (#306)
  10054,        // Mega Medicham        (#308)
  10055,        // Mega Manectric       (#310)
  10070,        // Mega Sharpedo        (#319)
  10087,        // Mega Camerupt        (#323)
  10067,        // Mega Altaria         (#334)
  10056,        // Mega Banette         (#354)
  10057,        // Mega Absol           (#359)
  10074,        // Mega Glalie          (#362)
  10089,        // Mega Salamence       (#373)
  10076,        // Mega Metagross       (#376)
  10062,        // Mega Latias          (#380)
  10063,        // Mega Latios          (#381)
  10079,        // Mega Rayquaza        (#384)
]);

const GEN_4_SPECIAL_FORMS = new Set<number>([
  // ── Gen 4 Mega Evolutions ────────────────────────────────────────────────
  10088,        // Mega Lopunny         (#428)
  10058,        // Mega Garchomp        (#445)
  10059,        // Mega Lucario         (#448)
  10060,        // Mega Abomasnow       (#460)
  10068,        // Mega Gallade         (#475)
]);

const GEN_5_SPECIAL_FORMS = new Set<number>([
  // ── Gen 5 Mega Evolutions ────────────────────────────────────────────────
  10069,        // Mega Audino          (#531)
  // ── Gen 5 Gigantamax ────────────────────────────────────────────────────
  10207,        // Gigantamax Garbodor  (#569)
  // ── Gen 5 Fusion ────────────────────────────────────────────────────────
  10022,        // Black Kyurem         (#646)
  10023,        // White Kyurem         (#646)
]);

const GEN_6_SPECIAL_FORMS = new Set<number>([
  // ── Gen 6 Mega Evolutions ────────────────────────────────────────────────
  10075,        // Mega Diancie         (#719)
]);

const GEN_7_SPECIAL_FORMS = new Set<number>([
  // ── Gen 7 Gigantamax ────────────────────────────────────────────────────
  10208,        // Gigantamax Melmetal  (#809)
  // ── Gen 7 Fusion ────────────────────────────────────────────────────────
  10155,        // Necrozma-Dusk-Mane   (#800)
  10156,        // Necrozma-Dawn-Wings  (#800)
]);

const GEN_8_SPECIAL_FORMS = new Set<number>([
  // ── Gen 8 Gigantamax ────────────────────────────────────────────────────
  10209,        // Gigantamax Rillaboom    (#812)
  10210,        // Gigantamax Cinderace    (#815)
  10211,        // Gigantamax Inteleon     (#818)
  10212,        // Gigantamax Corviknight  (#823)
  10213,        // Gigantamax Orbeetle     (#826)
  10214,        // Gigantamax Drednaw      (#834)
  10215,        // Gigantamax Coalossal    (#839)
  10216,        // Gigantamax Flapple      (#841)
  10217,        // Gigantamax Appletun     (#842)
  10218,        // Gigantamax Sandaconda   (#844)
  10219,        // Gigantamax Toxtricity   (#849)
  10220,        // Gigantamax Centiskorch  (#851)
  10221,        // Gigantamax Hatterene    (#858)
  10222,        // Gigantamax Grimmsnarl   (#861)
  10223,        // Gigantamax Alcremie     (#869)
  10224,        // Gigantamax Copperajah   (#879)
  10225,        // Gigantamax Duraludon    (#884)
  // ── Gen 8 Fusion ────────────────────────────────────────────────────────
  10193,        // Calyrex-Ice-Rider       (#898)
  10194,        // Calyrex-Shadow-Rider    (#898)
]);

const GEN_9_SPECIAL_FORMS = new Set<number>([]);   // No Gen 9 special forms yet

// ─── Special Synergy Definitions ────────────────────────────────────────────
export interface SpecialSynergyDef {
  id: string;
  name: string;
  icon: string;
  pokemonIds: number[];
}

export const SPECIAL_SYNERGY_DEFS: SpecialSynergyDef[] = [
  {
    id: 'special:baby',
    name: '베이비 포켓몬',
    icon: '🍼',
    // Pichu, Cleffa, Igglybuff, Togepi, Tyrogue, Smoochum, Elekid, Magby,
    // Azurill, Wynaut, Budew, Chingling, Mime Jr., Happiny, Munchlax, Riolu, Mantyke
    pokemonIds: [172, 173, 174, 175, 236, 238, 239, 240, 298, 360, 406, 433, 439, 440, 446, 447, 458],
  },
  {
    id: 'special:yoonga',
    name: '윤가놈 파티',
    icon: '🎵',
    pokemonIds: [
      96, 97,           // Drowzee → Hypno
      127,              // Pinsir
      214,              // Heracross
      225,              // Delibird
      401, 402,         // Kricketot → Kricketune
      252, 253, 254,    // Treecko → Grovyle → Sceptile (full starter line)
    ],
  },
  {
    id: 'special:nunparty',
    name: '눈파티 파티',
    icon: '❄️',
    pokemonIds: [
      194, 195, 980,    // Wooper → Quagsire / Wooper(Paldean) → Clodsire
      471,              // Glaceon
      473,              // Mamoswine
      478,              // Froslass
      487,              // Giratina
      678,              // Meowstic
    ],
  },
  {
    id: 'special:sejun',
    name: '박세준 파티',
    icon: '⚡',
    pokemonIds: [
      417,              // Pachirisu
      129, 130,         // Magikarp → Gyarados
      280, 281, 282,    // Ralts → Kirlia → Gardevoir
      443, 444, 445,    // Gible → Gabite → Garchomp
      574, 575, 576,    // Gothita → Gothorita → Gothitelle
      661, 662, 663,    // Fletchling → Fletchinder → Talonflame
    ],
  },
  {
    id: 'special:etusha',
    name: '에투샤 파티',
    icon: '🎲',
    pokemonIds: [
      81, 82, 462,      // Magnemite → Magneton → Magnezone
      276, 277,         // Taillow → Swellow
      132,              // Ditto
      224,              // Octillery
      287, 288, 289,    // Slakoth → Vigoroth → Slaking
      446, 143,         // Munchlax → Snorlax
    ],
  },
  {
    id: 'special:legendary_birds',
    name: '전설의 새',
    icon: '🦅',
    // Articuno, Zapdos, Moltres
    pokemonIds: [144, 145, 146],
  },
  {
    id: 'special:legendary_dogs',
    name: '전설의 개',
    icon: '🐕',
    // Raikou, Entei, Suicune
    pokemonIds: [243, 244, 245],
  },
  {
    id: 'special:baruki',
    name: '배루키즈',
    icon: '🪨',
    pokemonIds: [
      236,              // Tyrogue (base form)
      438, 185,         // Bonsly → Sudowoodo
      106, 107, 237,    // Hitmonlee, Hitmonchan, Hitmontop (Tyrogue's branching evolutions)
    ],
  },
  {
    id: 'special:fossil',
    name: '화석',
    icon: '🦴',
    pokemonIds: [
      140, 141,         // Kabuto → Kabutops
      138, 139,         // Omanyte → Omastar
      347, 348,         // Anorith → Armaldo
      345, 346,         // Lileep → Cradily
      408, 409,         // Cranidos → Rampardos
      410, 411,         // Shieldon → Bastiodon
      564, 565,         // Tirtouga → Carracosta
      566, 567,         // Archen → Archeops
      698, 699,         // Amaura → Aurorus
      696, 697,         // Tyrunt → Tyrantrum
    ],
  },
  {
    id: 'special:legendary_jellyfish',
    name: '전설의 해파리',
    icon: '✨',
    // Uxie, Mesprit, Azelf
    pokemonIds: [480, 481, 482],
  },
  {
    id: 'special:three_monkeys',
    name: '3숭이',
    icon: '🐒',
    // Pansage → Simisage, Pansear → Simisear, Panpour → Simipour
    pokemonIds: [511, 512, 513, 514, 515, 516],
  },
  {
    id: 'special:lati',
    name: '라티아스, 라티오스',
    icon: '💙',
    // Latias, Latios
    pokemonIds: [380, 381],
  },
  {
    id: 'special:swords_of_justice',
    name: '성검사 4마리',
    icon: '⚔️',
    // Cobalion, Terrakion, Virizion, Keldeo
    pokemonIds: [638, 639, 640, 647],
  },
  {
    id: 'special:forces_of_nature',
    name: '로스 4형제',
    icon: '🌪️',
    // Tornadus, Thundurus, Landorus, Enamorus
    pokemonIds: [641, 642, 645, 905],
  },
  {
    id: 'special:ash_no_crown',
    name: '지우 무관 팀',
    icon: '🧢',
    pokemonIds: [
      25,               // Pikachu
      656, 657, 658,    // Froakie → Frogadier → Greninja
      661, 662, 663,    // Fletchling → Fletchinder → Talonflame
      701,              // Hawlucha
      704, 705, 706,    // Goomy → Sliggoo → Goodra
      714, 715,         // Noibat → Noivern
    ],
  },
  {
    id: 'special:ash_alola_champion',
    name: '지우 리그 우승 팀',
    icon: '🏆',
    pokemonIds: [
      25,               // Pikachu
      722, 723, 724,    // Rowlet → Dartrix → Decidueye
      744, 745,         // Rockruff → Lycanroc
      725, 726, 727,    // Litten → Torracat → Incineroar
      803, 804,         // Poipole → Naganadel
      809,              // Melmetal
    ],
  },
  {
    id: 'special:ash_world_champion',
    name: '지우 월챔 우승 팀',
    icon: '🌍🏆',
    pokemonIds: [
      25,               // Pikachu
      147, 148, 149,    // Dratini → Dragonair → Dragonite
      92, 93, 94,       // Gastly → Haunter → Gengar
      447, 448,         // Riolu → Lucario
      865,              // Sirfetch'd
      882,              // Dracovish
    ],
  },
  {
    id: 'special:volcanion_magearna',
    name: '볼케니온, 마기아나',
    icon: '⚙️',
    // Volcanion, Magearna
    pokemonIds: [721, 801],
  },
  {
    id: 'special:tapu',
    name: '카푸 4형제',
    icon: '🌺',
    // Tapu Koko, Tapu Lele, Tapu Bulu, Tapu Fini
    pokemonIds: [785, 786, 787, 788],
  },
  {
    id: 'special:ultra_beast',
    name: '울트라비스트',
    icon: '🌀',
    // Nihilego, Buzzwole, Pheromosa, Xurkitree, Celesteela, Kartana, Guzzlord
    pokemonIds: [793, 794, 795, 796, 797, 798, 799],
  },
  {
    id: 'special:regi',
    name: '레지 시리즈',
    icon: '🗿',
    // Regirock, Regice, Registeel, Regigigas, Regieleki, Regidrago
    pokemonIds: [377, 378, 379, 486, 895, 894],
  },
  {
    id: 'special:accelgor_escavalier',
    name: '어써러셔 & 싸리용',
    icon: '🔄',
    // Dondozo (#977) and Tatsugiri (#978) — both single-stage, no evolutions
    pokemonIds: [977, 978],
  },
  {
    id: 'special:four_treasures',
    name: '사흉수',
    icon: '🌑',
    // Wo-Chien, Chien-Pao, Ting-Lu, Chi-Yu
    pokemonIds: [1001, 1002, 1003, 1004],
  },
  {
    id: 'special:loyal_three',
    name: '개추 4형제',
    icon: '🍑',
    // Okidogi (#1014), Munkidori (#1015), Fezandipiti (#1016), Pecharunt (#1025)
    pokemonIds: [1014, 1015, 1016, 1025],
  },
];

/**
 * 시너지 설명을 현재 언어로 만든다.
 * `Synergy.description`은 한국어로 조립된 문자열이라 그대로 표시하면 안 된다
 * (게임 로직이 쓰는 값이라 필드 자체는 남겨둔다).
 * 키가 없으면 조립된 원문으로 폴백한다.
 */
export const getSynergyDescription = (
  syn: { id: string; level: number; count: number; description: string },
  t: (key: string, params?: Record<string, string | number>) => string,
): string => {
  const kind = syn.id.split(':')[0];
  if (kind === 'type' || kind === 'gen') {
    const units = syn.level === 3 ? 6 : syn.level === 2 ? 4 : 2;
    const key = `synergy.${kind}Desc${units}`;
    const out = t(key);
    return out === key ? syn.description : out;
  }
  if (kind === 'special') {
    const mult = getSpecialSynergyMultiplier(syn.count).toFixed(1);
    const out = t('synergy.specialDesc', { count: syn.count, mult });
    return out === 'synergy.specialDesc' ? syn.description : out;
  }
  return syn.description;
};

/**
 * 특수 시너지 표시 이름. 번역 키(`synergyData.<key>.name`)가 있으면 그것을 쓰고,
 * 없으면 정의의 원본 이름으로 폴백한다 — maps·HallOfFame이 쓰는 방식과 동일하다.
 * `SpecialSynergyDef.name`은 한국어 고정이라 영어 모드에서 그대로 노출되면 안 된다.
 */
export const getSpecialSynergyName = (
  id: string,
  t: (key: string) => string,
  fallback?: string,
): string => {
  const key = `synergyData.${id.replace('special:', '')}.name`;
  const translated = t(key);
  if (translated !== key) return translated;
  return fallback ?? SPECIAL_SYNERGY_DEFS.find(d => d.id === id)?.name ?? id;
};

// Reverse map: pokemonId → list of synergy IDs (for fast lookup)
const POKEMON_TO_SPECIAL_SYNERGIES = new Map<number, string[]>();
for (const def of SPECIAL_SYNERGY_DEFS) {
  for (const id of def.pokemonIds) {
    if (!POKEMON_TO_SPECIAL_SYNERGIES.has(id)) {
      POKEMON_TO_SPECIAL_SYNERGIES.set(id, []);
    }
    POKEMON_TO_SPECIAL_SYNERGIES.get(id)!.push(def.id);
  }
}

// ─── Special Synergy Level Helpers ──────────────────────────────────────────
export const getSpecialSynergyMultiplier = (count: number): number => {
  if (count < 2) return 1.0;
  if (count === 2) return 1.1;
  if (count === 3) return 1.2;
  if (count === 4) return 1.3;
  if (count === 5) return 1.4;
  return 1.5;
};

const getSpecialSynergyLevel = (count: number): number => {
  if (count >= 6) return 5;
  if (count >= 5) return 4;
  if (count >= 4) return 3;
  if (count >= 3) return 2;
  if (count >= 2) return 1;
  return 0;
};

const getSpecialSynergyDescription = (count: number): string => {
  const mult = getSpecialSynergyMultiplier(count);
  return `(${count}) 스탯 ${mult.toFixed(1)}배`;
};

// ─── Generation Utility ──────────────────────────────────────────────────────
export const getGenerationById = (id: number): number => {
  if (id >= 1 && id <= 151) return 1;
  if (id >= 152 && id <= 251) return 2;
  if (id >= 252 && id <= 386) return 3;
  if (id >= 387 && id <= 493) return 4;
  if (id >= 494 && id <= 649) return 5;
  if (id >= 650 && id <= 721) return 6;
  if (id >= 722 && id <= 809) return 7;
  if (id >= 810 && id <= 905) return 8;
  if (id >= 906 && id <= 1025) return 9;

  if (id > 10000) {
    if (GEN_1_SPECIAL_FORMS.has(id)) return 1;
    if (GEN_2_SPECIAL_FORMS.has(id)) return 2;
    if (GEN_3_SPECIAL_FORMS.has(id)) return 3;
    if (GEN_4_SPECIAL_FORMS.has(id)) return 4;
    if (GEN_5_SPECIAL_FORMS.has(id)) return 5;
    if (GEN_6_SPECIAL_FORMS.has(id)) return 6;
    if (GEN_7_SPECIAL_FORMS.has(id)) return 7;
    if (GEN_8_SPECIAL_FORMS.has(id)) return 8;
    if (GEN_9_SPECIAL_FORMS.has(id)) return 9;
  }
  return 0;
};

// ─── Type / Generation Synergy Calculation ───────────────────────────────────
const getTypeSynergy = (type: string, count: number): Synergy | null => {
  const name = type;
  if (count >= 6) {
    return { id: `type:${type}`, name, count, level: 3, description: `(6) 스탯 1.3배, 해당 타입 약점 데미지 0.5배` };
  }
  if (count >= 4) {
    return { id: `type:${type}`, name, count, level: 2, description: `(4) 스탯 1.3배` };
  }
  if (count >= 2) {
    return { id: `type:${type}`, name, count, level: 1, description: `(2) 스탯 1.1배` };
  }
  return null;
};

const getGenSynergy = (gen: number, count: number): Synergy | null => {
  if (gen === 0) return null;
  const name = gen.toString();
  if (count >= 6) {
    return { id: `gen:${gen}`, name, count, level: 3, description: `(6) 스탯 1.3배` };
  }
  if (count >= 4) {
    return { id: `gen:${gen}`, name, count, level: 2, description: `(4) 스탯 1.2배` };
  }
  if (count >= 2) {
    return { id: `gen:${gen}`, name, count, level: 1, description: `(2) 스탯 1.1배` };
  }
  return null;
};

// ─── Full Synergy Calculation ────────────────────────────────────────────────
// 스토리 모드에서 비활성화할 스트리머(에눈박놈) 파티 시너지
const STREAMER_SYNERGY_IDS = new Set<string>([
  'special:yoonga', 'special:nunparty', 'special:etusha', 'special:sejun',
]);

// excludeStreamerSynergies: 스토리 모드면 true → 에/눈/박/놈 파티 시너지 미적용
export const calculateActiveSynergies = (
  towers: GamePokemon[],
  excludeStreamerSynergies = false,
): Synergy[] => {
  const typeCounts = new Map<string, number>();
  const genCounts = new Map<number, number>();
  const specialCounts = new Map<string, number>();

  const activePokemon = towers.filter(t => !t.isFainted);

  for (const tower of activePokemon) {
    const gen = getGenerationById(tower.pokemonId);
    genCounts.set(gen, (genCounts.get(gen) || 0) + 1);

    for (const type of tower.types) {
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    }

    const synergyIds = POKEMON_TO_SPECIAL_SYNERGIES.get(tower.pokemonId);
    if (synergyIds) {
      for (const sid of synergyIds) {
        specialCounts.set(sid, (specialCounts.get(sid) || 0) + 1);
      }
    }
  }

  const synergies: Synergy[] = [];

  typeCounts.forEach((count, type) => {
    const synergy = getTypeSynergy(type, count);
    if (synergy) synergies.push(synergy);
  });

  genCounts.forEach((count, gen) => {
    const synergy = getGenSynergy(gen, count);
    if (synergy) synergies.push(synergy);
  });

  specialCounts.forEach((count, synergyId) => {
    if (count < 2) return;
    // 스토리 모드: 스트리머(에눈박놈) 파티 시너지는 활성화하지 않음
    if (excludeStreamerSynergies && STREAMER_SYNERGY_IDS.has(synergyId)) return;
    const def = SPECIAL_SYNERGY_DEFS.find(d => d.id === synergyId);
    if (!def) return;
    const level = getSpecialSynergyLevel(count);
    synergies.push({
      id: synergyId,
      name: def.name,
      count,
      level,
      description: getSpecialSynergyDescription(count),
    });
  });

  return synergies;
};

// ─── Stat Buff Calculation ───────────────────────────────────────────────────
export const getBuffedStats = (pokemon: GamePokemon, activeSynergies: Synergy[]) => {
  let stats = {
    attack: pokemon.attack,
    defense: pokemon.defense,
    specialAttack: pokemon.specialAttack,
    specialDefense: pokemon.specialDefense,
  };

  if (pokemon.isFainted) return stats;

  let typeBuff = 1.0;
  let genBuff = 1.0;
  let specialBuff = 1.0;

  for (const type of pokemon.types) {
    const matchingSynergies = activeSynergies
      .filter(s => s.id === `type:${type}`)
      .map(s => s.level);
    if (matchingSynergies.length > 0) {
      const bestLevel = Math.max(...matchingSynergies);
      let buff = 1.0;
      if (bestLevel === 1) buff = 1.1;
      if (bestLevel === 2) buff = 1.3;
      if (bestLevel === 3) buff = 1.3;
      if (buff > typeBuff) typeBuff = buff;
    }
  }

  const gen = getGenerationById(pokemon.pokemonId);
  const matchingGenSynergies = activeSynergies
    .filter(s => s.id === `gen:${gen}`)
    .map(s => s.level);
  if (matchingGenSynergies.length > 0) {
    const bestLevel = Math.max(...matchingGenSynergies);
    if (bestLevel === 1) genBuff = 1.1;
    if (bestLevel === 2) genBuff = 1.2;
    if (bestLevel === 3) genBuff = 1.3;
  }

  const synergyIds = POKEMON_TO_SPECIAL_SYNERGIES.get(pokemon.pokemonId);
  if (synergyIds) {
    for (const sid of synergyIds) {
      const activeSynergy = activeSynergies.find(s => s.id === sid);
      if (!activeSynergy) continue;
      const def = SPECIAL_SYNERGY_DEFS.find(d => d.id === sid);
      if (!def) continue;
      const mult = getSpecialSynergyMultiplier(activeSynergy.count);
      if (mult > specialBuff) specialBuff = mult;
    }
  }

  const finalMultiplier = typeBuff * genBuff * specialBuff;

  stats.attack = Math.floor(stats.attack * finalMultiplier);
  stats.defense = Math.floor(stats.defense * finalMultiplier);
  stats.specialAttack = Math.floor(stats.specialAttack * finalMultiplier);
  stats.specialDefense = Math.floor(stats.specialDefense * finalMultiplier);

  // [T1] 시너지 버프는 공격/방어 스탯에만 적용. HP는 원본 유지 (싱글 TD와 일관성 유지).
  //   TFT buildUnits에서도 동일하게 currentHp/maxHp는 원본 값 사용.

  return stats;
};