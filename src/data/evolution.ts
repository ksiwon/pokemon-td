// src/data/evolution.ts

export interface EvolutionData {
  from: number;
  to: number;
  level?: number; // 레벨 진화 시 필요
  item?: string; // 진화의 돌 or 연결의 끈
  gender?: 'male' | 'female'; // 성별에 따른 진화 분기
  timeOfDay?: 'day' | 'night'; // 시간대에 따른 진화 분기
  regionalForm?: string; // 리전폼 구분 (예: 'alola', 'galar', 'hisui')
}

// 메가진화 데이터 (10000번대 ID 사용)
export interface MegaEvolutionData {
  from: number; // 최종 진화체 포켓몬 ID
  to: number; // 메가진화 폼 ID (10000+)
  item: string; // 메가스톤 아이템 이름
}

// 거다이맥스 데이터 (10200번대 ID 사용)
export interface GigantamaxData {
  from: number; // 포켓몬 ID
  to: number; // 거다이맥스 폼 ID (10200+)
  item: 'max-mushroom'; // 다이버섯
}

export const EVOLUTION_CHAINS: EvolutionData[] = [
  // === 1세대 (1-151) ===
  // 레벨 진화
  { from: 1, to: 2, level: 16 }, { from: 2, to: 3, level: 32 },
  { from: 4, to: 5, level: 16 }, { from: 5, to: 6, level: 36 },
  { from: 7, to: 8, level: 16 }, { from: 8, to: 9, level: 36 },
  { from: 10, to: 11, level: 7 }, { from: 11, to: 12, level: 10 },
  { from: 13, to: 14, level: 7 }, { from: 14, to: 15, level: 10 },
  { from: 16, to: 17, level: 18 }, { from: 17, to: 18, level: 36 },
  { from: 19, to: 20, level: 20 }, { from: 21, to: 22, level: 20 },
  { from: 23, to: 24, level: 22 }, 
  { from: 27, to: 28, level: 22 }, { from: 29, to: 30, level: 16 },
  { from: 32, to: 33, level: 16 }, { from: 41, to: 42, level: 22 },
  { from: 43, to: 44, level: 21 },
  { from: 46, to: 47, level: 24 },
  { from: 48, to: 49, level: 31 }, { from: 50, to: 51, level: 26 },
  { from: 52, to: 53, item: 'friendship-evolution' }, // 나옹(A) -> 페르시온(A) (친밀도)
  { from: 54, to: 55, level: 33 },
  { from: 56, to: 57, level: 28 }, 
  { from: 60, to: 61, level: 25 }, 
  { from: 63, to: 64, level: 16 },
  { from: 66, to: 67, level: 28 },
  { from: 69, to: 70, level: 21 },
  { from: 72, to: 73, level: 30 }, { from: 74, to: 75, level: 25 },
  { from: 77, to: 78, level: 40 },
  { from: 79, to: 80, level: 37 }, { from: 81, to: 82, level: 30 },
  { from: 84, to: 85, level: 31 }, { from: 86, to: 87, level: 34 },
  { from: 88, to: 89, level: 38 }, { from: 92, to: 93, level: 25 },
  { from: 96, to: 97, level: 26 },
  { from: 98, to: 99, level: 28 }, { from: 100, to: 101, level: 30 },
  { from: 104, to: 105, level: 28 }, { from: 109, to: 110, level: 35 },
  { from: 111, to: 112, level: 42 }, { from: 116, to: 117, level: 32 },
  { from: 118, to: 119, level: 33 }, { from: 129, to: 130, level: 20 },
  { from: 138, to: 139, level: 40 }, { from: 140, to: 141, level: 40 },
  { from: 147, to: 148, level: 30 }, { from: 148, to: 149, level: 55 },
  
  // 통신 교환 진화 → linking-cord
  { from: 64, to: 65, item: 'linking-cord' },
  { from: 67, to: 68, item: 'linking-cord' },
  { from: 75, to: 76, item: 'linking-cord' },
  { from: 93, to: 94, item: 'linking-cord' },
  
  // 진화의 돌 진화 (1세대)
  { from: 25, to: 26, item: 'thunder-stone' },
  { from: 30, to: 31, item: 'moon-stone' },
  { from: 33, to: 34, item: 'moon-stone' },
  { from: 35, to: 36, item: 'moon-stone' },
  { from: 37, to: 38, item: 'fire-stone' },
  { from: 39, to: 40, item: 'moon-stone' },
  { from: 44, to: 45, item: 'leaf-stone' }, // 냄새꼬 -> 라플레시아
  { from: 58, to: 59, item: 'fire-stone' },
  { from: 61, to: 62, item: 'water-stone' }, // 수륙챙이 -> 강챙이
  { from: 70, to: 71, item: 'leaf-stone' },
  { from: 90, to: 91, item: 'water-stone' },
  { from: 102, to: 103, item: 'leaf-stone' },
  { from: 120, to: 121, item: 'water-stone' },
  { from: 133, to: 134, item: 'water-stone' },
  { from: 133, to: 135, item: 'thunder-stone' },
  { from: 133, to: 136, item: 'fire-stone' },
  
  // === 2세대 (152-251) ===
  { from: 152, to: 153, level: 16 }, { from: 153, to: 154, level: 32 },
  { from: 155, to: 156, level: 14 }, { from: 156, to: 157, level: 36 },
  { from: 158, to: 159, level: 18 }, { from: 159, to: 160, level: 30 },
  { from: 161, to: 162, level: 15 },
  { from: 163, to: 164, level: 20 },
  { from: 165, to: 166, level: 18 },
  { from: 167, to: 168, level: 22 },
  { from: 170, to: 171, level: 27 },
  { from: 172, to: 25, item: 'friendship-evolution' }, // 피츄 → 피카츄 (친밀도)
  { from: 173, to: 35, item: 'friendship-evolution' }, // 삐 → 삐삐 (친밀도)
  { from: 174, to: 39, item: 'friendship-evolution' }, // 푸푸린 → 푸린 (친밀도)
  { from: 175, to: 176, item: 'friendship-evolution' }, // 토게피 → 토게틱 (친밀도)
  { from: 177, to: 178, level: 25 },
  { from: 179, to: 180, level: 15 }, { from: 180, to: 181, level: 30 },
  { from: 183, to: 184, level: 18 }, 
  { from: 187, to: 188, level: 18 }, { from: 188, to: 189, level: 27 },
  { from: 190, to: 424, item: 'special-evolution' }, // 에이팜 → 겟핸보숭 (기술 습득)
  { from: 193, to: 469, item: 'special-evolution' },
  { from: 194, to: 195, level: 20 }, // 우파 (P) -> 토오 진화는 9세대에
  { from: 204, to: 205, level: 31 },
  { from: 209, to: 210, level: 23 },
  { from: 216, to: 217, level: 30 }, { from: 217, to: 901, item: 'special-evolution' }, // 링곰 -> 다투곰
  { from: 218, to: 219, level: 38 },
  { from: 220, to: 221, level: 33 },
  { from: 221, to: 473, item: 'special-evolution' }, // 메꾸리 → 맘모꾸리 (기술 습득)
  { from: 223, to: 224, level: 25 },
  { from: 228, to: 229, level: 24 },
  { from: 231, to: 232, level: 25 },
  { from: 236, to: 106, level: 20 }, // 배루키 → 시라소몬 (Atk > Def)
  { from: 236, to: 107, level: 20 }, // 배루키 → 홍수몬 (Atk < Def)
  { from: 236, to: 237, level: 20 }, // 배루키 → 카포에라 (Atk = Def)
  { from: 238, to: 124, level: 30 }, // 뽀뽀라 → 루주라
  { from: 239, to: 125, level: 30 }, // 에레키드 → 에레브
  { from: 240, to: 126, level: 30 }, // 마그비 → 마그마
  { from: 246, to: 247, level: 30 }, { from: 247, to: 248, level: 55 },
  
  // 아이템 진화 (2세대)
  { from: 42, to: 169, item: 'friendship-evolution' }, // 골뱃 -> 크로뱃 (친밀도)
  { from: 61, to: 186, item: 'kings-rock' }, // 수륙챙이 -> 왕구리 (왕의징표석+교환)
  { from: 79, to: 199, item: 'kings-rock' }, // 야돈 -> 야도킹 (왕의징표석+교환)
  { from: 95, to: 208, item: 'metal-coat' }, // 롱스톤 -> 강철톤 (금속코트+교환)
  { from: 113, to: 242, item: 'friendship-evolution' }, // 럭키 -> 해피너스 (친밀도)
  { from: 117, to: 230, item: 'dragon-scale' }, // 시드라 -> 킹드라 (용의비늘+교환)
  { from: 123, to: 212, item: 'metal-coat' }, // 스라크 -> 핫삼 (금속코트+교환)
  { from: 133, to: 196, item: 'sun-stone' }, // 이브이 → 에브이 (친밀도 낮/밤을 돌로 대체)
  { from: 133, to: 197, item: 'moon-stone' }, // 이브이 → 블래키
  { from: 44, to: 182, item: 'sun-stone' }, // 냄새꼬 → 아르코
  { from: 137, to: 233, item: 'upgrade' }, // 폴리곤 -> 폴리곤2 (업그레이드+교환)
  { from: 198, to: 430, item: 'dusk-stone' }, // 니로우 → 돈크로우
  { from: 200, to: 429, item: 'dusk-stone' }, // 무우마 → 무우마직
  { from: 207, to: 472, item: 'razor-fang' }, // 글라이거 → 글라이온 (예리한이빨+밤)
  { from: 215, to: 461, item: 'razor-claw' }, // 포푸니 → 포푸니라 (예리한손톱+밤)
  
  // === 3세대 (252-386) ===
  { from: 252, to: 253, level: 16 }, { from: 253, to: 254, level: 36 },
  { from: 255, to: 256, level: 16 }, { from: 256, to: 257, level: 36 },
  { from: 258, to: 259, level: 16 }, { from: 259, to: 260, level: 36 },
  { from: 261, to: 262, level: 18 },
  { from: 263, to: 264, level: 20 },
  { from: 265, to: 266, level: 7 }, { from: 266, to: 267, level: 10 }, // 개무소 -> 실쿤 -> 뷰티플라이
  { from: 265, to: 268, level: 7 }, { from: 268, to: 269, level: 10 }, // 개무소 -> 카스쿤 -> 독케일
  { from: 270, to: 271, level: 14 }, { from: 271, to: 272, item: 'water-stone' }, // 연꽃몬 -> 로파파
  { from: 273, to: 274, level: 14 }, { from: 274, to: 275, item: 'leaf-stone' }, // 도토링 -> 다탱구
  { from: 276, to: 277, level: 22 },
  { from: 278, to: 279, level: 25 },
  { from: 280, to: 281, level: 20 }, { from: 281, to: 282, level: 30 }, // 랄토스 -> 킬리아 -> 가디안
  { from: 283, to: 284, level: 22 },
  { from: 285, to: 286, level: 23 },
  { from: 287, to: 288, level: 18 }, { from: 288, to: 289, level: 36 },
  { from: 290, to: 291, level: 20 },
  { from: 290, to: 292, item: 'special-evolution' }, // 토중몬 -> 껍질몬 (특수 진화)
  { from: 293, to: 294, level: 20 }, { from: 294, to: 295, level: 40 },
  { from: 296, to: 297, level: 24 },
  { from: 298, to: 183, item: 'friendship-evolution' }, // 루리리 -> 마릴 (친밀도)
  { from: 300, to: 301, item: 'moon-stone' }, // 에나비 -> 델케티
  { from: 304, to: 305, level: 32 }, { from: 305, to: 306, level: 42 },
  { from: 307, to: 308, level: 37 },
  { from: 309, to: 310, level: 26 },
  { from: 316, to: 317, level: 26 },
  { from: 318, to: 319, level: 30 },
  { from: 320, to: 321, level: 40 },
  { from: 322, to: 323, level: 33 },
  { from: 325, to: 326, level: 32 },
  { from: 328, to: 329, level: 35 }, { from: 329, to: 330, level: 45 },
  { from: 331, to: 332, level: 32 },
  { from: 333, to: 334, level: 35 },
  { from: 339, to: 340, level: 30 },
  { from: 341, to: 342, level: 30 },
  { from: 343, to: 344, level: 36 },
  { from: 345, to: 346, level: 40 },
  { from: 347, to: 348, level: 40 },
  { from: 349, to: 350, item: 'water-stone' }, // 빈티나 -> 밀로틱 (아름다움 -> 돌로 대체)
  { from: 353, to: 354, level: 37 },
  { from: 355, to: 356, level: 37 }, 
  { from: 360, to: 202, level: 15 }, // 마자 -> 마자용
  { from: 361, to: 362, level: 42 },
  { from: 363, to: 364, level: 32 }, { from: 364, to: 365, level: 44 },
  { from: 366, to: 367, item: 'deep-sea-tooth' }, // 진주몽 -> 헌테일 (심해의이빨+교환)
  { from: 366, to: 368, item: 'deep-sea-scale' }, // 진주몽 -> 분홍장이 (심해의비늘+교환)
  { from: 371, to: 372, level: 30 }, { from: 372, to: 373, level: 50 },
  { from: 374, to: 375, level: 20 }, { from: 375, to: 376, level: 45 },

  // === 4세대 (387-493) ===
  { from: 387, to: 388, level: 18 }, { from: 388, to: 389, level: 32 },
  { from: 390, to: 391, level: 14 }, { from: 391, to: 392, level: 36 },
  { from: 393, to: 394, level: 16 }, { from: 394, to: 395, level: 36 },
  { from: 396, to: 397, level: 14 }, { from: 397, to: 398, level: 34 },
  { from: 399, to: 400, level: 15 },
  { from: 401, to: 402, level: 10 },
  { from: 403, to: 404, level: 15 }, { from: 404, to: 405, level: 30 },
  { from: 406, to: 315, item: 'friendship-evolution' }, // 꼬몽울 → 로젤리아 (친밀도)
  { from: 408, to: 409, level: 30 },
  { from: 410, to: 411, level: 30 },
  { from: 412, to: 413, level: 20, gender: 'female' }, // 도롱충이 → 도롱마담 (암컷)
  { from: 412, to: 414, level: 20, gender: 'male' }, // 도롱충이 → 나메일 (수컷)
  { from: 415, to: 416, level: 21, gender: 'female' }, // 세꿀버리 -> 비퀸 (암컷)
  { from: 418, to: 419, level: 26 },
  { from: 420, to: 421, level: 25 },
  { from: 422, to: 423, level: 30 },
  { from: 425, to: 426, level: 28 },
  { from: 427, to: 428, item: 'friendship-evolution' }, // 이어롤 -> 이어롭 (친밀도)
  { from: 431, to: 432, level: 38 },
  { from: 433, to: 358, item: 'friendship-evolution' }, // 랑딸랑 -> 치렁 (친밀도)
  { from: 434, to: 435, level: 34 },
  { from: 436, to: 437, level: 33 }, // 동미러 -> 동탁군
  { from: 438, to: 185, item: 'special-evolution' }, // 꼬지지 -> 꼬지모 (기술 습득)
  { from: 439, to: 122, item: 'special-evolution' }, // 흉내내 -> 마임맨 (기술 습득)
  { from: 440, to: 113, item: 'special-evolution' }, // 핑복 -> 럭키 (동글동글돌+낮)
  { from: 443, to: 444, level: 24 }, { from: 444, to: 445, level: 48 },
  { from: 446, to: 143, item: 'friendship-evolution' }, // 먹고자 -> 잠만보 (친밀도)
  { from: 447, to: 448, item: 'friendship-evolution' }, // 리오르 -> 루카리오 (친밀도)
  { from: 449, to: 450, level: 34 },
  { from: 451, to: 452, level: 40 },
  { from: 453, to: 454, level: 37 },
  { from: 456, to: 457, level: 31 },
  { from: 458, to: 226, item: 'special-evolution' }, // 타만타 -> 만타인 (총어 소지)
  { from: 459, to: 460, level: 40 },
  
  // 아이템 진화 (4세대)
  { from: 176, to: 468, item: 'shiny-stone' }, // 토게틱 -> 토게키스
  { from: 281, to: 475, item: 'dawn-stone', gender: 'male' }, // 킬리아 -> 엘레이드 (수컷)
  { from: 315, to: 407, item: 'shiny-stone' }, // 로젤리아 -> 로즈레이드
  { from: 299, to: 476, item: 'thunder-stone' }, // 코코파스 -> 대코파스 (특수자기장 -> 돌로 대체)
  { from: 356, to: 477, item: 'reaper-cloth' }, // 미라몽 -> 야느와르몽 (영계의천+교환)
  { from: 361, to: 478, item: 'dawn-stone', gender: 'female' }, // 눈꼬마 -> 눈여아 (암컷)
  { from: 82, to: 462, item: 'thunder-stone' }, // 레어코일 -> 자포코일 (특수자기장 -> 돌로 대체)
  { from: 108, to: 463, item: 'special-evolution' }, // 내루미 -> 내룸벨트
  { from: 112, to: 464, item: 'protector' }, // 코뿌리 -> 거대코뿌리 (프로텍터+교환)
  { from: 125, to: 466, item: 'electirizer' }, // 에레브 -> 에레키블 (에레키부스터+교환)
  { from: 126, to: 467, item: 'magmarizer' }, // 마그마 -> 마그마번 (마그마부스터+교환)
  { from: 133, to: 470, item: 'leaf-stone' }, // 이브이 -> 리피아 (이끼바위 -> 돌로 대체)
  { from: 133, to: 471, item: 'ice-stone' }, // 이브이 -> 글레이시아 (얼음바위 -> 돌로 대체)
  { from: 233, to: 474, item: 'dubious-disc' }, // 폴리곤2 -> 폴리곤Z (괴상한패치+교환)
  
  // === 5세대 (494-649) ===
  { from: 495, to: 496, level: 17 }, { from: 496, to: 497, level: 36 },
  { from: 498, to: 499, level: 17 }, { from: 499, to: 500, level: 36 },
  { from: 501, to: 502, level: 17 }, { from: 502, to: 503, level: 36 },
  { from: 504, to: 505, level: 20 },
  { from: 506, to: 507, level: 16 }, { from: 507, to: 508, level: 32 },
  { from: 509, to: 510, level: 20 },
  { from: 511, to: 512, item: 'leaf-stone' },
  { from: 513, to: 514, item: 'fire-stone' },
  { from: 515, to: 516, item: 'water-stone' },
  { from: 517, to: 518, item: 'moon-stone' }, // 몽나 -> 몽얌나
  { from: 519, to: 520, level: 21 }, { from: 520, to: 521, level: 32 },
  { from: 522, to: 523, level: 27 },
  { from: 524, to: 525, level: 25 }, { from: 525, to: 526, item: 'linking-cord' }, // 암트르 -> 기가이어스 (교환)
  { from: 527, to: 528, item: 'friendship-evolution' }, // 또르박쥐 -> 맘박쥐 (친밀도)
  { from: 529, to: 530, level: 31 },
  { from: 532, to: 533, level: 25 }, { from: 533, to: 534, item: 'linking-cord' }, // 토쇠골 -> 노보청 (교환)
  { from: 535, to: 536, level: 25 }, { from: 536, to: 537, level: 36 },
  { from: 540, to: 541, level: 20 }, { from: 541, to: 542, item: 'friendship-evolution' }, // 두르보 -> 두르쿤 -> 모아머 (친밀도)
  { from: 543, to: 544, level: 22 }, { from: 544, to: 545, level: 30 },
  { from: 546, to: 547, item: 'sun-stone' }, // 소미안 -> 엘풍
  { from: 548, to: 549, item: 'sun-stone' }, // 치릴리 -> 드레디어
  { from: 551, to: 552, level: 29 }, { from: 552, to: 553, level: 40 },
  { from: 554, to: 555, level: 35 },
  { from: 557, to: 558, level: 34 },
  { from: 559, to: 560, level: 39 },
  { from: 562, to: 563, level: 34 },
  { from: 564, to: 565, level: 37 },
  { from: 566, to: 567, level: 37 },
  { from: 568, to: 569, level: 36 },
  { from: 572, to: 573, item: 'shiny-stone' }, // 치라미 -> 치라치노
  { from: 574, to: 575, level: 32 }, { from: 575, to: 576, level: 41 },
  { from: 577, to: 578, level: 32 }, { from: 578, to: 579, level: 41 },
  { from: 580, to: 581, level: 35 },
  { from: 582, to: 583, level: 35 }, { from: 583, to: 584, level: 47 },
  { from: 585, to: 586, level: 34 },
  { from: 588, to: 589, item: 'linking-cord' }, // 딱정곤 -> 슈바르고 (쪼마리 교환)
  { from: 590, to: 591, level: 39 },
  { from: 592, to: 593, level: 40 },
  { from: 595, to: 596, level: 36 },
  { from: 597, to: 598, level: 40 },
  { from: 599, to: 600, level: 38 }, { from: 600, to: 601, level: 49 },
  { from: 602, to: 603, level: 39 }, { from: 603, to: 604, item: 'thunder-stone' }, // 저리어 -> 저리릴 -> 저리더프
  { from: 605, to: 606, level: 42 },
  { from: 607, to: 608, level: 41 }, { from: 608, to: 609, item: 'dusk-stone' }, // 불켜미 -> 램프라 -> 샹델라
  { from: 610, to: 611, level: 38 }, { from: 611, to: 612, level: 48 },
  { from: 613, to: 614, level: 37 },
  { from: 616, to: 617, item: 'linking-cord' }, // 쪼마리 -> 어지리더 (딱정곤 교환)
  { from: 619, to: 620, level: 50 },
  { from: 622, to: 623, level: 43 },
  { from: 624, to: 625, level: 52 },
  { from: 627, to: 628, level: 54 },
  { from: 629, to: 630, level: 54 },
  { from: 633, to: 634, level: 50 }, { from: 634, to: 635, level: 64 },
  { from: 636, to: 637, level: 59 },
  
  // === 6세대 (650-721) ===
  { from: 650, to: 651, level: 16 }, { from: 651, to: 652, level: 36 },
  { from: 653, to: 654, level: 16 }, { from: 654, to: 655, level: 36 },
  { from: 656, to: 657, level: 16 }, { from: 657, to: 658, level: 36 },
  { from: 659, to: 660, level: 20 },
  { from: 661, to: 662, level: 17 }, { from: 662, to: 663, level: 35 },
  { from: 664, to: 665, level: 9 }, { from: 665, to: 666, level: 12 },
  { from: 667, to: 668, level: 35 },
  { from: 669, to: 670, level: 19 }, { from: 670, to: 671, item: 'shiny-stone' }, // 플라베베 -> 플라엣테 -> 플라제스
  { from: 672, to: 673, level: 32 },
  { from: 674, to: 675, level: 32 },
  { from: 677, to: 678, level: 25 },
  { from: 679, to: 680, level: 35 }, { from: 680, to: 681, item: 'dusk-stone' }, // 단칼빙 -> 쌍검킬 -> 킬가르도
  { from: 682, to: 683, item: 'sachet' }, // 슈쁘 -> 프레프티르 (향기주머니+교환)
  { from: 684, to: 685, item: 'whipped-dream' }, // 나룸퍼프 -> 나루림 (휘핑팝+교환)
  { from: 686, to: 687, level: 30 }, // 오케이징 -> 칼라마네로 (레벨 30이상 기기 거꾸로)
  { from: 688, to: 689, level: 39 },
  { from: 690, to: 691, level: 48 },
  { from: 692, to: 693, level: 37 },
  { from: 694, to: 695, item: 'sun-stone' }, // 목도리키텔 -> 일레도리자드
  { from: 696, to: 697, level: 39, timeOfDay: 'day' }, // 티고라스 -> 견고라스 (낮)
  { from: 698, to: 699, level: 39, timeOfDay: 'night' }, // 아마루스 -> 아마루르가 (밤)
  { from: 133, to: 700, item: 'friendship-evolution' }, // 이브이 → 님피아 (페어리 기술 + 친밀도)
  { from: 704, to: 705, level: 40 }, { from: 705, to: 706, level: 50 }, // 미끄메라 -> 미끄네일 -> 미끄래곤 (비)
  { from: 708, to: 709, item: 'linking-cord' }, // 대로트 -> 대로트 (교환)
  { from: 710, to: 711, item: 'linking-cord' }, // 호바귀 -> 펌킨인 (교환)
  { from: 712, to: 713, level: 37 },
  { from: 714, to: 715, level: 48 },
  
  // === 7세대 (722-809) ===
  { from: 722, to: 723, level: 17 }, { from: 723, to: 724, level: 34 },
  { from: 725, to: 726, level: 17 }, { from: 726, to: 727, level: 34 },
  { from: 728, to: 729, level: 17 }, { from: 729, to: 730, level: 34 },
  { from: 731, to: 732, level: 14 }, { from: 732, to: 733, level: 28 },
  { from: 734, to: 735, level: 20 }, // 영구스 -> 형사구스 (낮)
  { from: 736, to: 737, level: 20 }, { from: 737, to: 738, item: 'thunder-stone' }, // 턱지충이 -> 전지충이 -> 투구뿌논 (특수자기장 -> 돌)
  { from: 739, to: 740, item: 'special-evolution' }, // 오기지게 -> 모단단게 (특정 장소)
  { from: 742, to: 743, level: 25 },
  { from: 744, to: 745, level: 25 }, // 암멍이 -> 루가루암 (폼 다수)
  { from: 747, to: 748, level: 38 },
  { from: 749, to: 750, level: 30 },
  { from: 751, to: 752, level: 30 },
  { from: 753, to: 754, level: 34 },
  { from: 755, to: 756, level: 24 },
  { from: 757, to: 758, level: 33, gender: 'female' }, // 야도뇽 -> 염뉴트 (암컷)
  { from: 759, to: 760, level: 27 },
  { from: 761, to: 762, level: 18 }, { from: 762, to: 763, item: 'special-evolution' }, // 달콤아 -> 달무리나 -> 달코퀸 (기술 습득)
  { from: 767, to: 768, level: 30 },
  { from: 769, to: 770, level: 42 },
  { from: 782, to: 783, level: 35 }, { from: 783, to: 784, level: 45 },
  { from: 789, to: 790, level: 43 }, { from: 790, to: 791, level: 53, timeOfDay: 'day' }, // 코스모그 -> 코스모움 -> 솔가레오 (낮)
  { from: 790, to: 792, level: 53, timeOfDay: 'night' }, // 코스모움 -> 루나아라 (밤)
  
  // 알로라폼 진화 (기존 포켓몬 ID 사용)
  // { from: 19, to: 20, level: 20 }, // 꼬렛(A) -> 레트라(A) (기본 19->20과 동일)
  // { from: 25, to: 26, item: 'thunder-stone' }, // 피카츄 -> 라이츄(A) (기본 25->26과 동일)
  { from: 27, to: 28, item: 'ice-stone' }, // 모래두지(A) -> 고지(A)
  { from: 37, to: 38, item: 'ice-stone' }, // 식스테일(A) -> 나인테일(A)
  // { from: 50, to: 51, level: 26 }, // 디그다(A) -> 닥트리오(A) (기본 50->51과 동일)
  // { from: 52, to: 53, item: 'friendship-evolution' }, // 나옹(A) -> 페르시온(A) (위에서 1세대로 이동)
  // { from: 74, to: 75, level: 25 }, // 꼬마돌(A) -> 데구리(A) (기본 74->75와 동일)
  // { from: 75, to: 76, item: 'linking-cord' }, // 데구리(A) -> 딱구리(A) (기본 75->76과 동일)
  // { from: 88, to: 89, level: 38 }, // 질퍽이(A) -> 질뻐기(A) (기본 88->89와 동일)
  // { from: 102, to: 103, item: 'leaf-stone' }, // 아라리 -> 나시(A) (기본 102->103과 동일)
  // { from: 104, to: 105, level: 28 }, // 탕구리 -> 텅구리(A) (기본 104->105와 동일, 밤 조건은 special-evolution으로 X)
  { from: 803, to: 804, item: 'special-evolution' }, // 베베놈 -> 아고용
  { from: 808, to: 809, item: 'special-evolution' }, // 멜탄 -> 멜메탈 (특수 조건)
  
  // === 8세대 (810-905) ===
  { from: 810, to: 811, level: 16 }, { from: 811, to: 812, level: 35 },
  { from: 813, to: 814, level: 16 }, { from: 814, to: 815, level: 35 },
  { from: 816, to: 817, level: 16 }, { from: 817, to: 818, level: 35 },
  { from: 819, to: 820, level: 24 },
  { from: 821, to: 822, level: 18 }, { from: 822, to: 823, level: 38 },
  { from: 824, to: 825, level: 10 }, { from: 825, to: 826, level: 30 },
  { from: 827, to: 828, level: 18 },
  { from: 829, to: 830, level: 20 },
  { from: 831, to: 832, level: 24 },
  { from: 833, to: 834, level: 22 },
  { from: 835, to: 836, level: 25 },
  { from: 837, to: 838, level: 18 }, { from: 838, to: 839, level: 34 },
  { from: 840, to: 841, item: 'tart-apple' }, // 과사삭벌레 -> 애프룡
  { from: 840, to: 842, item: 'sweet-apple' }, // 과사삭벌레 -> 단지래플
  { from: 843, to: 844, level: 36 },
  { from: 846, to: 847, level: 26 },
  { from: 848, to: 849, level: 30 }, // 일레즌 -> 스트린더 (폼 2개)
  { from: 850, to: 851, level: 28 }, // 태우지네 -> 다태우지네
  { from: 852, to: 853, level: 38 }, // 대여르 -> 배열
  { from: 854, to: 855, item: 'special-evolution' }, // 데인차 -> 포트데스 (깨진포트/이빠진포트)
  { from: 856, to: 857, level: 32 }, { from: 857, to: 858, level: 42 }, // 몸지브림 -> 손지브림 -> 브리무음
  { from: 859, to: 860, level: 32 }, { from: 860, to: 861, level: 42 }, // 메롱꿍 -> 쏘겨모 -> 오롱털
  { from: 868, to: 869, item: 'special-evolution' }, // 마빌크 -> 마휘핑 (사탕공예)
  { from: 872, to: 873, level: 34 },
  { from: 878, to: 879, level: 34 },
  { from: 885, to: 886, level: 50 }, { from: 886, to: 887, level: 60 }, // 드라꼰 -> 드래런치 -> 드래펄트
  { from: 891, to: 10191, item: 'water-scroll' }, // 치고마 -> 우라오스 연격의 태세 (물의 족자)
  { from: 891, to: 892, item: 'dark-scroll' }, // 치고마 -> 우라오스 일격의 태세 (악의 족자)
  
  // 가라르폼 진화
  { from: 52, to: 863, level: 28 }, // 나옹(G) -> 나이킹
  // { from: 77, to: 78, level: 40 }, // 포니타(G) -> 날쌩마(G) (기본 77->78과 동일)
  { from: 79, to: 80, item: 'galarica-cuff' }, // 야돈(G) -> 야도란(G)
  { from: 79, to: 199, item: 'galarica-wreath' }, // 야돈(G) -> 야도킹(G)
  // { from: 110, to: 110, level: 35 }, // 또가스 -> 또도가스(G) (진화 아님)
  { from: 122, to: 866, level: 42 }, // 마임맨(G) -> 마임꽁꽁
  { from: 263, to: 264, level: 20 }, { from: 264, to: 862, level: 35 }, // 지그제구리(G) -> 직구리(G) -> 가로막구리 (밤)
  { from: 554, to: 555, level: 37 }, // 달막화(G) -> 불비달마(G)
  { from: 562, to: 867, item: 'special-evolution' }, // 데스마스(G) -> 데스판 (특수 조건)
  
  // 히스이폼 진화
  // { from: 58, to: 59, item: 'fire-stone' }, // 히스이 가디 -> 윈디(H) (기본 58->59와 동일)
  // { from: 100, to: 101, item: 'leaf-stone' }, // 히스이 찌리리공 -> 붐볼(H) (기본 100->101과 동일)
  { from: 123, to: 900, item: 'black-augurite' }, // 스라크 -> 사마자르
  // { from: 157, to: 157, level: 36 }, // 블레이범(H) (진화 아님)
  { from: 211, to: 903, item: 'special-evolution' }, // 침바루(H) -> 장침바루 (기술)
  { from: 215, to: 904, item: 'special-evolution' }, // 포푸니(H) -> 포푸니크 (예리한손톱+낮)
  // { from: 503, to: 503, level: 36 }, // 대검귀(H) (진화 아님)
  // { from: 549, to: 549, item: 'sun-stone' }, // 드레디어(H) (진화 아님)
  { from: 570, to: 571, level: 30 }, // 조로아(H) -> 조로아크(H)
  // { from: 628, to: 628, level: 54 }, // 워글(H) (진화 아님)
  // { from: 705, to: 706, level: 50 }, // 미끄네일(H) -> 미끄래곤(H) (기본 705->706과 동일)
  // { from: 713, to: 713, level: 37 }, // 크레베이스(H) (진화 아님)
  // { from: 724, to: 724, level: 34 }, // 모크나이퍼(H) (진화 아님)
  
  // === 9세대 (906-1025) ===
  { from: 906, to: 907, level: 16 }, { from: 907, to: 908, level: 36 }, // 뜨아거 라인
  { from: 909, to: 910, level: 16 }, { from: 910, to: 911, level: 36 }, // 꾸왁스 라인
  { from: 912, to: 913, level: 16 }, { from: 913, to: 914, level: 36 }, // 나오하 라인
  { from: 915, to: 916, level: 18 }, // 맛보돈 -> 퍼퓨돈
  { from: 917, to: 918, level: 25 }, // 타랜툴라 -> 트래피더
  { from: 919, to: 920, level: 24 }, // 콩알뚜기 -> 엑스레그
  { from: 921, to: 922, level: 18 }, // 빠모 -> 빠모트
  { from: 922, to: 923, item: 'special-evolution' }, // 빠모트 -> 빠르모트 (레츠고 1000보)
  { from: 924, to: 925, level: 25 }, // 두리쥐 -> 파밀리쥐 (특수, 레벨업)
  { from: 926, to: 927, level: 26 }, // 쫀도기 -> 바우첼
  { from: 928, to: 929, level: 25 }, // 미니브 -> 올리뇨
  { from: 929, to: 930, level: 35 }, // 올리뇨 -> 올리르바
  { from: 932, to: 933, level: 24 }, // 베베솔트 -> 스태솔트
  { from: 933, to: 934, level: 38 }, // 스태솔트 -> 콜로솔트
  { from: 935, to: 936, item: 'auspicious-armor' }, // 카르본 -> 카디나르마
  { from: 935, to: 937, item: 'malicious-armor' }, // 카르본 -> 파라블레이즈
  { from: 938, to: 939, item: 'thunder-stone' }, // 빈나두 -> 찌리배리
  { from: 940, to: 941, level: 25 }, // 찌리비 -> 찌리비크
  { from: 942, to: 943, level: 30 }, // 오라티프 -> 마피티프
  { from: 944, to: 945, level: 28 }, // 땃주르 -> 태깅구르
  { from: 946, to: 947, item: 'special-evolution' }, // 그우린 -> 공푸린 (레츠고 1000보)
  { from: 948, to: 949, level: 30 }, // 들눈해 -> 육파리
  { from: 951, to: 952, item: 'fire-stone' }, // 캡싸이 -> 스코빌런
  { from: 953, to: 954, item: 'special-evolution' }, // 구르돈 -> 베라카스 (레츠고 1000보)
  { from: 955, to: 956, level: 35 }, // 하느라 -> 클레스퍼트라
  { from: 957, to: 958, level: 24 }, // 어리짱 -> 벼리짱
  { from: 958, to: 959, level: 38 }, // 벼리짱 -> 두드리짱
  { from: 960, to: 961, level: 26 }, // 바다그다 -> 바다트리오
  { from: 963, to: 964, item: 'special-evolution' }, // 맨돌핀 -> 돌핀맨 (유니언 서클)
  { from: 965, to: 966, level: 40 }, // 부르롱 -> 부르르룸
  { from: 969, to: 970, level: 35 }, // 초롱순 -> 킬라플로르
  { from: 971, to: 972, level: 30, timeOfDay: 'night' }, // 묘두기 -> 묘티프 (밤)
  { from: 974, to: 975, item: 'ice-stone' }, // 터벅고래 -> 우락고래
  { from: 996, to: 997, level: 35 }, // 드니차 -> 드니꽁
  { from: 997, to: 998, level: 54 }, // 드니꽁 -> 드닐레이브
  { from: 999, to: 1000, item: 'special-evolution' }, // 모으령 -> 타부자고 (코인 999)
  
  // 팔데아/DLC 진화 (기존 포켓몬)
  { from: 57, to: 979, item: 'special-evolution' }, // 성원숭 -> 저승갓숭 (분노의주먹 20회)
  { from: 194, to: 980, level: 20 }, // 우파(P) -> 토오
  { from: 203, to: 981, item: 'special-evolution' }, // 키링키 -> 키키링 (트윈빔)
  { from: 206, to: 982, item: 'special-evolution' }, // 노고치 -> 노고고치 (하이퍼드릴)
  { from: 625, to: 983, item: 'special-evolution' }, // 절각참 -> 대도각참 (대장의징표)
  { from: 840, to: 1011, item: 'syrupy-apple' }, // 과사삭벌레 -> 과미드라 (DLC)
  { from: 1012, to: 1013, item: 'special-evolution' }, // 차데스 -> 그우린차 (범작/걸작 찻잔)
  { from: 884, to: 1018, item: 'metal-alloy' }, // 두랄루돈 -> 브리두라스 (DLC)
  { from: 1011, to: 1019, item: 'special-evolution' }, // 과미르 -> 과미드라 (드래곤옐)
];

