const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/* ---- one frame queue for every scroll reader ----
   Four separate scroll listeners each read layout on each event, and a wheel
   burst fires hundreds of them per second. Every reader now registers a job
   here, so the whole page does one pass per painted frame instead of four. */
const scrollJobs = [];
let scrollTicking = false;

function addScrollJob(job) {
  scrollJobs.push(job);
}

window.addEventListener('scroll', () => {
  if (scrollTicking) return;
  scrollTicking = true;
  requestAnimationFrame(() => {
    scrollTicking = false;
    for (const job of scrollJobs) job();
  });
}, { passive: true });

const tabButtons = () => Array.from(document.querySelectorAll('.tab'));

function activateTab(name) {
  const target = document.getElementById('tab-' + name);
  const order = tabButtons();
  const index = order.findIndex((t) => t.dataset.tab === name);

  order.forEach((btn) => {
    const on = btn.dataset.tab === name;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });

  document.querySelectorAll('.sidebar-link').forEach((link) => {
    const on = link.dataset.target === name;
    link.classList.toggle('active', on);
    if (on) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
    // Chapter 03 keeps a lit parent while its nested tool is the open sheet.
    link.classList.toggle('active-parent', !on && name === 'ch03-tool' && link.dataset.target === 'ch03');
  });

  document.querySelectorAll('.tab-panels > .panel').forEach((panel) => {
    panel.classList.remove('active');
    panel.hidden = panel !== target;
  });

  // The steps either side of this sheet in tab order; the ends have one fewer.
  // Only the footer steps: a tool may reuse .btn-nav for its own stages.
  target.querySelectorAll('.nav-controls .btn-nav').forEach((btn) => {
    const back = btn.dataset.direction === 'prev';
    const step = back ? order[index - 1] : order[index + 1];
    btn.classList.toggle('hidden', !step);
    if (step) {
      btn.dataset.target = step.dataset.tab;
      // The circle shows a number, so the step names itself with the full title.
      btn.setAttribute('aria-label', (back ? 'Previous: ' : 'Next: ') + step.getAttribute('aria-label'));
    } else {
      delete btn.dataset.target;
      btn.removeAttribute('aria-label');
    }
  });

  void target.offsetWidth; // reflow between remove and add, so the entrance animation replays
  target.classList.add('active');

  // Panels are read top-down, and the Next button lives at the bottom of one,
  // so every switch starts the new sheet at its head. `instant` because the page
  // itself glides (html { scroll-behavior: smooth }) and a switch should not.
  window.scrollTo({ top: 0, behavior: 'instant' });

  paintView();
  buildTrack();
}

/* The sidebar is hand-written in index.html because it nests the scorecard
   under chapter 03; only the shared [data-target] contract is wired here. */
document.querySelector('.tabbar').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tab]');
  if (btn) activateTab(btn.dataset.tab);
});

document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-target]');
  if (!link) return;
  if (link.tagName === 'A') e.preventDefault(); // the href is the keyboard / middle-click affordance
  activateTab(link.dataset.target);
});

/* ===== scroll reveal =====
   Cards sit in the fog until their top edge reaches the middle band of the
   viewport. 0.7 is that band's lower edge: the same line the observer watches,
   so every state change is caught by a crossing. Above the line a card stays
   clear — text you have already read never fogs again. */
const REVEAL_EDGE = 0.7;
let atDocumentEnd = false;
let revealCards = [];

function revealState(card) {
  if (!card.offsetParent) return; // unrendered: its box is all zeros, so geometry would lie
  card.classList.toggle('is-visible',
    atDocumentEnd || card.getBoundingClientRect().top <= window.innerHeight * REVEAL_EDGE);
}

function paintView() {
  const sheet = document.querySelector('.tab-panels > .panel:not([hidden])');
  const notes = !!sheet && !!sheet.querySelector('article.notes');
  /* The fog fades the reading edge into the page, so it has to be the page's
     colour. Over the scene sheet the cards are dark glass with light ink, and
     a light fog at the fold would wash the text out. */
  const glass = !!sheet && !!sheet.querySelector('.ch03-sheet');
  document.body.classList.toggle('fog-on', notes && !glass && !atDocumentEnd);
  if (notes) revealCards.forEach(revealState);
}

function initScrollReveal() {
  revealCards = Array.from(document.querySelectorAll('.note-block'));
  if (!revealCards.length) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => revealState(entry.target));
  }, {
    root: null,
    rootMargin: '-30% 0px -30% 0px', // the middle 40% of the viewport
    threshold: 0
  });
  revealCards.forEach((card) => observer.observe(card));
  /* A crossing is reported with the next painted frame, which can land after
     the card has already moved past the line, so re-read wherever the reader
     stops and once a freshly opened sheet finishes sliding in. */
  window.addEventListener('scrollend', paintView, { passive: true });
  document.querySelector('.tab-panels').addEventListener('animationend', paintView);
  window.addEventListener('resize', paintView);
  /* The last row can sit below the band on a tall viewport, so reaching the
     end of the document clears everything and lifts the fog off the footer. */
  addScrollJob(() => {
    const end = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    if (end === atDocumentEnd) return;
    atDocumentEnd = end;
    paintView();
  });
  window.addEventListener('resize', paintView);
  paintView();
}

/* ---- page end ----
   The fourth-wall crack reads as a stray glowing border once the footer is on
   screen, so the last 50px of the document mark the body and the frame drops. */
function paintAtBottom() {
  const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 50;
  document.body.classList.toggle('at-bottom', atBottom);
}
addScrollJob(paintAtBottom);
window.addEventListener('resize', paintAtBottom);
paintAtBottom();

/* ===== scroll track =====
   One dot per card in the open sheet. The track is aria-hidden and its dots
   are out of the tab order on purpose: the sidebar already offers every one of
   these jumps to the keyboard, and a second copy would only add stops. */
const track = document.getElementById('scrollTrack');
let trackCards = [];
let trackIndex = -1;
let dotObserver;

function buildTrack() {
  const sheet = document.querySelector('.tab-panels > .panel:not([hidden])');
  trackCards = sheet ? Array.from(sheet.querySelectorAll('.note-block')) : [];
  trackIndex = -1;
  track.innerHTML = '';
  if (!trackCards.length) {
    track.classList.remove('has-dots');
    if (dotObserver) dotObserver.disconnect();
    return;
  }
  track.classList.add('has-dots');
  trackCards.forEach((card, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'scroll-dot';
    dot.dataset.index = String(i);
    dot.tabIndex = -1;
    track.appendChild(dot);
  });
  // The old dots are gone, so the observer watching the old cards goes with them.
  if (dotObserver) dotObserver.disconnect();
  dotObserver = new IntersectionObserver(markDots, {
    root: null,
    rootMargin: '-45% 0px -45% 0px',
    threshold: 0
  });
  trackCards.forEach((card) => dotObserver.observe(card));
  markDots();
}

function markDots() {
  if (!trackCards.length) return;
  const line = window.innerHeight * 0.5;
  let current = 0;
  trackCards.forEach((card, i) => {
    // One pixel of slack: a card parked exactly on the line has reached it.
    if (card.offsetParent && card.getBoundingClientRect().top <= line + 1) current = i;
  });
  const index = atDocumentEnd ? trackCards.length - 1 : current;
  if (index === trackIndex) return; // only a real change replays the bop
  trackIndex = index;
  Array.from(track.children).forEach((dot, i) => dot.classList.toggle('active', i === index));
}

track.addEventListener('click', (e) => {
  const dot = e.target.closest('.scroll-dot');
  if (!dot) return;
  const card = trackCards[Number(dot.dataset.index)];
  if (!card) return;
  card.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'center' });
});
/* The observer only reports a card as it crosses the midline, so a long jump
   can leave the lit dot one row behind. Reading the position once per frame
   keeps the dot honest wherever the reader lands, without a rect pass per
   scroll event. */
addScrollJob(markDots);
window.addEventListener('resize', markDots);

const firstTab = document.querySelector('.tab');
if (firstTab) activateTab(firstTab.dataset.tab);

/* ===== theme toggle =====
   index.html already resolved the stored / system preference before paint;
   this only labels the button and records later choices. */
const THEME_KEY = 'theme';
const themeToggle = document.getElementById('themeToggle');

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function paintToggle(theme) {
  if (!themeToggle) return;
  const headingToDark = theme === 'light';
  themeToggle.textContent = headingToDark ? '🌙 Dark' : '☀️ Light';
  themeToggle.setAttribute('aria-label', headingToDark ? 'Switch to dark mode' : 'Switch to light mode');
}

function applyTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.setAttribute('data-theme', theme);
  paintToggle(theme);
}

let wipes = 0;

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';

    // The wipe animates a snapshot, so it needs the API and motion permission;
    // without either, the theme simply swaps.
    if (reduceMotion.matches || typeof document.startViewTransition !== 'function') {
      applyTheme(next);
      return;
    }

    wipes += 1;
    document.documentElement.classList.add('theme-wipe');
    const transition = document.startViewTransition(() => applyTheme(next));
    // Starting a new wipe skips the running one, which rejects with AbortError.
    // The callback already swapped the theme, so only the cleanup matters.
    transition.ready.catch(() => {});
    transition.finished
      .catch(() => {})
      .finally(() => {
        wipes -= 1;
        if (wipes === 0) document.documentElement.classList.remove('theme-wipe');
      });
  });
}

/* ---- chapter 01: critical path vs slack ----
   The critical tasks are a chain: a task's shift carries into everything after
   it, so the finish line is always the test task's right edge. Slack never
   touches the finish line. Initial geometry is CSS; this only writes inline
   values while a block moves. */
