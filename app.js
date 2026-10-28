// I-CHING 64: the program itself. Keyboard only.
(function () {
  'use strict';

  const { Screen, C, COLS, fold, hasGlyph } = C64;
  const scr = new Screen();
  const crt = new CRT(document.getElementById('screen'), scr.canvas);

  // ---------- display ----------

  function fit() {
    let w = window.innerWidth * 0.94, h = window.innerHeight * 0.94;
    if (w / h > 4 / 3) w = h * 4 / 3; else h = w * 3 / 4;
    crt.resize(Math.floor(w), Math.floor(h));
    scr.dirty = true;
  }
  window.addEventListener('resize', fit);
  fit();

  (function loop() {
    if (scr.dirty) { scr.render(); crt.draw(); }
    requestAnimationFrame(loop);
  })();

  // ---------- keyboard ----------

  let keyHandler = null;   // set while the program waits for input
  let hurry = false;       // any key pressed during an animation skips it

  window.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.key)) return;
    e.preventDefault();
    if (keyHandler) keyHandler(e.key, e.repeat);
    else hurry = true;
  });

  const frame = () => new Promise(r => requestAnimationFrame(r));

  function sleep(ms) {
    return new Promise(resolve => {
      const end = performance.now() + ms;
      (function tick() {
        if (hurry || performance.now() >= end) resolve(); else setTimeout(tick, 16);
      })();
    });
  }

  // Print at the cursor a few characters per frame, for that 1 MHz feel.
  async function print(str, color = scr.color, perFrame = 4) {
    str = fold(str);
    for (let i = 0; i < str.length; i++) {
      scr.printChar(str[i], color);
      if (!hurry && i % perFrame === perFrame - 1) await frame();
    }
  }
  const println = (str = '', color, perFrame) => print(str + '\n', color, perFrame);

  // Type as if someone were at the keyboard.
  async function typeCommand(str) {
    for (const ch of str) { scr.printChar(ch); scr.blink = true; await sleep(110); }
    scr.newline();
  }

  // BASIC-style line input with the blinking block cursor.
  function input(maxLen) {
    hurry = false;
    scr.cursorVisible = true; scr.blink = true; scr.dirty = true;
    return new Promise(resolve => {
      let buf = '';
      keyHandler = (key, repeat) => {
        scr.blink = true;
        if (key === 'Enter') {
          if (repeat) return;
          keyHandler = null; scr.cursorVisible = false;
          scr.newline();
          resolve(buf.trim());
        } else if (key === 'Backspace') {
          if (buf) { buf = buf.slice(0, -1); scr.backspace(); }
        } else if (key.length === 1) {
          const ch = fold(key);
          if (ch.length === 1 && hasGlyph(ch) && buf.length < maxLen) { buf += ch; scr.printChar(ch); }
        }
        scr.dirty = true;
      };
    });
  }

  // Wait for RETURN (or SPACE) with the cursor blinking where it stands.
  function waitReturn() {
    hurry = false;
    scr.cursorVisible = true; scr.blink = true; scr.dirty = true;
    return new Promise(resolve => {
      keyHandler = (key, repeat) => {
        if ((key === 'Enter' || key === ' ') && !repeat) {
          keyHandler = null; scr.cursorVisible = false; scr.dirty = true;
          resolve();
        }
      };
    });
  }

  // ---------- screen helpers ----------

  function titleBar(text, color = C.CYAN) {
    const t = fold(text);
    scr.text(0, 0, ' '.repeat(COLS), color, 1);
    scr.text(Math.floor((COLS - t.length) / 2), 0, t, color, 1);
  }

  function centered(center, y, text, color) {
    const t = fold(text);
    const x = Math.max(0, Math.min(COLS - t.length, center - Math.floor(t.length / 2)));
    scr.text(x, y, t, color);
  }

  function wrap(text, width = 38) {
    const out = [];
    let line = '';
    for (const word of fold(text).split(/\s+/).filter(Boolean)) {
      if (line && line.length + 1 + word.length > width) { out.push(line); line = word; }
      else line = line ? line + ' ' + word : word;
    }
    if (line) out.push(line);
    return out;
  }

  // ---------- the oracle ----------

  const BY_BITS = {};
  window.ICHING.forEach(h => { BY_BITS[h.bits] = h; });

  const LINE_NAMES = { 6: 'OLD YIN', 7: 'YOUNG YANG', 8: 'YOUNG YIN', 9: 'OLD YANG' };
  const POSITIONS = ['BOTTOM', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'TOP'];
  const isYang = v => v === 7 || v === 9;
  const isMoving = v => v === 6 || v === 9;

  // Three coins, heads = 3 and tails = 2: 6 and 9 come up 1 time in 8, 7 and 8 come up 3 times in 8.
  function castLine() {
    const r = new Uint8Array(1);
    crypto.getRandomValues(r);
    const v = r[0] & 7;
    return v === 0 ? 6 : v < 4 ? 7 : v < 7 ? 8 : 9;
  }

  const lineRow = i => 14 - 2 * i;

  function drawLine(x, i, yang, color) {
    for (let k = 0; k < 13; k++) scr.put(x + k, lineRow(i), !yang && k >= 5 && k <= 7 ? ' ' : '█', color);
  }

  function drawLabels(hex, center) {
    centered(center, 16, `${hex.n}. ${hex.name}`, C.WHITE);
    centered(center, 17, hex.pin, C.GREY);
    centered(center, 18, `ABOVE: ${hex.up}`, C.LBLUE);
    centered(center, 19, `BELOW: ${hex.lo}`, C.LBLUE);
  }

  function drawHeader(reading) {
    scr.color = C.LBLUE;
    scr.cls();
    titleBar('**** I-CHING 64 · BOOK OF CHANGES ****');
    if (reading.question) {
      const q = 'Q: ' + reading.question;
      scr.text(1, 2, q.length > 38 ? q.slice(0, 37) + '.' : q, C.GREY);
    }
  }

  // Full figure: the cast hexagram, and where it is heading when lines move.
  function drawFigure(reading) {
    const { values, from, to } = reading;
    const moving = values.some(isMoving);
    const lx = moving ? 3 : 13;
    drawHeader(reading);
    values.forEach((v, i) => {
      drawLine(lx, i, isYang(v), isMoving(v) ? C.YELLOW : C.WHITE);
      scr.put(lx - 2, lineRow(i), String(v), C.GREY);
      if (isMoving(v)) {
        scr.put(lx + 14, lineRow(i), v === 9 ? '○' : '✕', C.YELLOW);
        scr.text(19, lineRow(i), '──→', C.GREY);
        drawLine(24, i, !isYang(v), C.LGREEN);
      } else if (moving) {
        drawLine(24, i, isYang(v), C.WHITE);
      }
    });
    drawLabels(from, lx + 6);
    if (moving) {
      drawLabels(to, 30);
      centered(20, 21, '○ 9 OLD YANG   ✕ 6 OLD YIN   → BECOMES', C.GREY);
    } else {
      centered(20, 21, 'NO MOVING LINES: A STABLE SITUATION', C.GREY);
    }
  }

  async function askQuestion() {
    hurry = false;
    scr.color = C.LBLUE;
    scr.cls();
    titleBar('**** I-CHING 64 · BOOK OF CHANGES ****');
    centered(20, 21, 'TEXTS ADAPTED FROM', C.GREY);
    centered(20, 22, "THE I CHING: A BEGINNER'S GUIDE", C.GREY);
    centered(20, 23, 'BY GAVIN · YOURICHING.COM', C.GREY);
    scr.locate(0, 3);
    await println(' THINK CLEARLY ABOUT YOUR QUESTION.', C.WHITE);
    await println(' PRESS RETURN WHEN READY.', C.WHITE);
    await println();
    await println(' (YOU MAY TYPE THE QUESTION FIRST)', C.GREY);
    await println();
    await print('? ', C.LBLUE);
    return input(70);
  }

  async function cast(question) {
    const reading = { question, values: [] };
    drawHeader(reading);
    const spinner = ['│', '╱', '─', '╲'];
    for (let i = 0; i < 6; i++) {
      scr.clearRow(18);
      scr.text(10, 18, `CASTING LINE ${i + 1} OF 6`, C.LBLUE);
      for (let f = 0; f < 10 && !hurry; f++) {
        scr.put(30, 18, spinner[f % 4], C.WHITE);
        await sleep(55);
      }
      const v = castLine();
      reading.values.push(v);
      drawLine(13, i, isYang(v), isMoving(v) ? C.YELLOW : C.WHITE);
      scr.put(11, lineRow(i), String(v), C.GREY);
      if (isMoving(v)) scr.put(27, lineRow(i), v === 9 ? '○' : '✕', C.YELLOW);
      scr.clearRow(18);
      centered(20, 18, `LINE ${i + 1}: ${v} · ${LINE_NAMES[v]}`, isMoving(v) ? C.YELLOW : C.WHITE);
      await sleep(450);
    }
    await sleep(500);
    const bits = reading.values.map(v => isYang(v) ? '1' : '0').join('');
    const next = reading.values.map(v => (isYang(v) !== isMoving(v)) ? '1' : '0').join('');
    reading.from = BY_BITS[bits];
    reading.to = reading.values.some(isMoving) ? BY_BITS[next] : null;
    return reading;
  }

  // ---------- reading pages ----------

  const PAGE_LINES = 21;

  function heading(text) {
    const t = fold(text) + ' ';
    return { t: t + '─'.repeat(Math.max(0, 38 - t.length)), c: C.CYAN, heading: true };
  }

  function para(lines, text, color) {
    wrap(text).forEach(t => lines.push({ t, c: color }));
    lines.push({ t: '' });
  }

  // Split a section into screens, never stranding a heading at the bottom.
  function paginate(title, lines) {
    while (lines.length && !lines[lines.length - 1].t) lines.pop();
    const pages = [];
    let page = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!page.length && !l.t) continue;
      const strand = l.heading && page.length >= PAGE_LINES - 1;
      if (page.length >= PAGE_LINES || strand) { pages.push(page); page = []; if (!l.t) continue; }
      page.push(l);
    }
    if (page.length) pages.push(page);
    return pages.map((p, i) => ({ title: pages.length > 1 ? `${title} (${i + 1}/${pages.length})` : title, lines: p }));
  }

  function hexagramText(lines, hex) {
    para(lines, hex.sum, C.WHITE);
    lines.push(heading('THE JUDGMENT'));
    para(lines, hex.judg, C.LGREY);
    lines.push(heading('THE IMAGE'));
    para(lines, hex.img, C.LGREY);
  }

  function buildPages(reading) {
    const { values, from, to } = reading;
    const pages = [];
    let lines = [];
    hexagramText(lines, from);
    pages.push(...paginate(`${from.n}. ${from.name} · ${from.pin}`, lines));
    if (to) {
      lines = [];
      values.forEach((v, i) => {
        if (!isMoving(v)) return;
        lines.push(heading(`LINE ${i + 1} · ${POSITIONS[i]} · ${v} ${LINE_NAMES[v]}`));
        para(lines, from.lines[i].t, C.YELLOW);
        para(lines, from.lines[i].x, C.LGREY);
      });
      if (values.every(isMoving) && from.all) {
        lines.push(heading('ALL SIX LINES MOVING'));
        para(lines, from.all, C.LGREY);
      }
      pages.push(...paginate('MOVING LINES', lines));
      lines = [];
      hexagramText(lines, to);
      pages.push(...paginate(`BECOMING ${to.n}. ${to.name}`, lines));
    }
    return pages;
  }

  async function showPages(reading) {
    for (const page of buildPages(reading)) {
      hurry = false;
      scr.color = C.LBLUE;
      scr.cls();
      titleBar(page.title);
      for (let i = 0; i < page.lines.length; i++) {
        const l = page.lines[i];
        scr.locate(1, 2 + i);
        if (l.t) await print(l.t, l.c, 6);
      }
      scr.text(1, 24, 'PRESS RETURN', C.GREY);
      scr.locate(14, 24);
      await waitReturn();
    }
  }

  async function askAgain(reading) {
    drawFigure(reading);
    for (;;) {
      scr.clearRow(23);
      scr.locate(0, 23);
      await print('WOULD YOU LIKE A NEW I-CHING (Y/N)? ', C.WHITE);
      const answer = await input(3);
      scr.clearRow(24);
      if (answer.startsWith('Y')) return true;
      if (answer.startsWith('N')) { scr.locate(0, 23); return false; }
      if (answer) scr.text(0, 24, '?REDO FROM START', C.LBLUE);
    }
  }

  async function program() {
    let again = true;
    while (again) {
      const question = await askQuestion();
      const reading = await cast(question);
      drawFigure(reading);
      scr.text(1, 23, 'PRESS RETURN TO READ THE ORACLE', C.WHITE);
      scr.locate(33, 23);
      await waitReturn();
      await showPages(reading);
      again = await askAgain(reading);
    }
  }

  // ---------- the machine around it ----------

  async function boot() {
    hurry = false;
    scr.border = C.LBLUE; scr.background = C.BLUE; scr.color = C.LBLUE;
    scr.cursorVisible = false;
    scr.cls();
    await sleep(600);
    scr.text(4, 1, '**** COMMODORE 64 BASIC V2 ****');
    scr.text(1, 3, '64K RAM SYSTEM  38911 BASIC BYTES FREE');
    scr.text(0, 5, 'READY.');
    scr.locate(0, 6);
    scr.cursorVisible = true;
    await sleep(1200);
    await typeCommand('LOAD"I-CHING",8');
    scr.cursorVisible = false;
    await println();
    await println('SEARCHING FOR I-CHING');
    await sleep(800);
    await println('LOADING');
    await sleep(1500);
    await println('READY.');
    scr.cursorVisible = true;
    await sleep(600);
    await typeCommand('RUN');
    scr.cursorVisible = false;
    await sleep(300);
  }

  const LISTING = [
    '10 REM I-CHING 64',
    '20 PRINT "THINK CLEARLY ABOUT YOUR QUESTION."',
    '30 INPUT Q$',
    '40 FOR I=1 TO 6',
    '50 L(I)=6+INT(RND(0)*2)+INT(RND(0)*2)+INT(RND(0)*2)',
    '60 NEXT I',
    '70 GOSUB 1000:REM CONSULT THE ORACLE',
    '80 INPUT "WOULD YOU LIKE A NEW I-CHING";A$',
    '90 IF LEFT$(A$,1)="Y" THEN 20',
    '100 END',
  ];

  // A tiny BASIC prompt once the program has ended: RUN starts it again.
  async function basic() {
    scr.color = C.LBLUE;
    await println();
    await println('READY.');
    for (;;) {
      const cmd = await input(78);
      const bare = cmd.replace(/\s+/g, '');
      if (!bare) continue;
      if (bare === 'RUN') return 'run';
      if (bare === 'SYS64738') return 'reset';
      if (bare === 'LIST') {
        for (const l of LISTING) await println(l);
      } else if (bare === 'NEW' || bare === 'CLR') {
        // nothing to forget
      } else if (/^(PRINT|\?)/.test(bare)) {
        const arg = cmd.replace(/^\s*(PRINT|\?)\s*/, '');
        const str = arg.match(/^"([^"]*)"?$/);
        if (str) await println(str[1]);
        else if (/^-?\d+(\.\d+)?$/.test(arg)) await println(' ' + Number(arg));
        else if (!arg) await println();
        else { await println('?SYNTAX  ERROR'); }
      } else {
        await println('?SYNTAX  ERROR');
      }
      await println('READY.');
    }
  }

  async function main() {
    await boot();
    for (;;) {
      await program();
      if (await basic() === 'reset') await boot();
    }
  }

  document.getElementById('screen').focus();
  main();
})();