// 메가진화 데이터 (10000번대 ID 사용)
export const MEGA_EVOLUTIONS: MegaEvolutionData[] = [
  { from: 3, to: 10033, item: 'venusaurite' },
  { from: 6, to: 10034, item: 'charizardite-x' },
  { from: 6, to: 10035, item: 'charizardite-y' },
  { from: 9, to: 10036, item: 'blastoisinite' },

  { from: 15, to: 10090, item: 'beedrillite' },
  { from: 18, to: 10073, item: 'pidgeotite' },
  { from: 65, to: 10037, item: 'alakazite' },
  { from: 80, to: 10071, item: 'slowbronite' },
  { from: 94, to: 10038, item: 'gengarite' },
  { from: 115, to: 10039, item: 'kangaskhanite' },
  { from: 127, to: 10040, item: 'pinsirite' },
  { from: 130, to: 10041, item: 'gyaradosite' },
  { from: 142, to: 10042, item: 'aerodactylite' },
  { from: 150, to: 10043, item: 'mewtwonite-x' },
  { from: 150, to: 10044, item: 'mewtwonite-y' },

  { from: 181, to: 10045, item: 'ampharosite' },
  { from: 208, to: 10072, item: 'steelixite' },
  { from: 212, to: 10046, item: 'scizorite' },
  { from: 214, to: 10047, item: 'heracronite' },
  { from: 229, to: 10048, item: 'houndoominite' },
  { from: 248, to: 10049, item: 'tyranitarite' },

  { from: 254, to: 10065, item: 'sceptilite' },
  { from: 257, to: 10050, item: 'blazikenite' },
  { from: 260, to: 10064, item: 'swampertite' },
  { from: 282, to: 10051, item: 'gardevoirite' },
  { from: 302, to: 10066, item: 'sablenite' },
  { from: 303, to: 10052, item: 'mawilite' },
  { from: 306, to: 10053, item: 'aggronite' },
  { from: 308, to: 10054, item: 'medichamite' },
  { from: 310, to: 10055, item: 'manectite' },
  { from: 319, to: 10070, item: 'sharpedonite' },
  { from: 323, to: 10087, item: 'cameruptite' },
  { from: 334, to: 10067, item: 'altarianite' },
  { from: 354, to: 10056, item: 'banettite' },
  { from: 359, to: 10057, item: 'absolite' },
  { from: 362, to: 10074, item: 'glalitite' },
  { from: 373, to: 10089, item: 'salamencite' },
  { from: 376, to: 10076, item: 'metagrossite' },
  { from: 380, to: 10062, item: 'latiasite' },
  { from: 381, to: 10063, item: 'latiosite' },
  { from: 384, to: 10079, item: 'rayquazite' }, // 공식으론 돌 없고 드래곤어센트지만, 편의상 아이템 명 유지

  { from: 428, to: 10088, item: 'lopunnite' },
  { from: 445, to: 10058, item: 'garchompite' },
  { from: 448, to: 10059, item: 'lucarionite' },
  { from: 460, to: 10060, item: 'abomasite' },
  { from: 475, to: 10068, item: 'galladite' },
  { from: 531, to: 10069, item: 'audinite' },
  { from: 719, to: 10075, item: 'diancite' },
];

