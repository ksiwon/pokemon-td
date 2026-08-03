# assets-src — 원본 이미지 보관소 (배포되지 않음)

`public/` 밖에 있으므로 빌드 산출물(`dist/`)에 들어가지 않는다.
배포되는 건 여기서 만들어낸 `public/images/**.webp` 뿐이다.

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