function initTimeline() {
  const widget = document.querySelector('.cinematic-timeline');
  if (!widget) return;

  const finishLine = document.getElementById('finishLine');
  const statusText = document.getElementById('timelineStatus');
  const nodes = {
    design: widget.querySelector('[data-id="design"]'),
    build: widget.querySelector('[data-id="build"]'),
    test: widget.querySelector('[data-id="test"]'),
    docs: widget.querySelector('[data-id="docs"]')
  };
  if (!finishLine || !statusText || Object.values(nodes).some((n) => !n)) return;

  const plan = {
    design: { left: 0, width: 15 },
    build: { left: 15, width: 35 },
    test: { left: 50, width: 20 },
    docs: { left: 0, width: 30 }
  };
  const chain = ['design', 'build', 'test'];
  const shifts = { design: 0, build: 0, test: 0 };
  const finishAtRest = 70; // test's right edge on the base plan
  const finishRoom = 100 - finishAtRest; // nothing may be pushed off the track
  const slackLimit = 40;

  function placeChain() {
    let carried = 0;
    chain.forEach((id) => {
      carried += shifts[id];
      nodes[id].style.left = plan[id].left + carried + '%';
    });
  }

  function setFinish(delay, viaSheet) {
    const pos = finishAtRest + delay;
    // The percentage must resolve against the block area, not the whole
    // container: 100% here would include the label column a second time.
    const value = 'calc(var(--track-label) + (100% - var(--track-label)) * ' + (pos / 100).toFixed(4) + ')';
    if (viaSheet) scrollSheet.replaceSync('#finishLine { left: ' + value + ' }');
    else finishLine.style.left = value;
    widget.classList.toggle('delayed', delay > 0);
    finishLine.querySelector('.finish-label').textContent = delay > 0 ? 'DELAYED' : 'PROJECT FINISH';

    if (delay > 0) {
      const weeks = Math.round((delay / 10) * 10) / 10;
      statusText.textContent = 'Project Delayed by ' + weeks + (weeks === 1 ? ' Week!' : ' Weeks!');
      statusText.classList.add('delayed');
    } else {
      statusText.textContent = 'ON SCHEDULE';
      statusText.classList.remove('delayed');
    }
  }

  let drag = null;
  let dragged = false;

  /* Page scroll sweeps the finish line across the remaining float until the
     visitor takes over by dragging a block. Its position goes through an
     adopted sheet, so scrolling never adds a style attribute to the page. */
  const scrollSheet = new CSSStyleSheet();
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, scrollSheet];

  function scrollFraction() {
    const room = document.documentElement.scrollHeight - window.innerHeight;
    return room > 0 ? Math.min(1, Math.max(0, window.scrollY / room)) : 0;
  }

  function onScroll() {
    const pct = scrollFraction();
    const broken = pct >= 0.99;
    widget.classList.toggle('fourth-wall', broken);
    /* The crack is a screen, not a scene: it lives on <body> so it stays put
       when another chapter owns the viewport. */
    document.body.classList.toggle('fourth-wall', broken);
    if (dragged) return;
    setFinish(pct * finishRoom, true);
  }

  addScrollJob(onScroll);
  window.addEventListener('resize', onScroll);
  onScroll();

  function startDrag(e) {
    if (!widget.classList.contains('is-settled')) return;
    const block = e.target.closest('.task-block');
    if (!block || !widget.contains(block)) return;
    dragged = true;
    const point = e.type.indexOf('touch') === 0 ? e.touches[0] : e;

    drag = {
      id: block.dataset.id,
      block,
      critical: block.closest('.track-blocks').dataset.track === 'critical',
      startX: point.clientX,
      startLeft: (parseFloat(getComputedStyle(block).left) / block.parentElement.clientWidth) * 100,
      track: block.parentElement.clientWidth
    };
    block.classList.add('is-dragging');
  }

  function doDrag(e) {
    if (!drag) return;
    if (e.cancelable) e.preventDefault();
    const point = e.type.indexOf('touch') === 0 ? e.touches[0] : e;
    if (!point) return;

    const newLeft = Math.max(0, drag.startLeft + ((point.clientX - drag.startX) / drag.track) * 100);

    if (!drag.critical) {
      drag.block.style.left = Math.min(newLeft, slackLimit) + '%';
      return;
    }

    // Width cap keeps the right edge on the track; offsetWidth ignores the drag scale.
    const maxAllowedLeft = 100 - (drag.block.offsetWidth / drag.track) * 100;
    const cappedLeft = Math.min(newLeft, maxAllowedLeft);
    const id = drag.id;
    const at = chain.indexOf(id);
    const before = chain.slice(0, at).reduce((sum, c) => sum + shifts[c], 0);
    const after = chain.slice(at + 1).reduce((sum, c) => sum + shifts[c], 0);
    shifts[id] = Math.max(0, Math.min(cappedLeft - plan[id].left - before, finishRoom - before - after));
    placeChain();
    setFinish(shifts.design + shifts.build + shifts.test);
  }

  function endDrag() {
    if (!drag) return;
    drag.block.classList.remove('is-dragging');
    drag = null;
  }

  widget.addEventListener('mousedown', startDrag);
  window.addEventListener('mousemove', doDrag);
  window.addEventListener('mouseup', endDrag);
  widget.addEventListener('touchstart', startDrag, { passive: false });
  window.addEventListener('touchmove', doDrag, { passive: false });
  window.addEventListener('touchend', endDrag);
}

paintToggle(currentTheme());
initScrollReveal();
buildTrack();
initTimeline();

/* ---- cinematic bands: domain expansion ----
   Each band opens its sphere when a third of it is on screen, the title and
   instruments follow on their own transition delays, and the sequence settles
   after five seconds so the dimmed band accepts drags. Leaving re-arms it. */
function initDomainBands() {
  const bands = [...document.querySelectorAll('.cinematic-band')];
  if (!bands.length) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const SETTLE_MS = 4000;

  bands.forEach((widget) => {
    let settleTimer = null;

    const settle = () => {
      window.clearTimeout(settleTimer);
      settleTimer = null;
      widget.classList.add('is-settled');
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          widget.classList.add('is-active');
          if (reduced.matches) settle();
          else settleTimer = window.setTimeout(settle, SETTLE_MS);
        } else {
          window.clearTimeout(settleTimer);
          settleTimer = null;
          widget.classList.remove('is-active', 'is-settled');
          // Collapse the reveal without a transition, so re-entry restarts at 0.
          widget.classList.add('is-reset');
          void widget.offsetWidth;
          widget.classList.remove('is-reset');
        }
      });
    }, {
      threshold: 0.3
    });

    reduced.addEventListener('change', () => {
      if (reduced.matches && widget.classList.contains('is-active')) settle();
    });

    observer.observe(widget);
  });
}

initDomainBands();

/* ---- cinematic bands: particle field ----
   Fifty drifting motes over the sphere. Dark keeps the neon dust; light swaps
   to gold four-point flares that twinkle on a sine. The loop only runs while
   the band is on screen and uncovered, and a reduced-motion visitor gets one
   still frame. */
const flareSprites = new Map();