// 거다이맥스 데이터 (10200번대 ID 사용)
export const GIGANTAMAX_FORMS: GigantamaxData[] = [
  { from: 3, to: 10195, item: 'max-mushroom' }, // 이상해꽃 (Venusaur-gmax)
  { from: 6, to: 10196, item: 'max-mushroom' }, // 리자몽 (Charizard-gmax)
  { from: 9, to: 10197, item: 'max-mushroom' }, // 거북왕 (Blastoise-gmax)
  { from: 12, to: 10198, item: 'max-mushroom' }, // 버터플 (Butterfree-gmax)
  { from: 25, to: 10199, item: 'max-mushroom' }, // 피카츄 (Pikachu-gmax)
  { from: 52, to: 10200, item: 'max-mushroom' }, // 나옹 (Meowth-gmax)
  { from: 68, to: 10201, item: 'max-mushroom' }, // 괴력몬 (Machamp-gmax)
  { from: 94, to: 10202, item: 'max-mushroom' }, // 팬텀 (Gengar-gmax)
  { from: 99, to: 10203, item: 'max-mushroom' }, // 킹크랩 (Kingler-gmax)
  { from: 131, to: 10204, item: 'max-mushroom' }, // 라프라스 (Lapras-gmax)
  { from: 133, to: 10205, item: 'max-mushroom' }, // 이브이 (Eevee-gmax)
  { from: 143, to: 10206, item: 'max-mushroom' }, // 잠만보 (Snorlax-gmax)
  { from: 569, to: 10207, item: 'max-mushroom' }, // 더스트다스 (Garbodor-gmax)
  { from: 809, to: 10208, item: 'max-mushroom' }, // 멜메탈 (Melmetal-gmax)

  { from: 812, to: 10209, item: 'max-mushroom' }, // 고릴타 (Rillaboom-gmax)
  { from: 815, to: 10210, item: 'max-mushroom' }, // 에이스번 (Cinderace-gmax)
  { from: 818, to: 10211, item: 'max-mushroom' }, // 인텔리레온 (Inteleon-gmax)

  { from: 823, to: 10212, item: 'max-mushroom' }, // 아머까오 (Corviknight-gmax)
  { from: 826, to: 10213, item: 'max-mushroom' }, // 이올브 (Orbeetle-gmax)
  { from: 834, to: 10214, item: 'max-mushroom' }, // 갈가부기 (Drednaw-gmax)
  { from: 839, to: 10215, item: 'max-mushroom' }, // 석탄산 (Coalossal-gmax)
  { from: 841, to: 10216, item: 'max-mushroom' }, // 애프룡 (Flapple-gmax)
  { from: 842, to: 10217, item: 'max-mushroom' }, // 단지래플 (Appletun-gmax)
  { from: 844, to: 10218, item: 'max-mushroom' }, // 사다이사 (Sandaconda-gmax)
  { from: 849, to: 10219, item: 'max-mushroom' }, // 스트린더(하이한) (Toxtricity-amped-gmax)
  { from: 851, to: 10220, item: 'max-mushroom' }, // 다태우지네 (Centiskorch-gmax)
  { from: 858, to: 10221, item: 'max-mushroom' }, // 브리무음 (Hatterene-gmax)
  { from: 861, to: 10222, item: 'max-mushroom' }, // 오롱털 (Grimmsnarl-gmax)
  { from: 869, to: 10223, item: 'max-mushroom' }, // 마휘핑 (Alcremie-gmax)
  { from: 879, to: 10224, item: 'max-mushroom' }, // 대왕끼리동 (Copperajah-gmax)
  { from: 884, to: 10225, item: 'max-mushroom' }, // 두랄루돈 (Duraludon-gmax)
];

