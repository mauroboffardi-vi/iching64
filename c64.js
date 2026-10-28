// C64-style text screen: 40x25 characters of 8x8 pixels inside a border,
// rendered into a 384x272 offscreen canvas (the same frame a PAL C64 shows).
(function () {
  'use strict';

  const COLS = 40, ROWS = 25;
  const BX = 32, BY = 36;               // border thickness in pixels
  const W = COLS * 8 + BX * 2, H = ROWS * 8 + BY * 2;

  // The 16 C64 colours (VICE "default" palette).
  const PALETTE = [
    '#000000', '#FFFFFF', '#883932', '#67B6BD', '#8B3F96', '#55A049', '#40318D', '#BFCE72',
    '#8B5429', '#574200', '#B86962', '#505050', '#787878', '#94E089', '#7869C4', '#9F9F9F',
  ];
  const C = {
    BLACK: 0, WHITE: 1, RED: 2, CYAN: 3, PURPLE: 4, GREEN: 5, BLUE: 6, YELLOW: 7,
    ORANGE: 8, BROWN: 9, LRED: 10, DGREY: 11, GREY: 12, LGREEN: 13, LBLUE: 14, LGREY: 15,
  };
  const RGB = PALETTE.map(h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16)));

  // Hand-drawn 8x8 glyphs in the chunky two-pixel style of the C64 character set.
  // Each glyph is 8 rows, top to bottom, one hex byte per row (MSB = leftmost pixel).
  const GLYPHS = {
    ' ': '0000000000000000',
    'A': '183C667E66666600', 'B': '7C66667C66667C00', 'C': '3C66606060663C00',
    'D': '786C6666666C7800', 'E': '7E60607860607E00', 'F': '7E60607860606000',
    'G': '3C66606E66663C00', 'H': '6666667E66666600', 'I': '3C18181818183C00',
    'J': '1E0C0C0C0C6C3800', 'K': '666C7870786C6600', 'L': '6060606060607E00',
    'M': '63777F6B63636300', 'N': '66767E7E6E666600', 'O': '3C66666666663C00',
    'P': '7C66667C60606000', 'Q': '3C666666663C0E00', 'R': '7C66667C786C6600',
    'S': '3C66603C06663C00', 'T': '7E18181818181800', 'U': '6666666666663C00',
    'V': '66666666663C1800', 'W': '6363636B7F776300', 'X': '66663C183C666600',
    'Y': '6666663C18181800', 'Z': '7E060C1830607E00',
    '0': '3C666E7666663C00', '1': '1818381818187E00', '2': '3C66060C30607E00',
    '3': '3C66061C06663C00', '4': '060E1E667F060600', '5': '7E607C0606663C00',
    '6': '3C66607C66663C00', '7': '7E660C1818181800', '8': '3C66663C66663C00',
    '9': '3C66663E06663C00',
    // lower case, as in the C64's second (upper/lower case) character set
    'a': '00003C063E663E00', 'b': '0060607C66667C00', 'c': '00003C6060603C00',
    'd': '0006063E66663E00', 'e': '00003C667E603C00', 'f': '000E183E18181800',
    'g': '00003E66663E067C', 'h': '0060607C66666600', 'i': '0018003818183C00',
    'j': '000600060606063C', 'k': '0060606C786C6600', 'l': '0038181818183C00',
    'm': '0000667F7F6B6300', 'n': '00007C6666666600', 'o': '00003C6666663C00',
    'p': '00007C66667C6060', 'q': '00003E66663E0606', 'r': '00007C6660606000',
    's': '00003E603C067C00', 't': '00187E1818180E00', 'u': '0000666666663E00',
    'v': '00006666663C1800', 'w': '0000636B7F3E3600', 'x': '0000663C183C6600',
    'y': '00006666663E0C78', 'z': '00007E0C18307E00',
    '.': '0000000000181800', ',': '0000000000181830', ':': '0000180000180000',
    ';': '0000180000181830', '!': '1818181800001800', '?': '3C66060C18001800',
    "'": '060C180000000000', '"': '6666660000000000', '-': '0000007E00000000',
    '(': '0C18303030180C00', ')': '30180C0C0C183000', '/': '0003060C18306000',
    '*': '00663CFF3C660000', '+': '0018187E18180000', '=': '00007E007E000000',
    '<': '0E18306030180E00', '>': '70180C060C187000', '#': '6666FF66FF666600',
    '$': '183E603C067C1800', '%': '62660C1830664600', '&': '3C663C3867663F00',
    '@': '3C666E6E60623C00', '[': '3C30303030303C00', ']': '3C0C0C0C0C0C3C00',
    '_': '00000000000000FF',
    // PETSCII-like graphics
    '█': 'FFFFFFFFFFFFFFFF', '▀': 'FFFFFFFF00000000', '▄': '00000000FFFFFFFF',
    '▌': 'F0F0F0F0F0F0F0F0', '▐': '0F0F0F0F0F0F0F0F', '▒': 'CCCC3333CCCC3333',
    '─': '000000FFFF000000', '│': '1818181818181818',
    '╭': '000000070F1C1818', '╮': '000000E0F0381818',
    '╰': '18181C0F07000000', '╯': '181838F0E0000000',
    '╱': '0103060C183060C0', '╲': '80C06030180C0603',
    '●': '003C7E7E7E7E3C00', '○': '003C664242663C00', '✕': '0000663C183C6600',
    '♥': '367F7F7F3E1C0800', '♦': '081C3E7F3E1C0800', '→': '00180CFE0C180000',
    '←': '003060FE60300000', '·': '0000001818000000',
  };
  const FONT = {};
  for (const ch in GLYPHS) {
    const hex = GLYPHS[ch], rows = [];
    for (let i = 0; i < 8; i++) rows.push(parseInt(hex.substr(i * 2, 2), 16));
    FONT[ch] = rows;
  }

  // Bring any text down to what the C64 can show: ASCII + our graphics,
  // upper case unless the caller wants the lower case set.
  function fold(s, keepCase = false) {
    return String(s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
      .replace(/[–—‐]/g, '-').replace(/…/g, '...')
      [keepCase ? 'toString' : 'toUpperCase']();
  }

  class Screen {
    constructor() {
      this.canvas = document.createElement('canvas');
      this.canvas.width = W; this.canvas.height = H;
      this.ctx = this.canvas.getContext('2d');
      this.image = this.ctx.createImageData(W, H);
      this.chars = new Array(COLS * ROWS).fill(' ');
      this.colors = new Uint8Array(COLS * ROWS);
      this.reverse = new Uint8Array(COLS * ROWS);
      this.border = C.LBLUE; this.background = C.BLUE; this.color = C.LBLUE;
      this.cx = 0; this.cy = 0;
      this.cursorVisible = false; this.blink = false;
      this.dirty = true;
      setInterval(() => {
        this.blink = !this.blink;
        if (this.cursorVisible) this.dirty = true;
      }, 330);
      this.cls();
    }

    cls() {
      this.chars.fill(' '); this.colors.fill(this.color); this.reverse.fill(0);
      this.cx = 0; this.cy = 0; this.dirty = true;
    }

    put(x, y, ch, color = this.color, rev = 0) {
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
      const i = y * COLS + x;
      this.chars[i] = FONT[ch] ? ch : (ch === ' ' ? ' ' : '?');
      this.colors[i] = color; this.reverse[i] = rev ? 1 : 0;
      this.dirty = true;
    }

    // Positional write that does not move the cursor.
    text(x, y, str, color = this.color, rev = 0) {
      str = fold(str);
      for (let i = 0; i < str.length; i++) this.put(x + i, y, str[i], color, rev);
    }

    clearRow(y, from = 0, to = COLS - 1) {
      for (let x = from; x <= to; x++) this.put(x, y, ' ');
    }

    locate(x, y) { this.cx = x; this.cy = y; this.dirty = true; }

    // Write at the cursor like the KERNAL CHROUT: wraps at column 40, scrolls at the bottom.
    printChar(ch, color = this.color, rev = 0) {
      if (ch === '\n') { this.newline(); return; }
      this.put(this.cx, this.cy, ch, color, rev);
      if (++this.cx >= COLS) this.newline();
    }

    newline() {
      this.cx = 0;
      if (++this.cy >= ROWS) { this.scroll(); this.cy = ROWS - 1; }
      this.dirty = true;
    }

    backspace() {
      if (this.cx === 0 && this.cy === 0) return;
      if (--this.cx < 0) { this.cx = COLS - 1; this.cy--; }
      this.put(this.cx, this.cy, ' ');
    }

    scroll() {
      const n = COLS * (ROWS - 1);
      this.chars.copyWithin(0, COLS); this.colors.copyWithin(0, COLS); this.reverse.copyWithin(0, COLS);
      this.chars.fill(' ', n); this.colors.fill(this.color, n); this.reverse.fill(0, n);
      this.dirty = true;
    }

    render() {
      const d = this.image.data, bc = RGB[this.border], bg = RGB[this.background];
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const o = (y * W + x) * 4;
          const inside = x >= BX && x < W - BX && y >= BY && y < H - BY;
          const c = inside ? bg : bc;
          d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
        }
      }
      const cursorAt = this.cursorVisible && this.blink ? this.cy * COLS + this.cx : -1;
      for (let i = 0; i < COLS * ROWS; i++) {
        const rev = this.reverse[i] ^ (i === cursorAt ? 1 : 0);
        const ch = this.chars[i];
        if (ch === ' ' && !rev) continue;
        const glyph = FONT[ch], fg = RGB[i === cursorAt ? this.color : this.colors[i]];
        const px = BX + (i % COLS) * 8, py = BY + Math.floor(i / COLS) * 8;
        for (let r = 0; r < 8; r++) {
          let bits = glyph[r];
          if (rev) bits = ~bits & 0xff;
          for (let b = 0; b < 8; b++) {
            const c = bits & (0x80 >> b) ? fg : bg;
            const o = ((py + r) * W + px + b) * 4;
            d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2];
          }
        }
      }
      this.ctx.putImageData(this.image, 0, 0);
      this.dirty = false;
    }
  }

  const hasGlyph = ch => Object.prototype.hasOwnProperty.call(FONT, ch);

  window.C64 = { Screen, C, COLS, ROWS, W, H, fold, hasGlyph };
})();