function flareSprite(colour) {
  if (flareSprites.has(colour)) return flareSprites.get(colour);

  const SIZE = 64;
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = SIZE;
  const g = sprite.getContext('2d');
  const h = SIZE / 2;

  // The halo is broad and soft; the spikes below carry the shape.
  const glow = g.createRadialGradient(h, h, 0, h, h, h);
  glow.addColorStop(0, 'rgba(255, 252, 240, 0.85)');
  glow.addColorStop(0.18, 'rgba(' + colour + ', 0.55)');
  glow.addColorStop(0.5, 'rgba(' + colour + ', 0.12)');
  glow.addColorStop(1, 'rgba(' + colour + ', 0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, SIZE, SIZE);

  // Concave sides are what read as a flare rather than a diamond.
  const reach = h * 0.96;
  const waist = h * 0.1;
  g.beginPath();
  g.moveTo(h, h - reach);
  g.quadraticCurveTo(h + waist, h - waist, h + reach, h);
  g.quadraticCurveTo(h + waist, h + waist, h, h + reach);
  g.quadraticCurveTo(h - waist, h + waist, h - reach, h);
  g.quadraticCurveTo(h - waist, h - waist, h, h - reach);
  g.closePath();
  g.fillStyle = 'rgba(' + colour + ', 0.92)';
  g.fill();

  g.beginPath();
  g.arc(h, h, waist, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255, 252, 240, 0.95)';
  g.fill();

  flareSprites.set(colour, sprite);
  return sprite;
}

function initField(canvas, widget, looks) {
  if (!canvas || !widget || !canvas.getContext) return;

  const ctx = canvas.getContext('2d');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const COUNT = 50; // per field; three fields stay far under the 500 budget
  const particles = [];
  let width = 0, height = 0, raf = null, stamp = 0.8, fieldX1 = 1;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.offsetWidth;
    height = canvas.offsetHeight;
    // A hidden sheet measures nothing; the field sizes itself on entry instead.
    if (!width || !height) return false;
    /* A banded scene may keep the stars out of the reading column; CSS owns
       that split, so the field asks instead of measuring breakpoints. */
    const bias = parseFloat(getComputedStyle(widget).getPropertyValue('--scene-field-x1'));
    fieldX1 = bias > 0 && bias <= 1 ? bias : 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  for (let i = 0; i < COUNT; i++) {
    particles.push({
      x: Math.random(), y: Math.random(),
      radius: Math.random() * 2 + 1,
      speedX: (Math.random() - 0.5) * 0.5,
      speedY: (Math.random() - 0.5) * 0.5,
      opacity: Math.random() * 0.5 + 0.1,
      // Per-star phase and rate keep the twinkle from pulsing in lockstep.
      phase: Math.random() * Math.PI * 2,
      rate: 0.8 + Math.random() * 1.6
    });
  }

  function paint(time) {
    if (!width || !height) return;
    stamp = time;
    const light = currentTheme() === 'light';
    const look = light ? looks.light : looks.dark;
    const sprite = light ? flareSprite(look.colour) : null;

    ctx.clearRect(0, 0, width, height);
    particles.forEach((p) => {
      const x = p.x * fieldX1 * width, y = p.y * height;
      if (sprite) {
        // 0.3 → 1.0, the range the light field was specified at.
        const alpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(time * p.rate + p.phase));
        const size = 6 + p.radius * 5;
        ctx.globalAlpha = alpha;
        ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + look.colour + ', ' + p.opacity + ')';
        ctx.shadowColor = 'rgba(' + look.colour + ', 0.9)';
        ctx.shadowBlur = 12;
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  function step(now) {
    if (!width && !resize()) { raf = requestAnimationFrame(step); return; }
    particles.forEach((p) => {
      p.x += p.speedX / width;
      p.y += p.speedY / height;
      if (p.x < 0) p.x = 1;
      if (p.x > 1) p.x = 0;
      if (p.y < 0) p.y = 1;
      if (p.y > 1) p.y = 0;
    });
    paint(now / 1000);
    raf = requestAnimationFrame(step);
  }

  function start() {
    if (raf !== null) return;
    resize();
    if (reduced.matches) { paint(stamp); return; }
    raf = requestAnimationFrame(step);
  }

  function stop() {
    if (raf === null) return;
    cancelAnimationFrame(raf);
    raf = null;
  }

  resize();
  paint(stamp);

  new IntersectionObserver((entries) => {
    entries.forEach((entry) => (entry.isIntersecting ? start() : stop()));
  }, { threshold: 0.05 }).observe(widget);

  window.addEventListener('resize', () => { resize(); if (raf === null) paint(stamp); });
  reduced.addEventListener('change', () => { stop(); start(); });
  // The toggle swaps the attribute inside a view transition; repaint at once so
  // the captured frame already carries the new palette.
  new MutationObserver(() => { if (raf === null) paint(stamp); })
    .observe(document.documentElement, { attributeFilter: ['data-theme'] });
}

/* ---- the page floor: one field for the whole document ----
   Every band keeps its own field over its own sphere; this one sits under all
   of them, so the gutters, the sheets and the tools float in the same space.
   It is fixed to the viewport, so it needs no IntersectionObserver: the field
   is always on screen and always cheap (80 stars, DPR capped at 2). */
function initGlobalStars() {
  const canvas = document.getElementById('globalStarCanvas');
  if (!canvas || !canvas.getContext) return;

  const ctx = canvas.getContext('2d');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const looks = { dark: { colour: '167, 139, 250' }, light: { colour: '217, 119, 6' } };
  const COUNT = 80;
  const particles = [];
  let width = 0, height = 0, raf = null, stamp = 0;

  for (let i = 0; i < COUNT; i++) {
    particles.push({
      x: Math.random(), y: Math.random(),
      radius: Math.random() * 2 + 1,
      speedX: (Math.random() - 0.5) * 0.3,
      speedY: (Math.random() - 0.5) * 0.3,
      opacity: Math.random() * 0.5 + 0.1,
      phase: Math.random() * Math.PI * 2,
      rate: 0.8 + Math.random() * 1.6
    });
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.offsetWidth;
    height = canvas.offsetHeight;
    if (!width || !height) return;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function paint(time) {
    if (!width || !height) return;
    stamp = time;
    const light = currentTheme() === 'light';
    const look = light ? looks.light : looks.dark;
    const sprite = light ? flareSprite(look.colour) : null;

    ctx.clearRect(0, 0, width, height);
    particles.forEach((p) => {
      const x = p.x * width, y = p.y * height;
      if (sprite) {
        // The same 0.3 → 1.0 twinkle the band fields carry.
        const alpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(time * p.rate + p.phase));
        const size = 6 + p.radius * 5;
        ctx.globalAlpha = alpha;
        ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + look.colour + ', ' + p.opacity + ')';
        ctx.shadowColor = 'rgba(' + look.colour + ', 0.9)';
        ctx.shadowBlur = 12;
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  function step(now) {
    particles.forEach((p) => {
      p.x += p.speedX / width;
      p.y += p.speedY / height;
      if (p.x < 0) p.x = 1;
      if (p.x > 1) p.x = 0;
      if (p.y < 0) p.y = 1;
      if (p.y > 1) p.y = 0;
    });
    paint(now / 1000);
    raf = requestAnimationFrame(step);
  }

  function start() {
    if (raf !== null) return;
    resize();
    if (reduced.matches) { paint(performance.now() / 1000); return; }
    raf = requestAnimationFrame(step);
  }

  resize();
  paint(0);
  start();

  window.addEventListener('resize', () => {
    const running = raf !== null;
    resize();
    if (!running) paint(stamp);
  });
  reduced.addEventListener('change', () => {
    if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
    start();
  });
  // The toggle swaps the attribute inside a view transition; when motion is
  // reduced the still frame has to be repainted by hand.
  new MutationObserver(() => { if (raf === null) paint(stamp); })
    .observe(document.documentElement, { attributeFilter: ['data-theme'] });
}

/* ---- chapter 03: the core ----
   A wireframe icosahedron on a 2D canvas: it turns on its own, the scroll
   through the hold adds half a revolution and a push toward the camera, and
   the pointer leans it. Grab it and it spins, and keeps turning when you let
   go. It never stands down for the reading pass: the object stays in the left
   column while the notes ride up the right. */
function initCh03Scene() {
  const widget = document.getElementById('ch03Scene');
  const canvas = document.getElementById('ch03Core');
  if (!widget || !canvas || !canvas.getContext) return;

  const ctx = canvas.getContext('2d');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hold = widget.closest('.band-hold') || widget;

  const PHI = (1 + Math.sqrt(5)) / 2;
  const scale = Math.sqrt(1 + PHI * PHI);
  const verts = [
    [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
    [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
    [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]
  ].map(([x, y, z]) => [x / scale, y / scale, z / scale]);

  const edges = [];
  let nearest = Infinity;
  const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  for (let i = 0; i < verts.length; i++) {
    for (let j = i + 1; j < verts.length; j++) {
      nearest = Math.min(nearest, gap(verts[i], verts[j]));
    }
  }
  for (let i = 0; i < verts.length; i++) {
    for (let j = i + 1; j < verts.length; j++) {
      if (Math.abs(gap(verts[i], verts[j]) - nearest) < 1e-6) edges.push([i, j]);
    }
  }

  let cw = 0, ch = 0, raf = null, onScreen = false, objectX = 0.5;

  /* Pointer state. The cursor leans the core by up to half a radian and the
     lean glides there; a drag adds a spin that stays, and the last delta of
     the drag carries on as a throw once the button is released. */
  const LEAN = 1;        // normalised ±0.5 of the screen × LEAN = ±0.5 rad
  const GLIDE = 0.06;    // per frame toward the pointer target
  const THROW = 0.9;     // per frame decay after release
  const FLING = 0.6;     // the share of the last step kept as a throw
  let targetX = 0, targetY = 0;
  let leanX = 0, leanY = 0;
  let spinX = 0, spinY = 0;
  let throwX = 0, throwY = 0;
  let drag = null;

  function ease() {
    leanX += (targetX - leanX) * GLIDE;
    leanY += (targetY - leanY) * GLIDE;
    if (drag) return;
    spinX += throwX;
    spinY += throwY;
    if (Math.abs(throwX) < 1e-4) throwX = 0; else throwX *= THROW;
    if (Math.abs(throwY) < 1e-4) throwY = 0; else throwY *= THROW;
  }

  function leanTo(x, y) {
    targetX = ((y - window.innerHeight / 2) / window.innerHeight) * LEAN;
    targetY = ((x - window.innerWidth / 2) / window.innerWidth) * LEAN;
  }

  function onHover(e) {
    if (reduced.matches) return;
    leanTo(e.clientX, e.clientY);
  }

  function onLeave() {
    targetX = 0;
    targetY = 0;
  }

  /* The copy stays selectable: a press that lands on the title or the
     subtitle is the reader reaching for text, not for the object. */
  function onDown(e) {
    if (reduced.matches || drag) return;
    if (e.target.closest('.ch03-content')) return;
    drag = { x: e.clientX, y: e.clientY };
    throwX = 0;
    throwY = 0;
    widget.classList.add('is-dragging');
    e.preventDefault();
  }

  function onDragMove(e) {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    spinY += dx * 0.008;
    spinX += dy * 0.008;
    throwY = dx * 0.008 * FLING;
    throwX = dy * 0.008 * FLING;
  }

  function onUp() {
    if (!drag) return;
    drag = null;
    widget.classList.remove('is-dragging');
  }

  function onTouchStart(e) {
    if (reduced.matches || e.touches.length !== 1) return;
    const t = e.touches[0];
    if (t.target && t.target.closest && t.target.closest('.ch03-content')) return;
    drag = { x: t.clientX, y: t.clientY };
    throwX = 0;
    throwY = 0;
  }

  function onTouchMove(e) {
    if (!drag || e.touches.length !== 1) return;
    const t = e.touches[0];
    onDragMove(t);
    leanTo(t.clientX, t.clientY);
  }

  widget.addEventListener('mousemove', onHover, { passive: true });
  widget.addEventListener('mouseleave', onLeave, { passive: true });
  widget.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onDragMove);
  window.addEventListener('mouseup', onUp);
  widget.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: true });
  window.addEventListener('touchend', onUp, { passive: true });

  function fit() {
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    if (!w || !h) return false;
    /* CSS owns the split and its breakpoint; the object only asks where. */
    const anchor = parseFloat(getComputedStyle(widget).getPropertyValue('--scene-object-x'));
    objectX = anchor > 0 && anchor < 1 ? anchor : 0.5;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w !== cw || h !== ch) {
      cw = w;
      ch = h;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    return true;
  }

  function progress() {
    const rect = hold.getBoundingClientRect();
    const span = rect.height - window.innerHeight;
    return span > 0 ? Math.min(1, Math.max(0, -rect.top / span)) : 0;
  }

  function draw(time) {
    if (!fit()) return;

    const t = reduced.matches ? 0 : time;
    const p = reduced.matches ? 0.28 : progress();
    /* Reduced motion keeps the core exactly where it was drawn: no lean, no
       spin, no throw, however the pointer has been moving. */
    const hand = reduced.matches ? 0 : leanX + spinX;
    const turn = reduced.matches ? 0 : leanY + spinY;
    const rx = 0.42 + t * 0.12 + p * Math.PI * 0.85 + hand;
    const ry = -0.3 + t * 0.17 + p * Math.PI * 2 + turn;
    const radius = Math.min(cw, ch) * 0.24 * (1 + p * 1.55);
    const cx = cw * objectX;
    const cy = ch * 0.46;
    const fov = 4.6;
    const cosX = Math.cos(rx), sinX = Math.sin(rx);
    const cosY = Math.cos(ry), sinY = Math.sin(ry);

    const pts = verts.map(([x, y, z]) => {
      const X = x * cosY - z * sinY;
      const Z1 = x * sinY + z * cosY;
      const Y = y * cosX - Z1 * sinX;
      const Z = y * sinX + Z1 * cosX;
      const k = fov / (fov - Z);
      return { x: cx + X * radius * k, y: cy + Y * radius * k, z: Z, k };
    });

    const light = currentTheme() === 'light';
    const ink = light ? '154, 92, 10' : '167, 139, 250';
    const accent = light ? '217, 119, 6' : '34, 211, 238';

    ctx.clearRect(0, 0, cw, ch);
    edges.forEach(([i, j], index) => {
      const a = pts[i], b = pts[j];
      const depth = (a.z + b.z) / 2; // -1 back … 1 front
      const alpha = 0.16 + 0.55 * ((depth + 1) / 2);
      ctx.strokeStyle = 'rgba(' + (index % 5 === 0 ? accent : ink) + ', ' + alpha.toFixed(3) + ')';
      ctx.lineWidth = depth > 0 ? 1.4 : 0.8;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });

    pts.forEach((pt) => {
      const alpha = 0.22 + 0.55 * ((pt.z + 1) / 2);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 1.5 * pt.k, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + accent + ', ' + alpha.toFixed(3) + ')';
      ctx.fill();
    });
  }

  function frame(now) {
    ease();
    draw(now / 1000);
    raf = requestAnimationFrame(frame);
  }

  function still() {
    draw(performance.now() / 1000);
  }

  function start() {
    if (raf !== null || reduced.matches) return;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (raf === null) return;
    cancelAnimationFrame(raf);
    raf = null;
  }

  new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      onScreen = entry.isIntersecting;
      if (!onScreen) { stop(); return; }
      if (reduced.matches) still();
      else start();
    });
  }, { threshold: 0.05 }).observe(widget);

  window.addEventListener('resize', () => { if (raf === null) still(); });
  reduced.addEventListener('change', () => {
    stop();
    if (!onScreen) return;
    if (reduced.matches) still();
    else start();
  });
  new MutationObserver(() => { if (raf === null && onScreen) still(); })
    .observe(document.documentElement, { attributeFilter: ['data-theme'] });

  still();
}

/* ---- chapter 01: parallax tilt ----
   The tracks ride a plane that leans toward the pointer and eases with scroll.
   The transform lives in an adopted sheet, so no element gains a style attribute. */
function init3DTilt() {
  const wrapper = document.getElementById('tiltWrapper');
  const section = document.getElementById('timelineWidget');
  if (!wrapper || !section) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const sheet = new CSSStyleSheet();
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  const clamp = (n) => Math.max(-1, Math.min(1, n));
  const pointer = { x: 0, y: 0 };
  let scrollLean = 0;
  let queued = false;

  function apply() {
    queued = false;
    const rx = Math.max(-6, Math.min(6, -(pointer.y * 5 + scrollLean * 2)));
    const ry = Math.max(-6, Math.min(6, pointer.x * 5));
    sheet.replaceSync('#tiltWrapper{transform:rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg)}');
  }

  function queue() {
    if (queued || reduced.matches) return;
    queued = true;
    requestAnimationFrame(apply);
  }

  function measureScroll() {
    const r = section.getBoundingClientRect();
    scrollLean = clamp(((r.top + r.height / 2) - window.innerHeight / 2) / window.innerHeight);
  }

  section.addEventListener('mousemove', (e) => {
    if (reduced.matches) return;
    const r = section.getBoundingClientRect();
    pointer.x = clamp(((e.clientX - r.left) / r.width - 0.5) * 2);
    pointer.y = clamp(((e.clientY - r.top) / r.height - 0.5) * 2);
    queue();
  });

  section.addEventListener('mouseleave', () => {
    pointer.x = 0;
    pointer.y = 0;
    queue();
  });

  addScrollJob(() => {
    if (reduced.matches) return;
    measureScroll();
    queue();
  });

  window.addEventListener('resize', queue);
  reduced.addEventListener('change', () => {
    pointer.x = 0; pointer.y = 0; scrollLean = 0;
    sheet.replaceSync('');
  });

  measureScroll();
}

initField(document.getElementById('particleCanvas'), document.getElementById('timelineWidget'), {
  dark: { colour: '167, 139, 250' },
  light: { colour: '217, 119, 6' }
});
initField(document.getElementById('scaleCanvas'), document.getElementById('scaleWidget'), {
  dark: { colour: '52, 211, 153' },
  light: { colour: '217, 119, 6' }
});
initField(document.getElementById('ch03Canvas'), document.getElementById('ch03Scene'), {
  dark: { colour: '167, 139, 250' },
  light: { colour: '217, 119, 6' }
});
initField(document.getElementById('wbsCanvas'), document.getElementById('wbsWidget'), {
  dark: { colour: '167, 139, 250' },
  light: { colour: '217, 119, 6' }
});
initField(document.getElementById('triangleCanvas'), document.getElementById('triangleBand'), {
  dark: { colour: '167, 139, 250' },
  light: { colour: '217, 119, 6' }
});
initField(document.getElementById('resourceCanvas'), document.getElementById('resourceBand'), {
  dark: { colour: '167, 139, 250' },
  light: { colour: '217, 119, 6' }
});
initField(document.getElementById('riskCanvas'), document.getElementById('riskBand'), {
  dark: { colour: '167, 139, 250' },
  light: { colour: '217, 119, 6' }
});
initCh03Scene();
init3DTilt();

/* ---- chapter 02: the selection matrix ----
   Bar heights are dynamic, so they cannot live in layout.css. They go through a
   constructable stylesheet instead of inline styles: the zero-inline-style
   contract holds, and reusing the bar elements keeps the grow transition alive
   between slider moves. */
function initScale() {
  const widget = document.getElementById('scaleWidget');
  if (!widget) return;

  const weights = {
    cost: document.getElementById('weight-cost'),
    time: document.getElementById('weight-time'),
    risk: document.getElementById('weight-risk')
  };
  const displays = {
    cost: document.getElementById('val-cost'),
    time: document.getElementById('val-time'),
    risk: document.getElementById('val-risk')
  };
  const bars = document.getElementById('equalizerBars');
  if (!weights.cost || !weights.time || !weights.risk || !bars) return;

  // Fixed project scores (1-10)
  const projects = [
    { name: 'A', scores: { cost: 6, time: 3, risk: 4 } },
    { name: 'B', scores: { cost: 4, time: 8, risk: 2 } },
    { name: 'C', scores: { cost: 8, time: 5, risk: 6 } }
  ];

  const sheet = new CSSStyleSheet();
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

  const columns = projects.map((project) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'eq-bar-wrapper';
    wrapper.dataset.project = project.name;

    const bar = document.createElement('div');
    bar.className = 'eq-bar';

    const points = document.createElement('span');
    points.className = 'eq-points';

    const label = document.createElement('div');
    label.className = 'eq-label';
    label.textContent = project.name;

    bar.appendChild(points);
    wrapper.append(bar, label);
    bars.appendChild(wrapper);
    return { wrapper, bar, points };
  });

  function calculate() {
    const w = {
      cost: parseInt(weights.cost.value, 10),
      time: parseInt(weights.time.value, 10),
      risk: parseInt(weights.risk.value, 10)
    };

    // Max possible points to normalise the bars (10 * 10 * 3 = 300)
    const maxPoints = (w.cost + w.time + w.risk) * 10;

    const scores = projects.map((p) => {
      const points = p.scores.cost * w.cost + p.scores.time * w.time + p.scores.risk * w.risk;
      return { name: p.name, points, percentage: (points / maxPoints) * 100 };
    });

    const winner = scores.reduce((prev, current) => (prev.points > current.points ? prev : current));

    sheet.replaceSync(
      scores
        .map((s) => '.eq-bar-wrapper[data-project="' + s.name + '"] .eq-bar{height:' + s.percentage.toFixed(2) + '%}')
        .join('\n')
    );

    columns.forEach((column, i) => {
      const isWinner = scores[i].name === winner.name;
      column.wrapper.classList.toggle('winner', isWinner);
      column.bar.classList.toggle('winner', isWinner);
      column.points.textContent = Math.round(scores[i].points) + ' pts';
    });

    Object.keys(displays).forEach((key) => {
      if (displays[key]) displays[key].textContent = String(w[key]);
    });
  }

  Object.values(weights).forEach((input) => input.addEventListener('input', calculate));

  calculate();
}

initScale();

/* ---- chapter 04: work breakdown structure ----
   One delegated click handler toggles any node's target; the CSS owns the
   horizontal collapse and the shatter stagger, this only flips state.
   data-wbs-target, not data-target: the tab rail already owns that attribute. */
function initWBS() {
  const widget = document.getElementById('wbsWidget');
  if (!widget) return;

  widget.querySelectorAll('.wbs-node[data-wbs-target]').forEach((btn) => {
    btn.setAttribute('aria-expanded', 'false');
    if (document.getElementById(btn.dataset.wbsTarget)) btn.setAttribute('aria-controls', btn.dataset.wbsTarget);
  });

  widget.addEventListener('click', (e) => {
    const btn = e.target.closest('.wbs-node');
    if (!btn || !btn.dataset.wbsTarget) return;

    const targetContainer = document.getElementById(btn.dataset.wbsTarget);
    if (!targetContainer) return;

    const isOpen = targetContainer.classList.toggle('is-open');
    btn.setAttribute('aria-expanded', String(isOpen));
  });

  // Open the first level on load, after the page has settled, so it animates in.
  const level1 = document.getElementById('level1');
  if (level1) {
    setTimeout(() => {
      level1.classList.add('is-open');
      const root = widget.querySelector('.wbs-node[data-wbs-target="level1"]');
      if (root) root.setAttribute('aria-expanded', 'true');
    }, 500);
  }
}

initWBS();

/* ---- chapter 05: the iron triangle ----
   Speed is the only control because the other two corners are consequences:
   every step faster than 5 adds a point of cost and takes a point of scope.
   At either extreme one corner is left with a single point and the polygon
   cannot hold, so it goes to the alert red and shakes once. */
function initTriangle() {
  const slider = document.getElementById('tri-time');
  const path = document.getElementById('trianglePath');
  if (!slider || !path) return;

  const timeOut = document.getElementById('tri-val-time');
  const costOut = document.getElementById('tri-val-cost');
  const scopeOut = document.getElementById('tri-val-scope');
  const costBar = document.getElementById('bar-cost');
  const scopeBar = document.getElementById('bar-scope');
  const status = document.getElementById('tri-status');
  const narrative = document.getElementById('triNarrative');

  function setBar(bar, name, value) {
    bar.dataset.value = value;
    bar.parentElement.setAttribute('aria-label', name + ': ' + value + ' of 10');
  }

  function update() {
    const speed = Number(slider.value);
    const cost = speed;
    const scope = 10 - speed;
    const broken = cost <= 1 || scope <= 1;

    timeOut.textContent = speed;
    costOut.textContent = cost;
    scopeOut.textContent = scope;
    setBar(costBar, 'Cost', cost);
    setBar(scopeBar, 'Scope', scope);
    path.classList.toggle('broken', broken);
    status.textContent = broken ? 'IRON TRIANGLE BROKEN' : 'THE TRIANGLE HOLDS';
    status.classList.toggle('broken', broken);

    // The slider is the speed: higher means faster, which the meters above
    // already price as more cost and less scope.
    if (narrative) {
      if (speed > 8) {
        narrative.textContent = 'Rushing the project (Fast Time) forces the team to buy more resources (Cost Up) and cut features (Scope Down). High risk of burnout.';
        narrative.classList.add('broken');
      } else if (speed < 3) {
        narrative.textContent = 'Taking too long (Slow Time) keeps costs low, but the market might move on before you launch.';
        narrative.classList.remove('broken');
      } else {
        narrative.textContent = 'The project is balanced. Time, Cost, and Scope are aligned.';
        narrative.classList.remove('broken');
      }
    }
  }

  slider.addEventListener('input', update);
  update();
}

initTriangle();

/* ---- chapter 06: resource leveling ----
   Three lanes and three tasks; the visitor drags a pill left/right (and across
   lanes) until no two tasks share a moment on the same person. Positions are
   percentages, snapped to 5% on drop. The shared band observer handles the
   domain expansion, so this only owns the simulation. */
function initResourceSim() {
  const band = document.getElementById('resourceBand');
  if (!band) return;

  const statusEl = document.getElementById('resourceStatus');
  const narrativeEl = document.getElementById('resourceNarrative');
  const tracks = {
    dev1: document.getElementById('track-dev1'),
    dev2: document.getElementById('track-dev2'),
    designer: document.getElementById('track-designer')
  };
  const tasks = [
    { id: 'design', name: 'UI Design', start: 0, width: 30, lane: 'designer' },
    { id: 'build', name: 'Build Core', start: 20, width: 40, lane: 'dev1' },
    { id: 'test', name: 'QA Testing', start: 60, width: 30, lane: 'dev2' }
  ];
  const pills = new Map();

  const laneAt = (clientY) => {
    let best = null;
    let bestDistance = Infinity;
    Object.keys(tracks).forEach((name) => {
      const r = tracks[name].getBoundingClientRect();
      if (clientY >= r.top - 6 && clientY <= r.bottom + 6) {
        best = name;
        bestDistance = 0;
      } else if (bestDistance > 0) {
        const distance = Math.abs(clientY - (r.top + r.height / 2));
        if (distance < bestDistance) { bestDistance = distance; best = name; }
      }
    });
    return best;
  };

  function checkOverlaps() {
    const flagged = new Set();
    Object.keys(tracks).forEach((lane) => {
      const laneTasks = tasks.filter((task) => task.lane === lane);
      laneTasks.forEach((a, i) => {
        laneTasks.slice(i + 1).forEach((b) => {
          if (a.start < b.start + b.width && a.start + a.width > b.start) {
            flagged.add(a.id);
            flagged.add(b.id);
          }
        });
      });
    });
    tasks.forEach((task) => {
      pills.get(task.id).classList.toggle('overallocated', flagged.has(task.id));
    });
    const bad = flagged.size > 0;
    statusEl.textContent = bad ? '⚠️ Resource Overallocated! Drag tasks to fix.' : 'All Resources Leveled';
    statusEl.classList.toggle('warning', bad);
    narrativeEl.textContent = bad
      ? 'Two tasks are happening at once! This will burn out your developer. Drag a task to a different time or lane to level the resources.'
      : "Good job. By shifting tasks, you've balanced the workload and prevented burnout.";
    narrativeEl.classList.toggle('warning', bad);
  }

  function beginDrag(task, el) {
    return (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      event.preventDefault();
      const startX = event.clientX;
      const startLeft = task.start;
      const trackWidth = tracks[task.lane].getBoundingClientRect().width;
      if (!trackWidth) return;
      el.classList.add('is-dragging');

      const move = (e) => {
        const delta = ((e.clientX - startX) / trackWidth) * 100;
        const next = Math.max(0, Math.min(100 - task.width, startLeft + delta));
        el.style.left = next + '%';
        const lane = laneAt(e.clientY);
        if (lane && lane !== task.lane) {
          task.lane = lane;
          tracks[lane].appendChild(el);
        }
      };

      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        el.classList.remove('is-dragging');
        const raw = parseFloat(el.style.left) || 0;
        task.start = Math.max(0, Math.min(100 - task.width, Math.round(raw / 5) * 5));
        el.style.left = task.start + '%';
        checkOverlaps();
      };

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    };
  }

  function render() {
    Object.values(tracks).forEach((track) => { track.textContent = ''; });
    pills.clear();
    tasks.forEach((task) => {
      const el = document.createElement('div');
      el.className = 'task-pill';
      el.dataset.id = task.id;
      el.textContent = task.name;
      el.style.left = task.start + '%';
      el.style.width = task.width + '%';
      el.addEventListener('pointerdown', beginDrag(task, el));
      tracks[task.lane].appendChild(el);
      pills.set(task.id, el);
    });
    checkOverlaps();
  }

  render();
}

initResourceSim();

/* ---- chapter 08: risk heat map ----
   Nine cells: rows run high to low impact top to bottom, columns low to high
   likelihood left to right. Native HTML5 drag and drop moves a risk into a
   cell; whichever risks sit in a high zone are flagged with the alert ring and
   the status line. The shared band observer owns the domain expansion. */
function initRiskMap() {
  const band = document.getElementById('riskBand');
  if (!band) return;

  const matrix = document.getElementById('riskMatrix');
  const pool = document.getElementById('riskPool');
  const statusEl = document.getElementById('riskStatus');
  const narrativeEl = document.getElementById('riskNarrative');
  const risks = [
    { id: 'server', name: 'Server Crash' },
    { id: 'weather', name: 'Rainy Weather' },
    { id: 'budget', name: 'Budget Cut' }
  ];
  // A cell's zone is the weaker of its two axes: either dimension low keeps the
  // risk low, and only high impact together with high likelihood is a red cell.
  const impacts = ['high', 'med', 'low'];
  const likelihoods = ['low', 'med', 'high'];
  const rank = { low: 1, med: 2, high: 3 };
  const zoneLabel = { low: 'Low', med: 'Med', high: 'High' };
  const zones = impacts.flatMap((impact) => likelihoods.map((likelihood) => {
    const score = Math.min(rank[impact], rank[likelihood]);
    return score === 1 ? 'low' : score === 2 ? 'med' : 'high';
  }));

  function updateStatus() {
    const placed = [...band.querySelectorAll('.risk-cell .risk-bubble')];
    placed.forEach((bubble) => {
      bubble.classList.toggle('risk-high', bubble.closest('.risk-cell').dataset.zone === 'high');
    });
    const high = placed.some((bubble) => bubble.classList.contains('risk-high'));
    statusEl.textContent = high
      ? 'High Risk: Mitigation Plan Required!'
      : placed.length
        ? 'Risk placed. Keep assessing the rest.'
        : 'Drag a risk onto the grid to begin.';
    statusEl.classList.toggle('warning', high);
  }

  zones.forEach((zone, index) => {
    const row = Math.floor(index / 3);
    const col = index % 3;
    const cell = document.createElement('div');
    cell.className = 'risk-cell';
    cell.dataset.zone = zone;
    cell.dataset.zoneLabel = zoneLabel[zone];
    cell.dataset.index = String(index);
    cell.setAttribute('aria-label', impacts[row] + ' impact, ' + likelihoods[col] + ' likelihood: ' + zone + ' risk zone');
    cell.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      cell.classList.add('drag-over');
    });
    cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
    cell.addEventListener('drop', (event) => {
      event.preventDefault();
      cell.classList.remove('drag-over');
      const id = event.dataTransfer.getData('text/plain');
      const bubble = band.querySelector('.risk-bubble[data-risk="' + id + '"]');
      if (!bubble) return;
      const prev = bubble.closest('.risk-cell');
      cell.appendChild(bubble);
      // The label follows the risk: the cell it left regains its zone name, the
      // cell it landed in now reads the risk (the opaque bubble hides the dup).
      if (prev && prev !== cell) prev.dataset.zoneLabel = zoneLabel[prev.dataset.zone];
      cell.dataset.zoneLabel = bubble.textContent;
      updateStatus();
      const high = zone === 'high';
      narrativeEl.textContent = high
        ? 'High Risk! You need a mitigation plan immediately. Who is responsible for this?'
        : 'Risk accepted. Keep an eye on it.';
      narrativeEl.classList.toggle('warning', high);
    });
    matrix.appendChild(cell);
  });

  risks.forEach((risk) => {
    const bubble = document.createElement('div');
    bubble.className = 'risk-bubble';
    bubble.dataset.risk = risk.id;
    bubble.textContent = risk.name;
    bubble.draggable = true;
    bubble.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/plain', risk.id);
      event.dataTransfer.effectAllowed = 'move';
      bubble.classList.add('is-dragging');
    });
    bubble.addEventListener('dragend', () => bubble.classList.remove('is-dragging'));
    pool.appendChild(bubble);
  });
}

