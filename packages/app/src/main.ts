import './style.css';
import { angleBetweenDeg, enuToAzEl, type TleGroup } from '@skytrace/shared';
import { AircraftFeed } from './aircraft/feed';
import { addTap, loadCalibration, resetCalibration, type CalState } from './calib/calibrate';
import { CameraModel, DEFAULT_LONG_FOV_DEG } from './camera/projection';
import { startCamera } from './camera/video';
import { EvalLog } from './eval/logger';
import { easeOut, progress } from './math/motion';
import { BodyEphemeris } from './sats/bodies';
import { Satellites } from './sats/satellites';
import { Location } from './sensors/location';
import { declinationDeg } from './sensors/declination';
import { Orientation, screenAngle } from './sensors/orientation';
import { computeStarSky, type StarSky } from './stars/constellations';
import type { SkyObject, SkyReference } from './types';
import { hasBodyModel } from './ui/body-model-renderer';
import { ConstellationArt } from './ui/constellation-art';
import { objectCategory } from './ui/markers';
import { Overlay, type Placed } from './ui/overlay';
import { BODY_FOCUS_ZOOM, CLOSEUP_START_ZOOM } from './ui/sky-body-closeup';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const video = $<HTMLVideoElement>('video');
const canvas = $<HTMLCanvasElement>('overlay');
const hudHeading = $('heading');
const hudElevation = $('elevation');
const hudStatus = $('status');
const skyStatus = $<HTMLDetailsElement>('sky-status');
const toastEl = $('toast');
const details = $('details');
const constellationToggle = $<HTMLInputElement>('layer-constellations');
const constellationArtToggle = $<HTMLInputElement>('layer-constellation-art');
const zoomIn = $<HTMLButtonElement>('zoom-in'), zoomOut = $<HTMLButtonElement>('zoom-out'), zoomReset = $<HTMLButtonElement>('zoom-reset');
const closeupCaption = $('closeup-caption');
const referencePickers = { calibrate: $<HTMLSelectElement>('calib-reference'), eval: $<HTMLSelectElement>('eval-reference') };

type Mode = 'view' | 'calibrate' | 'eval' | 'layers';

const orientation = new Orientation();
const loc = new Location();
const cam = new CameraModel();
const overlay = new Overlay(canvas);
const constellationArt = new ConstellationArt($('constellation-art'), $('constellation-art-outgoing'));
const sats = new Satellites();
const aircraft = new AircraftFeed();
const evalLog = new EvalLog();

let calib: CalState = loadCalibration();
let mode: Mode = 'view';
let showBodies = true;

/**
 * "Show all": ignore the light level. Satellites in daylight or Earth's shadow and
 * planets in a bright sky are normally drawn small and faint; this draws them
 * like visible ones (full-size filled marker, bright colour, label priority).
 */
const SHOW_ALL_KEY = 'skytrace:showAll';
const CONSTELLATIONS_KEY = 'skytrace:constellations';
const CONSTELLATION_ART_OFF_KEY = 'skytrace:constellationArtOff';
let showAll = readFlag(SHOW_ALL_KEY);
constellationToggle.checked = readFlag(CONSTELLATIONS_KEY);
constellationArtToggle.checked = !readFlag(CONSTELLATION_ART_OFF_KEY);
constellationArtToggle.disabled = !constellationToggle.checked;
let satsVisibleByEye = 0;

function showAtFullStrength(o: SkyObject): SkyObject {
  if (o.visible) return o;
  // Same boost a satellite gets when it is really visible (see Satellites.objects).
  return { ...o, visible: true, priority: o.kind === 'sat' ? o.priority + 20 : o.priority };
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    /* storage unavailable: setting lasts for this visit only */
  }
}
const MAX_ZOOM = 32;
let zoom = 1;
let zoomTarget = 1;
let focusId: string | null = null;
let closeupId: string | null = null;
let zoomChange: { from: number; start: number; duration: number } | null = null;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const ephemeris = new BodyEphemeris();
let stars: StarSky | null = null;
let starsAt = -Infinity;
let objects: SkyObject[] = [];
let placed: Placed[] = [];
let lastHud = 0;
let frames = 0;
let fps = 0;
let fpsAt = performance.now();