// 레벨로 진화 가능한지 확인
export function canEvolve(pokemonId: number, level: number): EvolutionData | null {
  // 해당 포켓몬의 '레벨' 진화 정보(아이템이 없는 경우)를 찾습니다.
  const evolution = EVOLUTION_CHAINS.find(e => 
    e.from === pokemonId && 
    e.level !== undefined && 
    e.item === undefined
  );
  
  if (!evolution) return null;

  // 현재 레벨이 진화 레벨 이상인지 확인합니다.
  // (친밀도 등 특수 레벨업은 level: 1로 표기하므로, 이 경우 항상 통과)
  if (level >= evolution.level!) {
    return evolution;
  }
  
  return null;
}

// 아이템(돌)으로 진화 가능한지 확인
export function canEvolveWithItem(pokemonId: number, item: string): EvolutionData | null {
  // 해당 포켓몬 ID와 아이템 이름이 일치하는 진화 정보를 찾습니다.
  const evolution = EVOLUTION_CHAINS.find(e => e.from === pokemonId && e.item === item);
  return evolution || null;
}

// 메가진화 가능한지 확인
export function canMegaEvolve(pokemonId: number, item: string): MegaEvolutionData | null {
  // 해당 포켓몬 ID와 메가스톤 이름이 일치하는 메가진화 정보를 찾습니다.
  const megaEvolution = MEGA_EVOLUTIONS.find(e => e.from === pokemonId && e.item === item);
  return megaEvolution || null;
}

