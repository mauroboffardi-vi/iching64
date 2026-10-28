# iching64

An I Ching reader with a Commodore 64 BASIC vibe. Pure static HTML/CSS/JS, no server code, keyboard only.

Open `index.html` in a browser (double-clicking works), or serve the folder with any static server:

```
python3 -m http.server 8064
```

## Keys

- Any key during the boot screen or an animation skips it.
- Type your question (optional), then **RETURN** to cast.
- **RETURN** / **SPACE** turns the pages of the reading.
- At `WOULD YOU LIKE A NEW I-CHING (Y/N)?` answer `Y` or `N`.
- After `N` you get a `READY.` prompt: `RUN` starts again, `LIST` shows the "program", `SYS 64738` reboots.

## How it casts

Each line uses the three-coin probabilities in one draw: 6 (old yin) and 9 (old yang) come up 1 time in 8,
7 (young yang) and 8 (young yin) 3 times in 8. Moving lines (6 and 9) flip to give the second hexagram.

## Files

- `index.html`, `style.css`: page shell
- `c64.js`: 40x25 text screen, hand-drawn 8x8 C64-style font with PETSCII-like graphics
- `crt.js`: WebGL CRT shader (barrel curvature, vignette, faint scanlines), with a 2D fallback
- `app.js`: the program: boot, question, casting, reading pages, BASIC prompt
- `data.js`: the 64 hexagrams

## Credits

Hexagram texts are from *The I Ching: A Beginner's Guide to the 64 Hexagrams* by Gavin,
https://www.youriching.com, shared for non-commercial use with attribution.