// ---------- start ----------

if (!window.isSecureContext) {
  $('start-hint').textContent =
    'Not on HTTPS: camera and motion sensors will be blocked. Use the https:// address (npm run tunnel).';
}

$('btn-start').addEventListener('click', async (event) => {
  // Order matters on iOS: permission requests must start inside the tap handler.
  const orientationReady = orientation.start();
  const cameraReady = startCamera(video);
  loc.start();
  $('start').hidden = true;
  $('hud').inert = false;
  $('toolbar').inert = false;
  $('zoom-controls').inert = false;
  if(event.detail === 0) $('btn-layers').focus();

  loc.onChange((p) => {
    sats.setObserver(p);
    aircraft.setObserver(p);
    orientation.setDeclination(declinationDeg(p.lat, p.lon));
    ephemeris.reset();
    overlay.resetTrackMotion();
    starsAt = -Infinity;
  });
  sats.reload();

  const [omode, camOk] = await Promise.all([orientationReady, cameraReady]);
  $('view-source').textContent = camOk ? 'Camera' : 'Preview';
  if (omode === 'simulated') {
    toast(camOk ? 'No motion sensors: drag to look around.' : 'Desktop mode: drag to look around, scroll to zoom.', 5000);
  } else if (omode === 'relative') {
    toast('No compass found: calibrate on the Moon or a plane.', 5000);
  } else {
    toast('Hold the phone still for a second to find north. For best accuracy, Calibrate on the Moon or a plane.', 6000);
  }
});

orientation.attachSimControls(canvas, () => 180 / (Math.PI * cam.F));

function applyZoom(value: number) {
  if(value === 1) focusId = null;
  if(zoom === value) return;
  zoom = value;
  const display = `${Number(zoom.toFixed(1))}×`;
  if(zoomReset.textContent !== display) {
    zoomReset.textContent = display;
    zoomReset.setAttribute('aria-label', `Reset zoom, currently ${display}`);
  }
}

function setZoom(magnification: number, duration = 0) {
  const next = Math.max(1, Math.min(MAX_ZOOM, magnification));
  if(duration && !reducedMotion.matches && next === zoomTarget && zoomChange) return;
  zoomTarget = next;
  zoomOut.disabled = next === 1;
  zoomIn.disabled = next === MAX_ZOOM;
  if(next > 1) orientation.simTouched = true;
  zoomChange = duration && !reducedMotion.matches && next !== zoom ? { from: zoom, start: performance.now(), duration } : null;
  if(!zoomChange) applyZoom(next);
}

function advanceZoom(now: number) {
  if(!zoomChange) return;
  const { from, start, duration } = zoomChange;
  const t = reducedMotion.matches ? 1 : progress(now, start, duration);
  if(t === 0) return;
  applyZoom(t === 1 ? zoomTarget : from * (zoomTarget / from) ** easeOut(t));
  if(t === 1) zoomChange = null;
}

function zoomToBody(o: SkyObject) {
  if(orientation.mode === 'simulated' && !video.videoWidth) orientation.lookAt(o.azDeg - calib.yawDeg, o.elDeg);
  focusId = o.id;
  setZoom(BODY_FOCUS_ZOOM, 460);
}

zoomIn.addEventListener('click', () => setZoom(zoomTarget * Math.SQRT2, 205));
zoomOut.addEventListener('click', () => setZoom(zoomTarget / Math.SQRT2, 205));
zoomReset.addEventListener('click', () => setZoom(1, 250));
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 80 : 1);
  setZoom(zoomTarget * Math.exp(-Math.max(-150, Math.min(150, delta)) * .003), 145);
}, { passive: false });