// 특정 포켓몬이 메가진화 가능한지 확인 (아이템 없이)
export function hasMegaEvolution(pokemonId: number): boolean {
  return MEGA_EVOLUTIONS.some(e => e.from === pokemonId);
}

// 거다이맥스 가능한지 확인
export function canGigantamax(pokemonId: number, item: string): GigantamaxData | null {
  if (item !== 'max-mushroom') return null;
  const gigantamax = GIGANTAMAX_FORMS.find(g => g.from === pokemonId);
  return gigantamax || null;
}

// 특정 포켓몬이 거다이맥스 가능한지 확인 (아이템 없이)
export function hasGigantamax(pokemonId: number): boolean {
  return GIGANTAMAX_FORMS.some(g => g.from === pokemonId);
}

// 특정 아이템으로 진화 가능한 포켓몬 ID 목록 가져오기
export function getEvolvableWithItem(item: string): number[] {
  return EVOLUTION_CHAINS
    .filter(e => e.item === item)
    .map(e => e.from);
}

// 메가스톤 목록 가져오기
export function getMegaStones(): string[] {
  return [...new Set(MEGA_EVOLUTIONS.map(e => e.item))];
}

// 레어도 타입
export type Rarity = 'Bronze' | 'Silver' | 'Gold' | 'Diamond' | 'Master' | 'Legend';

