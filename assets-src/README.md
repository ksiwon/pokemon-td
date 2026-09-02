# assets-src — 원본 에셋 보관소 (배포되지 않음)

`public/` 밖에 있으므로 빌드 산출물(`dist/`)에 들어가지 않는다.
배포되는 건 여기서 만들어낸 `public/images/**.webp` 와 `public/sounds/dj-pikachu-*.m4a` 뿐이다.

## 왜 나눴나

맵 배경 PNG가 장당 4~6.7MB(2528×1696)였고, 맵 선택 화면이 그 8장을 카드 배경으로
그대로 깔았다. **화면 한 번 여는 데 약 44MB** — Netlify 무료 한도(100GB/월)를
하루 5GB 페이스로 태우던 주범이었다.

| | 이전 | 이후 |
|---|---|---|
| 맵 배경 8장 | 44 MB (PNG, 2528px) | 1.2 MB (WebP, 1920px) |
| 맵 선택 화면 1회 | 44 MB | 0.11 MB (480px 썸네일) |
| 로고 2종 | 1.0 MB (PNG, 800px) | 0.06 MB (WebP, 400px) |

## 다시 만들 때

게임 캔버스는 960×640 CSS px라 2배 DPI를 감안해 1920px이면 충분하다.
맵 카드는 폭 ~300px라 480px면 선명하다.

```bash
cd assets-src/maps
for f in *.png; do n="${f%.png}"
  [ "$n" = "battle_field" ] && continue          # 아레나 배경은 규격이 다르다(아래 참조)
  ffmpeg -y -i "$f" -vf scale=1920:-2 -c:v libwebp -quality 82 -compression_level 6 "../../public/images/maps/$n.webp"
  ffmpeg -y -i "$f" -vf scale=480:-2  -c:v libwebp -quality 76 -compression_level 6 "../../public/images/maps/thumbs/$n.webp"
done
```

`battle_field`는 TFT 배틀 아레나 보드(528px) 배경 전용이라 규격이 다르다.
원본이 1110×1110뿐이라 1920으로 뽑으면 **업스케일**만 되고 용량이 2.5배(55KB→141KB)로 뛴다.
썸네일도 쓰이지 않으므로 만들지 않는다.

```bash
ffmpeg -y -i battle_field.png -vf scale=1056:-2 -c:v libwebp -quality 82 -compression_level 6 \
  ../../public/images/maps/battle_field.webp
```

```bash
cd assets-src/logos
for f in *.png; do n="${f%.png}"
  ffmpeg -y -i "$f" -vf scale=400:-2 -c:v libwebp -quality 88 -compression_level 6 "../../public/images/$n.webp"
done
```

## 주의

`public/images/*`는 파일명이 고정이고 netlify.toml에서 30일 캐시가 걸려 있다.
이미지를 교체하면 **파일명을 바꾸거나** Netlify 캐시를 비워야 유저에게 반영된다.

---

# audio — BGM 청크 (`assets-src/audio/dj-pikachu.m4a`)

## 왜 나눴나

57분짜리 36.8MB 한 덩어리였다. `html5:true`(= `<audio>`)로 흘리면 브라우저가
필요한 만큼만 받을 거라 생각했는데, 실측해 보니 아니었다.

- 재생이 시작되면 **파일 전체를 당긴다.** range 재요청까지 겹쳐 세션당 약 70MB.
- 그 크기는 브라우저 **디스크 캐시의 항목당 상한을 넘어** 캐시에 얹히지 않는다.
  영구 프로필로 브라우저를 껐다 켜도 매번 처음부터 다시 받았다.
  (같은 조건에서 3MB짜리는 2회차에 0바이트 — 크기가 분수령이다.)

무료 한도 100GB/월 ÷ 70MB ≈ **1,400세션**이 천장이었다.

| 40초 체류 기준 | 이전(단일 36.8MB) | 이후(5분 청크) |
|---|---|---|
| 첫 방문 | 42.8 MB | **6.0 MB** |
| 재방문(브라우저 재시작) | 29.0 MB | **0 MB** |

## 다시 만들 때

`-c copy` 라 **재인코딩이 없다** — 음질은 원본과 비트 단위로 같다.
(청크 12개 길이 합계 3409.728s vs 원본 3409.706s — 경계당 2ms)

```bash
ffmpeg -i assets-src/audio/dj-pikachu.m4a   -f segment -segment_time 300 -c copy -reset_timestamps 1   public/sounds/dj-pikachu-%02d.m4a
```

5분(300초)을 고른 이유: 청크가 3MB 안팎이라 브라우저 캐시에 확실히 들어가고,
짧은 세션이 통째로 한 청크만 받는다. 더 길게 자르면 캐시 이득이 사라지고,
더 짧게 자르면 파일 수와 이음새 횟수만 늘어난다.

**청크를 새로 만들면 `src/services/SoundService.ts` 의 `BGM_TRACKS` 배열도 맞춰야 한다.**
경로를 `${i}` 로 조립하지 않고 전부 적어 두는 이유는 이 README 위쪽 맵 이미지 항목과 같다.

## 주의

`public/sounds/*` 도 netlify.toml에서 30일 캐시가 걸려 있다. 트랙을 바꾸면
**파일명을 바꾸거나** Netlify 캐시를 비워야 반영된다.