initRiskMap();

/* ---- chapter 11: Tuckman team stages ----
   Five dots are the smallest group that can show a pattern. Each stage owns a
   different force: slow drift, head-on collisions, a shared orbit, then one
   locked rotation. Positions stay normalised so a resize never teleports the
   team, while radii and collisions are measured in pixels. */
function initTeamSim() {
  const band = document.getElementById('teamBand');
  const canvas = document.getElementById('teamCanvas');
  const narrative = document.getElementById('teamNarrative');
  const buttons = [...document.querySelectorAll('.team-controls .btn-nav[data-stage]')];
  if (!band || !canvas || !canvas.getContext || !buttons.length) return;

  const ctx = canvas.getContext('2d');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const COUNT = 5;
  const STEP = Math.PI * 2 / COUNT;
  const NARRATIVE = {
    forming: 'Individuals are polite, excited, and uncertain. They rely on the leader for direction.',
    storming: 'Personalities clash as ideas and roles compete. Conflict is normal — the team is testing its boundaries.',
    norming: 'The group finds its rhythm: roles settle, trust grows, and everyone agrees on how to work together.',
    performing: 'The team moves as one unit. Energy is synchronized and aimed at the work, not at each other.'
  };

  let stage = 'forming';
  let width = 0, height = 0, raf = null, last = 0, visible = false;
  let galaxy = 0;
  let accent = '#4c1d95';

  const seed = [[0.22, 0.32], [0.78, 0.26], [0.5, 0.72], [0.28, 0.7], [0.74, 0.66]];
  const particles = seed.map(() => ({
    x: 0, y: 0, vx: 0, vy: 0,
    angle: 0,
    wobble: Math.random() * Math.PI * 2
  }));
  particles.forEach((p, i) => { p.x = seed[i][0]; p.y = seed[i][1]; });

  const dot = () => Math.max(3.5, Math.min(width, height) * 0.015);

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.offsetWidth;
    height = canvas.offsetHeight;
    // A hidden tab measures nothing; the observer starts the scene on entry.
    if (!width || !height) return false;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  function readAccent() {
    accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || accent;
  }

  function enterStage() {
    if (stage === 'forming') {
      particles.forEach((p) => {
        const a = Math.random() * Math.PI * 2;
        const speed = 0.018 + Math.random() * 0.018;
        p.vx = Math.cos(a) * speed;
        p.vy = Math.sin(a) * speed;
        p.wobble = Math.random() * Math.PI * 2;
      });
    } else if (stage === 'storming') {
      particles.forEach((p) => {
        const dx = 0.5 - p.x, dy = 0.5 - p.y;
        const d = Math.hypot(dx, dy) || 1;
        const bend = (Math.random() - 0.5) * 0.7;
        const nx = dx / d, ny = dy / d;
        const speed = 0.42 + Math.random() * 0.14;
        p.vx = (nx * Math.cos(bend) - ny * Math.sin(bend)) * speed;
        p.vy = (nx * Math.sin(bend) + ny * Math.cos(bend)) * speed;
      });
    } else {
      // Keep the group's current heading, then fan the dots into even slots so
      // no two lanes bunch up; the radii stay index-based and different.
      const ranked = particles.map((p) => {
        p.angle = Math.atan2((p.y - 0.5) * height, (p.x - 0.5) * width);
        return p;
      }).sort((a, b) => a.angle - b.angle);

      galaxy = Math.atan2(
        ranked.reduce((sum, p) => sum + Math.sin(p.angle), 0),
        ranked.reduce((sum, p) => sum + Math.cos(p.angle), 0)
      );
      ranked.forEach((p, i) => { p.angle = galaxy + i * STEP; });
    }
  }

  function drift(dt) {
    const marginX = 0.035, marginY = 0.06;
    const gap = Math.min(width, height) * 0.2;

    particles.forEach((p, i) => {
      p.wobble += dt * 0.9;
      p.vx += Math.cos(p.wobble + i) * 0.02 * dt;
      p.vy += Math.sin(p.wobble * 1.4 + i) * 0.02 * dt;

      const speed = Math.hypot(p.vx, p.vy);
      if (speed > 0.045) { p.vx *= 0.045 / speed; p.vy *= 0.045 / speed; }
      if (speed < 0.012) {
        const a = Math.random() * Math.PI * 2;
        p.vx = Math.cos(a) * 0.02;
        p.vy = Math.sin(a) * 0.02;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.x < marginX) { p.x = marginX; p.vx = Math.abs(p.vx); }
      if (p.x > 1 - marginX) { p.x = 1 - marginX; p.vx = -Math.abs(p.vx); }
      if (p.y < marginY) { p.y = marginY; p.vy = Math.abs(p.vy); }
      if (p.y > 1 - marginY) { p.y = 1 - marginY; p.vy = -Math.abs(p.vy); }
    });

    // A group that drifts into one corner stops reading as individuals.
    for (let i = 0; i < COUNT; i++) {
      for (let j = i + 1; j < COUNT; j++) {
        const a = particles[i], b = particles[j];
        const dx = (a.x - b.x) * width;
        const dy = (a.y - b.y) * height;
        const d = Math.hypot(dx, dy);
        if (d > 0 && d < gap) {
          const push = (gap - d) * 0.5;
          a.x += (dx / d) * push / width;
          a.y += (dy / d) * push / height;
          b.x -= (dx / d) * push / width;
          b.y -= (dy / d) * push / height;
        }
      }
    }
  }

  function storm(dt) {
    const minDim = Math.min(width, height);
    const touch = dot() * 2.8;
    const marginX = 0.045, marginY = 0.075;

    particles.forEach((p) => {
      // The centre pulls everyone in, so passes keep meeting head-on.
      const dx = 0.5 - p.x, dy = 0.5 - p.y;
      const d = Math.hypot(dx, dy) || 1;
      p.vx += (dx / d) * 1.1 * dt;
      p.vy += (dy / d) * 1.1 * dt;

      const speed = Math.hypot(p.vx, p.vy);
      const floor = minDim * 0.0009, ceiling = minDim * 0.002;
      if (speed > ceiling) { p.vx *= ceiling / speed; p.vy *= ceiling / speed; }
      else if (speed < floor) {
        // A dead stop would divide by zero; send it back into the room instead.
        const a = Math.random() * Math.PI * 2;
        p.vx = Math.cos(a) * floor;
        p.vy = Math.sin(a) * floor;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.x < marginX) { p.x = marginX; p.vx = Math.abs(p.vx) * 0.95; }
      if (p.x > 1 - marginX) { p.x = 1 - marginX; p.vx = -Math.abs(p.vx) * 0.95; }
      if (p.y < marginY) { p.y = marginY; p.vy = Math.abs(p.vy) * 0.95; }
      if (p.y > 1 - marginY) { p.y = 1 - marginY; p.vy = -Math.abs(p.vy) * 0.95; }
    });

    for (let i = 0; i < COUNT; i++) {
      for (let j = i + 1; j < COUNT; j++) {
        const a = particles[i], b = particles[j];
        let dx = (a.x - b.x) * width;
        let dy = (a.y - b.y) * height;
        let dist = Math.hypot(dx, dy);
        if (dist <= 0 || dist >= touch) continue;

        const nx = dx / dist, ny = dy / dist;
        // Relative velocity along the contact normal; only a closing pair bounces.
        const along = (a.vx - b.vx) * nx * width + (a.vy - b.vy) * ny * height;
        const kick = -(1 + 0.9) * along / 2;
        a.vx += (kick * nx) / width;
        a.vy += (kick * ny) / height;
        b.vx -= (kick * nx) / width;
        b.vy -= (kick * ny) / height;

        const overlap = (touch - dist) / 2;
        a.x += (nx * overlap) / width;
        a.y += (ny * overlap) / height;
        b.x -= (nx * overlap) / width;
        b.y -= (ny * overlap) / height;

        a.vx += (Math.random() - 0.5) * 0.06;
        a.vy += (Math.random() - 0.5) * 0.06;
        b.vx += (Math.random() - 0.5) * 0.06;
        b.vy += (Math.random() - 0.5) * 0.06;
      }
    }
  }

  function orbit(dt) {
    const minDim = Math.min(width, height);
    const follow = 1 - Math.exp(-5 * dt);
    if (stage === 'performing') galaxy += dt * 0.9;

    particles.forEach((p, i) => {
      if (stage === 'norming') p.angle += 0.7 * dt;
      const angle = stage === 'performing' ? galaxy + i * STEP : p.angle;
      const radius = minDim * (stage === 'performing' ? 0.2 : 0.16 + i * 0.015);
      const tx = 0.5 + (Math.cos(angle) * radius) / width;
      const ty = 0.5 + (Math.sin(angle) * radius) / height;
      p.x += (tx - p.x) * follow;
      p.y += (ty - p.y) * follow;
    });
  }

  // Reduced motion still shows where the stage stands, just without the loop.
  function settle() {
    if (stage !== 'norming' && stage !== 'performing') return;
    const minDim = Math.min(width, height);
    particles.forEach((p, i) => {
      const angle = stage === 'performing' ? galaxy + i * STEP : p.angle;
      const radius = minDim * (stage === 'performing' ? 0.2 : 0.16 + i * 0.015);
      p.x = 0.5 + (Math.cos(angle) * radius) / width;
      p.y = 0.5 + (Math.sin(angle) * radius) / height;
    });
  }

  function paint() {
    if (!width || !height) return;
    ctx.clearRect(0, 0, width, height);
    const r = dot();
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 16;
    ctx.fillStyle = accent;
    particles.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x * width, p.y * height, r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!width || canvas.offsetWidth !== width || canvas.offsetHeight !== height) {
      if (!resize()) return;
      readAccent();
    }
    if (!last) last = now;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    if (stage === 'forming') drift(dt);
    else if (stage === 'storming') storm(dt);
    else orbit(dt);

    paint();
  }

  function start() {
    if (reduced.matches || raf !== null) return;
    if (!resize()) return;
    readAccent();
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (raf === null) return;
    cancelAnimationFrame(raf);
    raf = null;
    last = 0;
  }

  function setStage(next) {
    if (!NARRATIVE[next]) return;
    stage = next;
    enterStage();

    buttons.forEach((btn) => {
      const on = btn.dataset.stage === stage;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
    narrative.textContent = NARRATIVE[stage];
    canvas.dataset.stage = stage;
    canvas.setAttribute('aria-label', 'Five team members shown as dots in the ' + stage + ' stage.');

    readAccent();
    if (reduced.matches) {
      if (resize()) { settle(); paint(); }
    } else {
      start();
      paint();
    }
  }

  buttons.forEach((btn) => {
    const on = btn.dataset.stage === stage;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.addEventListener('click', () => setStage(btn.dataset.stage));
  });
  canvas.dataset.stage = stage;

  new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      visible = entry.isIntersecting;
      if (visible) start(); else stop();
    });
  }, { threshold: 0.05 }).observe(band);

  window.addEventListener('resize', () => {
    if (raf === null && resize()) paint();
  });

  reduced.addEventListener('change', () => {
    if (reduced.matches) {
      stop();
      if (resize()) { settle(); paint(); }
    } else if (visible) {
      start();
    }
  });

  new MutationObserver(() => {
    readAccent();
    if (raf === null && resize()) paint();
  }).observe(document.documentElement, { attributeFilter: ['data-theme'] });

  readAccent();
  resize();
  enterStage();
  paint();
}