// 최종 진화체인지 확인
export function isFinalEvolution(pokemonId: number): boolean {
  // EVOLUTION_CHAINS에서 이 포켓몬 ID가 'from'에 있는지 확인
  // 메가진화는 진화로 치지 않음
  return !EVOLUTION_CHAINS.some(e => e.from === pokemonId);
}

// (참고) 분기 진화를 고려한 최종 진화체 ID 목록 가져오기
export function getFinalEvolutionIds(pokemonId: number): number[] {
  const evolutions = EVOLUTION_CHAINS.filter(e => e.from === pokemonId);
  
  if (evolutions.length === 0) {
    // 더 이상 진화할 수 없으면, 현재 ID가 최종 진화체
    return [pokemonId];
  }
  
  // 모든 분기 진화를 재귀적으로 탐색
  let finalEvos: number[] = [];
  for (const evo of evolutions) {
    finalEvos = finalEvos.concat(getFinalEvolutionIds(evo.to));
  }
  
  return [...new Set(finalEvos)]; // 중복 제거
}

// (단순) 다음 진화 ID 하나만 가져오기 (주로 레벨업용)
export function getFinalEvolutionId(pokemonId: number): number {
  const evolution = EVOLUTION_CHAINS.find(e => e.from === pokemonId);
  if (!evolution) return pokemonId; // 이미 최종 진화체
  return getFinalEvolutionId(evolution.to); // 재귀적으로 탐색
}