let pinch: { span: number; zoom: number } | null = null;
function fingerSpan(touches: TouchList): number {
  const a = touches[0]!, b = touches[1]!;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

canvas.addEventListener('touchstart', (e) => {
  if(e.touches.length === 2) {
    setZoom(zoom);
    pinch = { span: Math.max(1, fingerSpan(e.touches)), zoom };
  }
}, { passive: true });
canvas.addEventListener('touchmove', (e) => {
  if(!pinch || e.touches.length !== 2) return;
  e.preventDefault();
  setZoom(pinch.zoom * fingerSpan(e.touches) / pinch.span);
}, { passive: false });
canvas.addEventListener('touchend', () => { pinch = null; }, { passive: true });
canvas.addEventListener('touchcancel', () => { pinch = null; }, { passive: true });

// ---------- frame loop ----------

function resize() {
  overlay.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

function frame(t: number) {
  advanceZoom(t);
  const now = Date.now();
  const bodies = ephemeris.sample(loc.current, now);
  sats.sunElDeg = bodies.sunElDeg;

  const visibleBodies = showBodies ? bodies.objects.filter((o) => o.elDeg > -1) : [];
  const optics = {
    deviceToWorld: orientation.rotation(t, zoom, reducedMotion.matches),
    screenAngleDeg: screenAngle(),
    yawOffsetDeg: calib.yawDeg,
    fovScale: orientation.mode === 'simulated' ? 1 : calib.fovScale,
    screenW: window.innerWidth,
    screenH: window.innerHeight,
    videoW: video.videoWidth,
    videoH: video.videoHeight,
    longFovDeg: DEFAULT_LONG_FOV_DEG,
    zoom,
  };
  cam.update(optics);
  if(focusId) {
    const target = visibleBodies.find((o) => o.id === focusId);
    if(!target || !cam.focusOn(target.dir)) {
      setZoom(1);
      cam.update({ ...optics, zoom });
      toast('Target left the camera view. Aim at it and zoom again.');
    }
  }
  const crop = zoom === 1 ? '' : `translate(${cam.centerX - cam.W / 2}px, ${cam.centerY - cam.H / 2}px) scale(${zoom})`;
  if(video.style.transform !== crop) video.style.transform = crop;

  objects = [...visibleBodies, ...sats.objects(now), ...aircraft.objects(now)];
  // Counted before "Show all" so the status line keeps reporting what the eye can see.
  satsVisibleByEye = objects.filter((o) => o.kind === 'sat' && o.visible).length;
  if (showAll) objects = objects.map(showAtFullStrength);
  const drawStars = constellationToggle.checked && (showAll || bodies.sunElDeg < -6);
  if(drawStars && (!stars || now - starsAt >= 1000 || now < starsAt)) {
    stars = computeStarSky(loc.current, now, constellationArtToggle.checked);
    starsAt = now;
    updateReferencePickers(stars.references);
  } else if(!drawStars && stars) {
    stars = null;
    updateReferencePickers([]);
  }
  autoAim();
  const measuring = mode === 'calibrate' || mode === 'eval' ? mode : null;
  constellationArt.draw(cam, measuring || zoom >= CLOSEUP_START_ZOOM ? undefined : stars?.art, t);
  placed = overlay.draw(cam, objects, stars, measuring ? selectedStar(measuring) : undefined, !measuring, t);
  const closeup = overlay.closeup;
  if((closeup?.id ?? null) !== closeupId) {
    closeupId = closeup?.id ?? null;
    closeupCaption.hidden = !closeup;
    if(closeup) {
      $('closeup-name').textContent = closeup.label;
      $('closeup-note').textContent = closeup.symbol === 'sun' ? 'Rendered close-up · Avoid direct viewing' : 'Rendered close-up';
    }
  }

  frames++;
  if (t - fpsAt > 1000) {
    fps = (frames * 1000) / (t - fpsAt);
    frames = 0;
    fpsAt = t;
  }
  if (t - lastHud > 250) {
    updateHud(now);
    lastHud = t;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/**
 * Desktop only: once planes arrive, turn the view toward the busiest part of
 * the sky (until the user drags). Without this the default view can easily
 * contain no planes, since distant aircraft sit only a few degrees up.
 */
let autoAimed = false;
function autoAim() {
  if (autoAimed || orientation.mode !== 'simulated' || orientation.simTouched) return;
  const planes = objects.filter((o) => o.kind === 'aircraft' && o.elDeg > 1);
  if (planes.length === 0) return;
  autoAimed = true;
  const bins = new Array<number>(12).fill(0);
  for (const p of planes) bins[Math.floor(p.azDeg / 30) % 12]! += 1;
  const best = bins.indexOf(Math.max(...bins));
  const inBin = planes.filter((p) => Math.floor(p.azDeg / 30) % 12 === best).map((p) => p.elDeg).sort((a, b) => a - b);
  const el = inBin[Math.floor(inBin.length / 2)] ?? 8;
  orientation.lookAt(best * 30 + 15, Math.max(4, Math.min(30, el)));
}

function inView(o: SkyObject): boolean {
  const p = cam.project(o.dir);
  return p.front && p.x >= 0 && p.x <= cam.W && p.y >= 0 && p.y <= cam.H;
}

function updateHud(now: number) {
  const center = enuToAzEl(cam.unproject(cam.W / 2, cam.H / 2));
  hudHeading.textContent = `${compass(center.azDeg)} ${Math.round(center.azDeg) % 360}°`;
  hudElevation.textContent = `${Math.round(center.elDeg)}° el`;

  if(orientation.compassPoor && !poorCompassToastShown) {
    poorCompassToastShown = true;
    toast('Compass is inaccurate: wave the phone in a figure-8, away from metal.', 6000);
  }

  if(!skyStatus.open && !DEBUG) return;

  const nowSec = now / 1000;
  const acAge = aircraft.dataAgeSec(nowSec);
  const satObjs = objects.filter((o) => o.kind === 'sat');
  const lines = [
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA ? 'Live camera' : 'Sky preview',
    `${loc.source === 'gps' ? `GPS ±${Math.round(loc.accuracyM ?? 0)} m` : loc.source === 'url' ? 'location: URL' : 'location: default'} · ${compassLabel()} · ${fps.toFixed(0)} fps`,
    `✈ ${objects.filter((o) => o.kind === 'aircraft' && inView(o)).length} in view / ${objects.filter((o) => o.kind === 'aircraft').length}${aircraft.source ? ` (${aircraft.source}${Number.isFinite(acAge) ? `, ${Math.round(acAge)} s old` : ''})` : ''}${aircraft.error && aircraft.source === 'none' ? ' error' : ''}`,
    `🛰 ${satObjs.length} up / ${sats.total}${sats.source === 'fallback' ? ' (fallback list)' : ''} · ${satsVisibleByEye} visible`,
    `cal ${calib.yawDeg >= 0 ? '+' : ''}${calib.yawDeg.toFixed(1)}° ×${calib.fovScale.toFixed(3)}${mode !== 'view' ? ` · ${mode.toUpperCase()}` : ''}`,
  ];
  if (DEBUG) {
    const d = orientation.debug;
    const f = (x: number | null, n = 1) => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(n));
    lines.push(
      `hdg ${f(d.heading)} acc ${f(orientation.accuracyDeg, 0)} alpha ${f(d.alpha)} camEl ${f(d.camEl, 0)} ${d.still ? 'still' : 'moving'} ${d.accepted ? 'used' : 'skipped'}`,
      `offset ${f(orientation.compassOffset)} decl ${f(orientation.declinationDeg)} ${orientation.mode}/${orientation.compassState}`,
    );
  }
  hudStatus.textContent = lines.join('\n');
}

let poorCompassToastShown = false;
/** ?debug=1 shows raw compass values in the status area. */
const DEBUG = new URLSearchParams(location.search).has('debug');

function compassLabel(): string {
  if (orientation.mode === 'simulated') return 'simulated';
  if (orientation.mode === 'relative') return 'no compass';
  const acc = orientation.accuracyDeg != null && orientation.accuracyDeg >= 0 ? ` ±${Math.round(orientation.accuracyDeg)}°` : '';
  switch (orientation.compassState) {
    case 'frozen':
      return 'compass locked (calibrated)';
    case 'locked':
      return `compass ok${acc}`;
    case 'settling':
      return `compass settling: hold still${acc}`;
    default:
      return 'waiting for compass';
  }
}

function compass(az: number) {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(az / 45) % 8];
}

// ---------- taps ----------

let down: { x: number; y: number } | null = null;
canvas.addEventListener('pointerdown', (e) => { down = e.pointerType === 'touch' && !e.isPrimary ? null : { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointercancel', () => { down = null; });
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  down = null;
  if (moved < 10) onTap(e.clientX, e.clientY);
});

/** Nearest object (by angle) to a screen tap, within `maxDeg`. */
function nearestByAngle(x: number, y: number, maxDeg: number): { obj: SkyObject; deg: number } | null {
  const ray = cam.unproject(x, y);
  let best: { obj: SkyObject; deg: number } | null = null;
  for (const o of objects) {
    if (o.elDeg < -1) continue;
    const deg = angleBetweenDeg(ray, o.dir);
    if (deg < maxDeg && (!best || deg < best.deg)) best = { obj: o, deg };
  }
  return best;
}

function selectedStar(mode: 'calibrate' | 'eval'): SkyReference | undefined {
  const id = referencePickers[mode].value;
  return id ? stars?.references.find((star) => star.id === id) : undefined;
}

function tapReference(mode: 'calibrate' | 'eval', x: number, y: number, maxDeg: number) {
  const picker = referencePickers[mode];
  if(!picker.value) return nearestByAngle(x, y, maxDeg);
  const star = selectedStar(mode);
  return star ? { obj: star, deg: angleBetweenDeg(cam.unproject(x, y), star.dir) } : null;
}

function updateReferencePickers(references: SkyReference[]) {
  for(const picker of Object.values(referencePickers)) {
    const current = picker.value;
    const choices = references.map(({ id, label }) => ({ id, label }));
    if(current && !choices.some((star) => star.id === current)) {
      const label = picker.selectedOptions[0]!.text.replace(/ \(unavailable\)$/, '');
      choices.push({ id: current, label: `${label} (unavailable)` });
    }
    if(picker.options.length === choices.length + 1 && choices.every(({ id, label }, i) => picker.options[i + 1]?.value === id && picker.options[i + 1]?.text === label)) continue;
    picker.replaceChildren(new Option('Nearest labelled object', ''), ...choices.map(({ id, label }) => new Option(label, id)));
    picker.value = current;
  }
}

function onTap(x: number, y: number) {
  if(skyStatus.open) {
    skyStatus.open = false;
    return;
  }
  if(mode === 'layers') return setMode('view');
  if (mode === 'calibrate') {
    const hit = tapReference(mode, x, y, 30);
    if(!hit) return toast(referencePickers[mode].value ? 'That star is unavailable. Choose another reference.' : 'No known object near that tap.');
    calib = addTap(calib, {
      x,
      y,
      W: cam.W,
      H: cam.H,
      Mraw: cam.Mraw,
      F0: cam.F0,
      target: hit.obj.dir,
      label: hit.obj.label,
    });
    // From now on trust the gyro + this calibration; the compass would only add drift.
    orientation.setCompassFrozen(true);
    toast(`Calibrated on ${hit.obj.label} (was ${hit.deg.toFixed(1)}° off)`);
    updateCalibStats();
    return;
  }
  if (mode === 'eval') {
    const hit = tapReference(mode, x, y, 15);
    if(!hit) return toast(referencePickers[mode].value ? 'That star is unavailable. Choose another reference.' : 'No labelled object within 15° of that tap.');
    const r = evalLog.add(hit.obj, cam.unproject(x, y), {
      yawOffsetDeg: calib.yawDeg,
      fovScale: calib.fovScale,
      calibrated: calib.taps.length > 0 || calib.yawDeg !== 0,
      orientation: orientation.mode,
    });
    toast(`${r.label}: ${r.errorDeg.toFixed(2)}° error`);
    updateEvalStats();
    return;
  }
  // view mode: select the closest label on screen
  let best: Placed | null = null;
  let bestD = 44;
  for (const p of placed) {
    const d = Math.hypot(p.x - x, p.y - y);
    if(d < (p.radius ?? 0) || d < bestD) {
      best = p;
      bestD = d;
    }
  }
  overlay.selectedId = best?.obj.id ?? null;
  showDetails(best?.obj ?? null);
}

const distanceFormat = new Intl.NumberFormat(undefined, { notation: 'compact', maximumSignificantDigits: 4 });

function showDetails(o: SkyObject | null) {
  if(!o) {
    details.hidden = true;
    return;
  }
  details.hidden = false;
  details.dataset.kind = o.kind;
  const header = document.createElement('header');
  header.className = 'object-header';
  const identity = document.createElement('div');
  const category = document.createElement('span');
  category.className = 'object-category';
  category.textContent = objectCategory(o);
  const h = document.createElement('h3');
  h.textContent = o.label;
  identity.append(category, h);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'icon-button';
  close.setAttribute('aria-label', 'Close object details');
  close.textContent = '×';
  close.addEventListener('click', () => {
    overlay.selectedId = null;
    showDetails(null);
  });
  header.append(identity, close);
  const description = document.createElement('p');
  description.textContent = o.sub;
  const readings = document.createElement('dl');
  readings.className = 'object-readings';
  const values = [['Azimuth', `${o.azDeg.toFixed(1)}°`], ['Elevation', `${o.elDeg.toFixed(1)}°`]];
  if(o.kind === 'body') values.push(['Distance', `${distanceFormat.format(o.rangeKm)} km`]);
  for(const [label, value] of values) {
    const reading = document.createElement('div');
    const dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = label!;
    dd.textContent = value!;
    reading.append(dt, dd);
    readings.append(reading);
  }
  details.replaceChildren(header, description, readings);
  if(o.kind === 'body' && hasBodyModel(o.symbol) && (focusId !== o.id || zoom < BODY_FOCUS_ZOOM)) {
    const focus = document.createElement('button');
    focus.type = 'button';
    focus.className = 'primary focus-body';
    focus.textContent = `Zoom to ${o.label}`;
    focus.addEventListener('click', () => {
      zoomToBody(o);
      showDetails(null);
    });
    details.append(focus);
  }
}

// ---------- toolbar & sheets ----------

const sheets = { calibrate: $('calib-sheet'), eval: $('eval-sheet'), layers: $('layers') };

function setMode(m: Mode) {
  mode = m;
  for(const [name, sheet] of Object.entries(sheets)) {
    sheet.hidden = name !== m;
    $(`btn-${name}`).setAttribute('aria-expanded', String(name === m));
  }
  if(m !== 'view') {
    if(focusId) setZoom(1);
    skyStatus.open = false;
    details.hidden = true;
  }
  if (m === 'calibrate') updateCalibStats();
  if (m === 'eval') updateEvalStats();
}

for(const name of ['layers', 'calibrate', 'eval'] as const) $(`btn-${name}`).addEventListener('click', () => setMode(mode === name ? 'view' : name));

skyStatus.addEventListener('toggle', () => {
  if(!skyStatus.open) return;
  setMode('view');
  details.hidden = true;
  updateHud(Date.now());
});
const btnShowAll = $('btn-showall');
btnShowAll.setAttribute('aria-pressed', String(showAll));
btnShowAll.addEventListener('click', () => {
  showAll = !showAll;
  writeFlag(SHOW_ALL_KEY, showAll);
  btnShowAll.setAttribute('aria-pressed', String(showAll));
  toast(showAll ? 'Showing everything, even objects you can’t see by eye right now.' : 'Showing only what you can see by eye at full strength.');
});

$('btn-night').addEventListener('click', (e) => {
  overlay.night = !overlay.night;
  document.body.classList.toggle('night', overlay.night);
  (e.currentTarget as HTMLElement).setAttribute('aria-pressed', String(overlay.night));
});
document.querySelectorAll('.sheet .close').forEach((b) =>
  b.addEventListener('click', () => {
    const previous = mode;
    setMode('view');
    if(previous !== 'view') $(`btn-${previous}`).focus();
  }),
);

window.addEventListener('keydown', (e) => {
  if(e.key !== 'Escape') return;
  if(skyStatus.open) {
    skyStatus.open = false;
    skyStatus.querySelector('summary')?.focus();
  } else if(mode !== 'view') {
    const previous = mode;
    setMode('view');
    $(`btn-${previous}`).focus();
  } else {
    if(zoom > 1 || zoomTarget > 1 || focusId) setZoom(1, 200);
    details.hidden = true;
    overlay.selectedId = null;
  }
});

$('calib-reset').addEventListener('click', () => {
  calib = resetCalibration();
  orientation.setCompassFrozen(false);
  updateCalibStats();
  toast('Calibration reset');
});
$('eval-download').addEventListener('click', () => evalLog.download());
$('eval-clear').addEventListener('click', () => {
  evalLog.clear();
  updateEvalStats();
});

constellationToggle.addEventListener('change', () => {
  writeFlag(CONSTELLATIONS_KEY, constellationToggle.checked);
  constellationArtToggle.disabled = !constellationToggle.checked;
  overlay.resetConstellationReveals();
  if(constellationToggle.checked && !showAll && sats.sunElDeg >= -6) toast('Constellations appear after twilight. Use Show all to preview.');
});

constellationArtToggle.addEventListener('change', () => {
  writeFlag(CONSTELLATION_ART_OFF_KEY, !constellationArtToggle.checked);
  starsAt = -Infinity;
});

sheets.layers.querySelectorAll<HTMLInputElement>('input[data-group], input[data-layer="aircraft"], input[data-layer="bodies"]').forEach((input) =>
  input.addEventListener('change', () => {
    const group = input.dataset.group as TleGroup | undefined;
    if (group) {
      if (input.checked) sats.groups.add(group);
      else sats.groups.delete(group);
      sats.reload();
    } else if (input.dataset.layer === 'aircraft') {
      aircraft.enabled = input.checked;
    } else if (input.dataset.layer === 'bodies') {
      showBodies = input.checked;
    }
  }),
);

function updateCalibStats() {
  const parts = [`Compass offset ${calib.yawDeg >= 0 ? '+' : ''}${calib.yawDeg.toFixed(2)}°`, `FOV scale ×${calib.fovScale.toFixed(3)}`];
  if (calib.taps.length) parts.push(`${calib.taps.length} tap(s), residual ${calib.residualDeg.toFixed(2)}°`);
  $('calib-stats').textContent = parts.join(' · ');
}

function updateEvalStats() {
  const s = evalLog.stats();
  const f = (x: number) => (Number.isFinite(x) ? `${x.toFixed(2)}°` : '–');
  $('eval-stats').textContent = `${s.n} taps · median error uncalibrated ${f(s.medianRaw)} (${s.nRaw}) · calibrated ${f(s.medianCalibrated)} (${s.nCal})`;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
function toast(msg: string, ms = 2500) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), ms);
}

// Debug hooks for desktop testing
Object.assign(window, { skytrace: { orientation, cam, sats, aircraft, loc, get objects() { return objects; } } });