initTeamSim();

/* ---- chapter 13: organizational structure ----
   Eight staff and four managers each hold two positions. Clicking a structure
   replays a one-second eased flight between them, while the reporting lines
   crossfade from department columns to the project team's dual links. */
function initOrgMorph() {
  const band = document.getElementById('orgBand');
  const canvas = document.getElementById('orgCanvas');
  const narrative = document.getElementById('orgNarrative');
  const buttons = [document.getElementById('btn-functional'), document.getElementById('btn-matrix')];
  if (!band || !canvas || !canvas.getContext || buttons.some((btn) => !btn)) return;

  const ctx = canvas.getContext('2d');
  /* Links are composited through a scratch canvas: four lines to one column
     share their upper trunk, and stacking translucent strokes there would
     turn it almost solid. Draw a class flat, then paste it once. */
  const edgeCanvas = document.createElement('canvas');
  const edgeCtx = edgeCanvas.getContext('2d');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const DURATION = 1000;

  const LAYOUTS = {
    functional: {
      ceo: [0.5, 0.12], eng: [0.27, 0.33], mkt: [0.73, 0.33], lead: [0.5, 0.33],
      e1: [0.27, 0.51], e2: [0.27, 0.62], e3: [0.27, 0.73], e4: [0.27, 0.84],
      m1: [0.73, 0.51], m2: [0.73, 0.62], m3: [0.73, 0.73], m4: [0.73, 0.84]
    },
    matrix: {
      ceo: [0.5, 0.12], eng: [0.15, 0.35], mkt: [0.85, 0.35], lead: [0.5, 0.32],
      e1: [0.32, 0.56], e2: [0.44, 0.56], e3: [0.56, 0.56], e4: [0.68, 0.56],
      m1: [0.32, 0.78], m2: [0.44, 0.78], m3: [0.56, 0.78], m4: [0.68, 0.78]
    }
  };
  const LABELS = { ceo: 'CEO', eng: 'ENG', mkt: 'MKT', lead: 'PM', e1: 'E1', e2: 'E2', e3: 'E3', e4: 'E4', m1: 'M1', m2: 'M2', m3: 'M3', m4: 'M4' };
  const MANAGERS = ['ceo', 'eng', 'mkt', 'lead'];
  const ENGINEERING = ['e1', 'e2', 'e3', 'e4'];
  const MARKETING = ['m1', 'm2', 'm3', 'm4'];
  const TEXT = {
    functional: 'Functional: Team members report to one department head. Slow response, but deep expertise.',
    matrix: 'Matrix: Team members report to both a project lead and their department head. Fast coordination, but two bosses.'
  };
  const ALT = {
    functional: 'Functional org chart: the CEO above engineering and marketing managers, each with four staff in vertical columns.',
    matrix: 'Matrix org chart: eight staff in a central project team, each linked to the project lead and their functional manager.'
  };

  const STYLES = {
    solid: { alpha: 0.5, dash: null },
    authority: { alpha: 0.22, dash: null },
    duty: { alpha: 0.35, dash: [4, 4] },
    project: { alpha: 0.55, dash: null }
  };

  const FUNCTIONAL_EDGES = [
    { a: 'ceo', b: 'eng', kind: 'solid' },
    { a: 'ceo', b: 'mkt', kind: 'solid' },
    { a: 'ceo', b: 'lead', kind: 'solid' },
    ...ENGINEERING.map((k) => ({ a: 'eng', b: k, kind: 'solid' })),
    ...MARKETING.map((k) => ({ a: 'mkt', b: k, kind: 'solid' }))
  ];
  const MATRIX_EDGES = [
    { a: 'ceo', b: 'lead', kind: 'authority' },
    { a: 'ceo', b: 'eng', kind: 'authority' },
    { a: 'ceo', b: 'mkt', kind: 'authority' },
    ...ENGINEERING.map((k) => ({ a: 'lead', b: k, kind: 'project' })),
    ...MARKETING.map((k) => ({ a: 'lead', b: k, kind: 'project' })),
    ...ENGINEERING.map((k) => ({ a: 'eng', b: k, kind: 'duty' })),
    ...MARKETING.map((k) => ({ a: 'mkt', b: k, kind: 'duty' }))
  ];

  const nodes = [...MANAGERS, ...ENGINEERING, ...MARKETING].map((key) => {
    const [x, y] = LAYOUTS.functional[key];
    return { key, label: LABELS[key], manager: MANAGERS.includes(key), x, y };
  });
  const byKey = new Map(nodes.map((n) => [n.key, n]));

  let layout = 'functional';
  let morph = null;
  let width = 0, height = 0, raf = null, visible = false;
  let accent = '#4c1d95';
  let contrast = '#ffffff';
  let fontFamily = 'sans-serif';

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.offsetWidth;
    height = canvas.offsetHeight;
    // A hidden tab measures nothing; the observer sizes it on entry.
    if (!width || !height) return false;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    edgeCanvas.width = canvas.width;
    edgeCanvas.height = canvas.height;
    edgeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  function readPalette() {
    const root = getComputedStyle(document.documentElement);
    accent = root.getPropertyValue('--accent').trim() || accent;
    contrast = root.getPropertyValue('--accent-contrast').trim() || contrast;
    fontFamily = getComputedStyle(document.body).fontFamily || fontFamily;
  }

  function drawEdges(edges, weight, scale) {
    if (weight <= 0) return;
    const kinds = [...new Set(edges.map((edge) => edge.kind))];
    kinds.forEach((kind) => {
      const style = STYLES[kind];
      edgeCtx.clearRect(0, 0, width, height);
      edgeCtx.strokeStyle = accent;
      edgeCtx.lineWidth = 1.2 * scale;
      edgeCtx.lineCap = 'round';
      edgeCtx.globalAlpha = 1;
      edgeCtx.setLineDash(style.dash ? style.dash.map((d) => d * scale) : []);
      edges.filter((edge) => edge.kind === kind).forEach((edge) => {
        const a = byKey.get(edge.a);
        const b = byKey.get(edge.b);
        edgeCtx.beginPath();
        edgeCtx.moveTo(a.x * width, a.y * height);
        edgeCtx.lineTo(b.x * width, b.y * height);
        edgeCtx.stroke();
      });
      ctx.globalAlpha = style.alpha * weight;
      ctx.drawImage(edgeCanvas, 0, 0, width, height);
    });
    ctx.globalAlpha = 1;
    edgeCtx.setLineDash([]);
  }

  function drawNode(node) {
    const minDim = Math.min(width, height);
    const radius = minDim * (node.manager ? 0.04 : 0.0275);
    const x = node.x * width, y = node.y * height;

    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();

    ctx.fillStyle = contrast;
    ctx.font = '700 ' + Math.max(8, Math.round(radius * (node.manager ? 0.78 : 0.9))) + 'px ' + fontFamily;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.label, x, y + 0.5);
  }

  // blend 0 = department columns, 1 = matrix: lines fade across with the nodes.
  function paint(blend) {
    if (!width || !height) return;
    const b = typeof blend === 'number' ? blend : (layout === 'matrix' ? 1 : 0);
    const scale = Math.max(0.9, Math.min(width, height) / 400);
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = 'round';
    drawEdges(FUNCTIONAL_EDGES, 1 - b, scale);
    drawEdges(MATRIX_EDGES, b, scale);
    nodes.forEach(drawNode);
  }

  function applyCurrent(instant) {
    const to = nodes.map((n) => {
      const [x, y] = LAYOUTS[layout][n.key];
      return { x, y };
    });
    if (instant || reduced.matches || !visible) {
      nodes.forEach((n, i) => { n.x = to[i].x; n.y = to[i].y; });
      morph = null;
      paint();
      return;
    }
    morph = {
      from: nodes.map((n) => ({ x: n.x, y: n.y })),
      to,
      start: performance.now()
    };
    startLoop();
  }

  function frame(now) {
    raf = null;
    if (!width || canvas.offsetWidth !== width || canvas.offsetHeight !== height) {
      if (!resize()) return;
      readPalette();
    }
    if (!morph) { paint(); return; }

    const t = Math.min((now - morph.start) / DURATION, 1);
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    nodes.forEach((n, i) => {
      const from = morph.from[i], to = morph.to[i];
      n.x = from.x + (to.x - from.x) * eased;
      n.y = from.y + (to.y - from.y) * eased;
    });
    // The blend always runs toward the target, whichever way the morph goes.
    paint(layout === 'matrix' ? eased : 1 - eased);

    if (t < 1) raf = requestAnimationFrame(frame);
    else morph = null;
  }

  function startLoop() {
    if (raf !== null) return;
    if (!resize()) return;
    readPalette();
    raf = requestAnimationFrame(frame);
  }

  function setLayout(next) {
    if (!LAYOUTS[next]) return;
    layout = next;
    buttons.forEach((btn) => {
      const on = (btn === buttons[0] && next === 'functional') || (btn === buttons[1] && next === 'matrix');
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
    narrative.textContent = TEXT[next];
    canvas.dataset.layout = next;
    canvas.setAttribute('aria-label', ALT[next]);
    readPalette();
    applyCurrent(false);
  }

  buttons.forEach((btn, i) => btn.addEventListener('click', () => setLayout(i === 0 ? 'functional' : 'matrix')));
  buttons.forEach((btn, i) => {
    const on = i === 0;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
  });
  canvas.dataset.layout = layout;

  new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      visible = entry.isIntersecting;
      if (!visible) {
        if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
        if (morph) {
          // Nobody is watching: land on the target instead of resuming mid-air.
          nodes.forEach((n, i) => { n.x = morph.to[i].x; n.y = morph.to[i].y; });
          morph = null;
        }
        return;
      }
      if (!resize()) return;
      readPalette();
      paint();
    });
  }, { threshold: 0.05 }).observe(band);

  window.addEventListener('resize', () => {
    if (raf === null && resize()) { readPalette(); paint(); }
  });

  reduced.addEventListener('change', () => {
    if (reduced.matches && raf !== null) {
      cancelAnimationFrame(raf);
      raf = null;
      if (morph) {
        nodes.forEach((n, i) => { n.x = morph.to[i].x; n.y = morph.to[i].y; });
        morph = null;
      }
      paint();
    }
  });

  new MutationObserver(() => {
    readPalette();
    if (raf === null && resize()) paint();
  }).observe(document.documentElement, { attributeFilter: ['data-theme'] });

  readPalette();
  resize();
  paint();
}