// 종족값 총합으로 레어도 계산
export function calculateRarity(statTotal: number): Rarity {
  if (statTotal >= 660) return 'Legend'; // 초전설급
  if (statTotal >= 600) return 'Master'; // 600족
  if (statTotal >= 540) return 'Diamond';
  if (statTotal >= 480) return 'Gold';
  if (statTotal >= 400) return 'Silver';
  return 'Bronze';
}

// 레어도별 가중치 (역수 관계 - 낮은 가중치 = 낮은 확률)
export const RARITY_WEIGHTS: Record<Rarity, number> = {
  'Bronze': 500,   // 가장 높은 확률
  'Silver': 150,
  'Gold': 35,
  'Diamond': 8,
  'Master': 5,
  'Legend': 2,     // 가장 낮은 확률
};

// 레어도별 색상
export const RARITY_COLORS: { [key in 'Bronze' | 'Silver' | 'Gold' | 'Diamond' | 'Master' | 'Legend']: string } = {
  Bronze: '#715442ff', // (border-amber-700)
  Silver: '#D1D5DB', // (border-gray-300)
  Gold: '#e0cb3dff',   // (border-yellow-400)
  Diamond: '#00fbffff', // (border-blue-400)
  Master: '#790eddff', // (border-purple-600)
  Legend: '#d20000ff', // (border-red-600)
};