initOrgMorph();

/* ---- course map: out of the way while an introduction is on screen ----
   The rail is a chapter index, so it waits for the notes. The hero and every
   cinematic band hold it back; on a plain sheet neither element is rendered,
   so the observer reports them off-screen and the map appears. */
function initSidebarRetract() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  const zones = [...document.querySelectorAll('.hero-section, .cinematic-band')];
  if (!zones.length) return;

  const onScreen = new Set();
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) onScreen.add(entry.target);
      else onScreen.delete(entry.target);
    });
    sidebar.classList.toggle('is-retracted', onScreen.size > 0);
  }, {
    // The last 100px of the viewport does not count as "looking at" the intro.
    rootMargin: '0px 0px -100px 0px',
    threshold: 0.1
  });

  zones.forEach((zone) => observer.observe(zone));
}

initSidebarRetract();

/* ---- chapter 07: the EVM heartbeat ----
   The calculator owns the numbers; this card only draws them. The three traces
   share one scale, so the gap between planned, actual and earned reads at a
   glance. A pair of gaussian beats gives each line its monitor cadence, and the
   final point is always the live total. */
let evmChart = null;

function initEVMChart() {
  const canvas = document.getElementById('evmChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const values = { cbc: 0, cac: 0, ev: 0 };
  let w = 0;
  let h = 0;
  let dpr = 1;
  let frame = null;
  let onScreen = false;
  let palette = readPalette();

  function readPalette() {
    const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return {
      grid: token('--border'),
      cbc: token('--accent'),
      cac: token('--status-negative'),
      cev: token('--status-positive')
    };
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const nextW = Math.round(rect.width);
    const nextH = Math.round(rect.height);
    if (!nextW || !nextH) return false;
    const nextDpr = Math.min(2, window.devicePixelRatio || 1);
    if (nextW === w && nextH === h && nextDpr === dpr) return true;
    w = nextW;
    h = nextH;
    dpr = nextDpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    return true;
  }

  function draw(time) {
    if (!w || !h) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const max = Math.max(values.cbc, values.cac, values.ev, 1);
    const padX = 18;
    const padTop = 18;
    const padBottom = 20;
    const plotW = w - padX * 2;
    const plotH = h - padTop - padBottom;
    const baseY = padTop + plotH;

    ctx.save();
    ctx.strokeStyle = palette.grid;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = Math.round(padTop + (plotH / 4) * i) + 0.5;
      ctx.beginPath();
      ctx.moveTo(padX, y);
      ctx.lineTo(w - padX, y);
      ctx.stroke();
    }
    for (let i = 0; i <= 8; i++) {
      const x = Math.round(padX + (plotW / 8) * i) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, baseY);
      ctx.stroke();
    }
    ctx.restore();

    const yFor = (value) => baseY - (Math.max(0, value) / max) * plotH * 0.9;

    function trace(to) {
      const n = 120;
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const beat = (centre, width) => Math.exp(-Math.pow((t - centre) / width, 2));
        let v = to * Math.pow(t, 1.8) * 0.9;
        v += to * 0.16 * beat(0.34, 0.022);
        v -= to * 0.08 * beat(0.4, 0.02);
        v += to * 0.12 * beat(0.68, 0.02);
        v -= to * 0.06 * beat(0.75, 0.018);
        v += to * 0.004 * Math.sin(t * 80);
        pts.push([padX + plotW * t, yFor(v)]);
      }
      pts[n] = [padX + plotW, yFor(to)];
      return pts;
    }

    /* Midpoint smoothing keeps the beats pointed while the flat stretches
       never show a corner. */
    function line(pts, colour, dash, blur) {
      ctx.save();
      ctx.strokeStyle = colour;
      ctx.shadowColor = colour;
      ctx.shadowBlur = blur;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2;
        const my = (pts[i][1] + pts[i + 1][1]) / 2;
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last[0], last[1]);
      ctx.stroke();
      ctx.restore();
      return last;
    }

    const traces = [
      { pts: trace(values.cbc), colour: palette.cbc, dash: [6, 7] },
      { pts: trace(values.cac), colour: palette.cac, dash: null },
      { pts: trace(values.ev), colour: palette.cev, dash: null }
    ];

    /* Glow first, cores last: a later line's shadow would otherwise tint the
       core of the line it almost touches. */
    traces.forEach((t) => line(t.pts, t.colour, t.dash, 12));
    let tip = null;
    traces.forEach((t) => { tip = line(t.pts, t.colour, t.dash, 0); });

    const pulse = 3.4 + 1.3 * Math.sin(time / 300);
    ctx.save();
    ctx.fillStyle = palette.cev;
    ctx.shadowColor = palette.cev;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(tip[0], tip[1], pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function tick(time) {
    frame = null;
    if (!onScreen || !resize()) return;
    draw(time);
    if (!reduceMotion.matches) frame = requestAnimationFrame(tick);
  }

  function kick() {
    if (frame !== null || !onScreen) return;
    frame = requestAnimationFrame(tick);
  }

  new IntersectionObserver((entries) => {
    onScreen = entries.some((entry) => entry.isIntersecting);
    if (onScreen) kick();
    else if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
  }, { threshold: 0.05 }).observe(canvas);

  new MutationObserver(() => {
    palette = readPalette();
    kick();
  }).observe(document.documentElement, { attributeFilter: ['data-theme'] });

  window.addEventListener('resize', () => {
    if (onScreen) kick();
  });

  evmChart = {
    set(cbc, cac, ev) {
      values.cbc = Number(cbc) || 0;
      values.cac = Number(cac) || 0;
      values.ev = Number(ev) || 0;
      kick();
    }
  };
}

function updateEVMChart(cbc, cac, ev) {
  if (evmChart) evmChart.set(cbc, cac, ev);
}

/* ---- student quiz widget ----
   A .quiz-widget carries its own data as JSON in data-quiz; this turns each one
   into a question, its options and a feedback line. Idempotent, so Teacher Mode
   can re-run it on every preview render without doubling the markup. Options
   are set with textContent, so a lesson never injects HTML through an answer. */
function initQuizzes(root) {
  const scope = root || document;
  scope.querySelectorAll('.quiz-widget').forEach((widget) => {
    if (widget.dataset.quizReady === '1') return;
    let data;
    try {
      data = JSON.parse(widget.getAttribute('data-quiz') || '{}');
    } catch (err) {
      return;
    }
    if (!data || !Array.isArray(data.options)) return;
    widget.dataset.quizReady = '1';

    const heading = document.createElement('h3');
    heading.textContent = data.question || '';
    widget.appendChild(heading);

    const feedback = document.createElement('div');
    feedback.className = 'quiz-feedback';

    const buttons = [];
    data.options.forEach((optionText, index) => {
      const letter = String.fromCharCode(65 + index);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'quiz-option';
      button.dataset.letter = letter;
      button.textContent = letter + '. ' + optionText;
      button.addEventListener('click', () => {
        if (letter === String(data.correct)) {
          button.classList.add('correct');
          feedback.textContent = 'Correct!';
          feedback.className = 'quiz-feedback correct';
        } else {
          button.classList.add('incorrect');
          buttons.forEach((b) => {
            if (b.dataset.letter === String(data.correct)) b.classList.add('correct');
          });
          feedback.textContent = 'Incorrect.';
          feedback.className = 'quiz-feedback incorrect';
        }
        buttons.forEach((b) => { b.disabled = true; });
      });
      buttons.push(button);
      widget.appendChild(button);
    });

    widget.appendChild(feedback);
  });
}