// 합체 시스템 (Fusion System)
export interface FusionData {
  base: number; // 기본 포켓몬 ID
  material: number; // 재료 포켓몬 ID
  result: number; // 합체 결과 포켓몬 ID
  item: string; // 필요한 아이템
}

export const FUSION_DATA: FusionData[] = [
  // 큐레무 합체 (이미 올바름)
  { base: 646, material: 644, result: 10022, item: 'dna-splicers' }, // 큐레무 + 제크로무 = 블랙큐레무 (kyurem-black #10022)
  { base: 646, material: 643, result: 10023, item: 'dna-splicers' }, // 큐레무 + 레시라무 = 화이트큐레무 (kyurem-white #10023)
  
  // 네크로즈마 합체 (ID 수정)
  { base: 800, material: 791, result: 10155, item: 'dna-splicers' }, // 네크로즈마 + 솔가레오 = 황혼의 갈기 (necrozma-dusk #10155)
  { base: 800, material: 792, result: 10156, item: 'dna-splicers' }, // 네크로즈마 + 루나아라 = 새벽의 날개 (necrozma-dawn #10156)
  
  // 버드렉스 합체 (ID 수정)
  { base: 898, material: 896, result: 10193, item: 'dna-splicers' }, // 버드렉스 + 블리자포스 = 백마 (calyrex-ice #10193)
  { base: 898, material: 897, result: 10194, item: 'dna-splicers' }, // 버드렉스 + 레이스포스 = 흑마 (calyrex-shadow #10194)
];