/* ---- teacher mode: the professor composes cards, nobody edits code ----
   ?admin=true only decides what this page shows. The left column composes, the
   right column previews the exact card and its HTML; it cannot write to the
   site and holds no secret. Titles and prose are escaped because the copied
   HTML is pasted back into index.html — a bare "<" would otherwise open a tag
   that never closes. A card is a title, an optional definition and optional
   bullet points; the type only decides whether it spans the whole board. */
function initTeacherMode() {
  const panel = document.getElementById('teacherMode');
  if (!panel) return;
  if (new URLSearchParams(window.location.search).get('admin') !== 'true') return;

  document.body.classList.add('teacher-on');
  panel.hidden = false;

  const titleInput = document.getElementById('tm-title');
  const defInput = document.getElementById('tm-def');
  const listInput = document.getElementById('tm-list');
  const typeInput = document.getElementById('tm-type');
  const previewContainer = document.getElementById('tm-preview-container');
  const codeOutput = document.getElementById('tm-code-output');
  const copyBtn = document.getElementById('tm-copy');
  const copyStatus = document.getElementById('tm-copy-status');

  if (!titleInput || !previewContainer) return;

  // Returning to the student view is a plain navigation: drop the admin flag
  // and reload, so the teacher-on body class and hidden panel are not reapplied.
  const backBtn = document.getElementById('tm-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      const url = new URL(window.location.href);
      url.searchParams.delete('admin');
      window.location.href = url.toString();
    });
  }

  const esc = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');

  function generateHTML() {
    const title = esc(titleInput.value.trim() || 'Card Title');
    const def = defInput.value.trim();
    const list = listInput.value.trim();
    const isExhibit = typeInput.value === 'exhibit';

    let html = '<section class="note-block' + (isExhibit ? ' exhibit' : '') + '">\n';
    html += '  <h2>' + title + '</h2>\n';
    if (def) html += '  <p class="definition">' + esc(def) + '</p>\n';
    if (list) {
      html += '  <ul class="attr-list">\n';
      list.split('\n').filter((line) => line.trim() !== '').forEach((item) => {
        html += '    <li>' + esc(item.trim()) + '</li>\n';
      });
      html += '  </ul>\n';
    }
    html += '</section>';

    codeOutput.value = html;
    previewContainer.innerHTML = html;

    // A card born here was never handed to the scroll observer, so clear it by
    // hand. The copied string stays canonical (no is-visible), matching the
    // source in index.html.
    const previewCard = previewContainer.querySelector('.note-block');
    if (previewCard) previewCard.classList.add('is-visible');
  }

  [titleInput, defInput, listInput, typeInput].forEach((el) => {
    el.addEventListener('input', generateHTML);
  });

  let statusTimer = null;
  copyBtn.addEventListener('click', () => {
    // execCommand still works for a user-initiated copy, but some environments
    // (notably headless) refuse it; fall back to the async Clipboard API when
    // the page is a secure context, so the teacher always gets the HTML.
    codeOutput.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (err) { copied = false; }
    if (!copied && navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(codeOutput.value).catch(() => {});
    }
    copyStatus.classList.add('show');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => copyStatus.classList.remove('show'), 2000);
  });

  generateHTML();
}

initEVMChart();
initTeacherMode();
initGlobalStars();
initQuizzes();
