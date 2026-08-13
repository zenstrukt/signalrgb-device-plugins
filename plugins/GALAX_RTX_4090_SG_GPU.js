// SignalRGB SMBus plugin for the GALAX GeForce RTX 4090 SG 1-Click OC.
// Protocol captured from GALAX Xtreme Tuner 1.1.0.4 on PCI 10DE:2684 / 10DE:167C.
// SMBus plugins write directly to hardware. Keep the PCI ID match and address narrow.

export function Name() { return "GALAX RTX 4090 SG GPU"; }
export function Publisher() { return "Jake"; }
export function Type() { return "SMBUS"; }
// The controller takes one RGB triplet at 0x02/0x03/0x04 and has no per-LED
// frame buffer, so the host cannot paint the card directly - OpenRGB reports the
// same thing as ZONE_TYPE_SINGLE / leds_max 1. What it does have is a nine-slot
// colour palette at 0x05-0x1F feeding the effects its own controller renders.
// So a spatial gradient is reachable after all, just not by addressing LEDs: the
// card supplies the motion and the palette supplies the colours, and the palette
// is ours to write from the canvas. The footprint below is sampled to fill it.
export function Size() { return [12, 1]; }
export function DefaultPosition() { return [5, 2]; }
export function DefaultScale() { return 3.0; }
export function LedNames() { return ["GPU 1", "GPU 2", "GPU 3", "GPU 4", "GPU 5", "GPU 6", "GPU 7", "GPU 8", "GPU 9", "GPU 10", "GPU 11", "GPU 12"]; }
export function LedPositions() { return [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0], [10, 0], [11, 0]]; }
export function DeviceType() { return "gpu"; }
export function ImageUrl() { return "https://assets.signalrgb.com/devices/default/gpu.png"; }
export function ConflictingProcesses() { return ["Xtreme Tuner.exe"]; }

/* global shutdownColor:readonly, galaxNoFadeCanvas:readonly, galaxSource:readonly, galaxForcedColor:readonly, galaxBrightness:readonly, galaxReduction:readonly, galaxPaletteNormalize:readonly, galaxCycleInterval:readonly, galaxCommit:readonly, galaxDiagnostics:readonly, galaxOnboardMode:readonly, galaxOnboardSpeed:readonly, galaxOnboardDirection:readonly, galaxOnboardColor:readonly, galaxOnboardColorB:readonly, bus:readonly, device:readonly */

const SAMPLE_WIDTH = 12;

export function ControllableParameters() {
	return [
		{"property":"shutdownColor", "group":"lighting", "label":"Shutdown Color", "description":"Color applied when SignalRGB exits normally", "type":"color", "default":"#000000"},
		{"property":"galaxNoFadeCanvas", "group":"lighting", "label":"Spatial Canvas Hybrid", "description":"Uses learned effect 35 for movement across the internal strip while SignalRGB supplies its canvas palette", "type":"boolean", "default":"true"},
		{"property":"galaxSource", "group":"lighting", "label":"GALAX Source", "description":"Host Palette Cycle keeps the card in static mode and steps through canvas colours at constant brightness, avoiding every onboard breathing/fade envelope", "type":"combobox", "values":["Canvas", "Host Palette Cycle (No Fade)", "Canvas Gradient (Static)", "Onboard Animation (Canvas Color)", "Onboard Animation (Custom Color)", "Forced"], "default":"Canvas"},
		{"property":"galaxCycleInterval", "group":"lighting", "label":"No-Fade Cycle Step", "description":"Time between solid colour changes in Host Palette Cycle. Brightness remains constant; only hue changes", "type":"combobox", "values":["100", "200", "350", "500", "750", "1000"], "default":"350"},
		{"property":"galaxOnboardMode", "group":"lighting", "label":"Onboard Effect ID", "description":"Mode register 0x30. All 22 IDs captured from Xtreme Tuner's effect tiles: 1-4, 18-25, 32-41. Each carries its own parameter block, applied automatically. IDs outside that set are unmapped and may do nothing", "type":"number", "min":"1", "max":"41", "step":"1", "default":"22"},
		{"property":"galaxOnboardSpeed", "group":"lighting", "label":"Onboard Speed", "description":"Overrides byte 0 of the effect's parameter block, which is the speed on every effect that has one", "type":"number", "min":"0", "max":"15", "step":"1", "default":"9"},
		{"property":"galaxOnboardDirection", "group":"lighting", "label":"Onboard Direction", "description":"Overrides byte 1 of the effect's parameter block on effects that have one", "type":"number", "min":"0", "max":"15", "step":"1", "default":"1"},
		{"property":"galaxOnboardColor", "group":"lighting", "label":"Onboard Color A", "description":"First color of the onboard palette when GALAX Source is Onboard Animation (Custom Color). Set both colors the same for a single-color effect", "type":"color", "default":"#ff0040"},
		{"property":"galaxOnboardColorB", "group":"lighting", "label":"Onboard Color B", "description":"Second color of the onboard palette. The ramp slots are blended between Color A and Color B, and the two user-color slots the effects read take A and B directly", "type":"color", "default":"#0040ff"},
		{"property":"galaxPaletteNormalize", "group":"lighting", "label":"Palette Brightness", "description":"Equalize lifts every canvas-derived palette slot to full brightness, keeping its hue. Effects that sweep the palette then hold a steady level instead of fading through the dark parts of the canvas. Raw Canvas passes samples through untouched, including dark ones", "type":"combobox", "values":["Equalize", "Raw Canvas"], "default":"Equalize"},
		{"property":"galaxReduction", "group":"lighting", "label":"Canvas Reduction", "description":"How the canvas strip collapses to the one color the hardware accepts. Vivid tracks the most saturated part of the effect; Average washes multi-hue effects out to grey; Center Pixel is the original single-sample behaviour", "type":"combobox", "values":["Vivid", "Average", "Center Pixel"], "default":"Vivid"},
		{"property":"galaxForcedColor", "group":"lighting", "label":"GALAX Forced Color", "description":"Color used when GALAX Source is Forced", "type":"color", "default":"#ff0000"},
		{"property":"galaxBrightness", "group":"lighting", "label":"GALAX Brightness", "description":"Hardware brightness level used by the GALAX controller", "type":"combobox", "values":["0", "1", "2", "3"], "default":"3"},
		{"property":"galaxCommit", "group":"lighting", "label":"Controller Commit", "description":"Persist On Change writes the save register only when mode or brightness changes. Every Frame reproduces the captured Xtreme Tuner transaction, which issues an EEPROM save on every rendered frame - only use it if colours stop updating without it", "type":"combobox", "values":["Persist On Change", "Every Frame (legacy)"], "default":"Persist On Change"},
		{"property":"galaxDiagnostics", "group":"lighting", "label":"Diagnostics", "description":"Dump Register Map reads registers 0x00-0x7F once and writes them to the SignalRGB log. Read-only; used to check whether the controller exposes an LED buffer the captured protocol never touches", "type":"combobox", "values":["Off", "Dump Register Map", "Sweep Onboard Effects"], "default":"Off"}
	];
}

const GPU = {
	Vendor: 0x10DE,
	SubVendor: 0x10DE,
	Device: 0x2684,
	SubDevice: 0x167C,
	Address: 0x50,
	Name: "GALAX GeForce RTX 4090 SG 1-Click OC"
};

let lastColor = [-1, -1, -1];
let loggedBusApi = false;
let loggedWriteResult = false;
let lastUpdate = 0;
let lastSource = "";
let lastBrightness = -1;
const UpdateIntervalMs = 50;

/** @param {FreeAddressBus} candidateBus */
export function Scan(candidateBus) {
	if (!candidateBus.IsNvidiaBus()) return [];
	if (!loggedBusApi) {
		loggedBusApi = true;
		const own = Object.getOwnPropertyNames(candidateBus);
		const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(candidateBus));
		candidateBus.log(`GALAX bus API own=[${own}] proto=[${proto}] type=[${candidateBus.Type()}] port=[${candidateBus.Port()}] name=[${candidateBus.Name()}] string=[${String(candidateBus)}]`, {toFile: true});
	}

	const matches = candidateBus.Vendor() === GPU.Vendor &&
		candidateBus.SubVendor() === GPU.SubVendor &&
		candidateBus.Product() === GPU.Device &&
		candidateBus.SubDevice() === GPU.SubDevice;

	return matches ? [GPU.Address] : [];
}

export function Initialize() {
	device.setName(GPU.Name);
	lastColor = [-1, -1, -1];
	loggedWriteResult = false;
	lastUpdate = 0;
	lastSource = "";
	lastBrightness = -1;
	// Render begins once SignalRGB has created the canvas for this device.
}

export function Render() {
	if (galaxDiagnostics === "Dump Register Map") dumpRegisterMap();
	if (galaxNoFadeCanvas) {
		writeOnboardAnimation(0x23, true, [0x00]);
		return;
	}
	if (galaxSource === "Host Palette Cycle (No Fade)") {
		writeHostPaletteCycle();
		return;
	}

	if (galaxSource === "Canvas Gradient (Static)") {
		writeCanvasGradient();
		return;
	}

	if (galaxSource.startsWith("Onboard Animation")) {
		writeOnboardAnimation();
		return;
	}
	writeColor(getRequestedColor(), galaxSource !== lastSource);
}

let hostCycleSlot = -1;
let hostCycleAt = 0;

// The GPU exposes one directly writable RGB triplet, so a host-driven cycle is
// necessarily solid across the card at any instant. Unlike the onboard modes,
// static mode 0x01 has no firmware brightness envelope. We sample twelve hues
// across the SignalRGB canvas and normalize each to the selected hardware
// brightness, then step between them without interpolation.
function writeHostPaletteCycle() {
	const interval = Math.max(50, Number.parseInt(galaxCycleInterval, 10) || 350);
	const now = Date.now();
	const noFadeSource = galaxNoFadeCanvas ? "No-Fade Canvas Cycle" : galaxSource;
	const sourceChanged = noFadeSource !== lastSource;

	if(!sourceChanged && now - hostCycleAt < interval) return;

	hostCycleAt = now;
	hostCycleSlot = (hostCycleSlot + 1) % SAMPLE_WIDTH;
	const sampled = device.color(hostCycleSlot, 0);
	const fallback = vividColor();
	const color = normalizeConstantBrightness(sampled, fallback);

	writeNoFadeColor(color, sourceChanged, noFadeSource);
}

function writeNoFadeColor(color, force, sourceName) {
	const rgb = color.slice(0, 3).map(value => Math.max(0, Math.min(255, value | 0)));
	const brightness = getBrightness();
	const stateChanged = force || brightness !== lastBrightness || sourceName !== lastSource;

	if(!stateChanged && rgb.every((value, index) => value === lastColor[index])) return;

	if(stateChanged) {
		// Static mode has no onboard time envelope. Configure it once; subsequent
		// colour writes are direct steps and cannot fade in or out.
		bus.WriteByte(0x30, 0x01);
		bus.WriteByte(0x2B, 0x00);
		bus.WriteByte(0x2D, brightness);
		bus.WriteByte(0x40, 0x5A);
		device.log(`GALAX no-fade canvas cycle enabled: static mode, step=[${galaxCycleInterval}ms], brightness=[${brightness}]`, {toFile: true});
	}

	// The optional GALAX fan is electrically linked to this controller and reads
	// the same base-colour register. One write therefore changes both outputs on
	// the same render tick; no onboard effect parameters are involved.
	bus.WriteBlock(0x02, 0x03, rgb);

	lastColor = rgb;
	lastSource = sourceName;
	lastBrightness = brightness;
	lastUpdate = Date.now();
}

function normalizeConstantBrightness(color, fallback) {
	const source = Math.max(color[0], color[1], color[2]) < DARK_SLOT_THRESHOLD ? fallback : color;
	const maximum = Math.max(source[0], source[1], source[2]);

	if(maximum === 0) return [0, 0, 0];

	return source.map(channel => Math.min(255, Math.round(channel * 255 / maximum)));
}

export function Shutdown(SystemSuspending) {
	writeColor(hexToRgb(SystemSuspending ? "#000000" : shutdownColor), true);
}

function getRequestedColor() {
	if (galaxSource === "Forced") return hexToRgb(galaxForcedColor);
	if (galaxReduction === "Center Pixel") return device.color(SAMPLE_WIDTH >> 1, 0);

	return smooth(galaxReduction === "Average" ? averageColor() : vividColor());
}

let lastHue = 0;

// Averaging RGB across a multi-hue strip converges on grey, and picking the
// single most saturated sample snaps between pixels and reads as flicker.
// Average the hues as unit vectors weighted by chroma instead: the result
// rotates continuously as an effect travels across the card, and saturation is
// carried by the strip's peak rather than diluted by its spread.
function vividColor() {
	let x = 0;
	let y = 0;
	let weight = 0;
	let peakChroma = 0;
	let peakValue = 0;

	for (let sample = 0; sample < SAMPLE_WIDTH; sample++) {
		const color = device.color(sample, 0);
		const max = Math.max(color[0], color[1], color[2]);
		const min = Math.min(color[0], color[1], color[2]);
		const chroma = max - min;

		if (max > peakValue) peakValue = max;
		if (chroma > peakChroma) peakChroma = chroma;
		if (chroma === 0) continue;

		const hue = hueOf(color, max, chroma);
		const sampleWeight = chroma * max;

		x += Math.cos(hue) * sampleWeight;
		y += Math.sin(hue) * sampleWeight;
		weight += sampleWeight;
	}

	if (peakValue === 0) return [0, 0, 0];
	if (weight === 0) return [peakValue, peakValue, peakValue];

	// When the strip spans opposing hues the vectors cancel and the mean angle
	// is meaningless, so hold the last stable hue rather than letting it snap.
	const coherence = Math.sqrt(x * x + y * y) / weight;
	const hue = coherence > 0.2 ? Math.atan2(y, x) : lastHue;
	lastHue = hue;

	return hsvToRgb(hue, peakChroma / peakValue, peakValue / 255);
}

function hueOf(color, max, chroma) {
	const sector = max === color[0] ? (color[1] - color[2]) / chroma
		: max === color[1] ? (color[2] - color[0]) / chroma + 2
			: (color[0] - color[1]) / chroma + 4;

	return sector * Math.PI / 3;
}

function hsvToRgb(hue, saturation, value) {
	const sector = (((hue / (Math.PI / 3)) % 6) + 6) % 6;
	const chroma = value * saturation;
	const secondary = chroma * (1 - Math.abs((sector % 2) - 1));
	const match = value - chroma;
	const channels = [
		[chroma, secondary, 0], [secondary, chroma, 0], [0, chroma, secondary],
		[0, secondary, chroma], [secondary, 0, chroma], [chroma, 0, secondary]
	][Math.floor(sector)];

	return channels.map(channel => Math.round((channel + match) * 255));
}

let smoothedColor = null;
const SmoothingAlpha = 0.3;

// One more pass of exponential smoothing over the final colour. The canvas can
// step between frames and the controller latches instantly, so without this the
// card reads as a strobe rather than a fade.
function smooth(target) {
	if (!smoothedColor) {
		smoothedColor = target.slice(0, 3);

		return smoothedColor.map(channel => Math.round(channel));
	}

	for (let channel = 0; channel < 3; channel++) {
		smoothedColor[channel] += (target[channel] - smoothedColor[channel]) * SmoothingAlpha;
	}

	return smoothedColor.map(channel => Math.round(channel));
}

function averageColor() {
	const sum = [0, 0, 0];

	for (let x = 0; x < SAMPLE_WIDTH; x++) {
		const color = device.color(x, 0);
		sum[0] += color[0];
		sum[1] += color[1];
		sum[2] += color[2];
	}

	return sum.map(value => Math.round(value / SAMPLE_WIDTH));
}

let dumpedRegisterMap = false;

export function ongalaxDiagnosticsChanged() {
	dumpedRegisterMap = false;
}

// Read-only sweep of the controller's register file. The captured Xtreme Tuner
// protocol only ever touches 0x02, 0x21, 0x2B, 0x2D, 0x30 and 0x40, leaving
// 0x05-0x20 unaccounted for. If the card held a per-LED buffer it would have to
// live in a gap like that, so dump the map and look for structure.
function dumpRegisterMap() {
	if (dumpedRegisterMap) return;
	dumpedRegisterMap = true;

	for (let base = 0x00; base < 0x80; base += 0x10) {
		const row = [];

		for (let offset = 0; offset < 0x10; offset++) {
			const value = bus.ReadByte(base + offset);
			row.push(typeof value === "number" && value >= 0 ? value.toString(16).padStart(2, "0") : "--");
		}

		device.log(`GALAX register map 0x${base.toString(16).padStart(2, "0")}: ${row.join(" ")}`, {toFile: true});
	}
}

function writeColor(color, force = false) {
	const rgb = color.slice(0, 3).map(value => Math.max(0, Math.min(255, value | 0)));
	const brightness = getBrightness();
	const stateChanged = force || brightness !== lastBrightness || galaxSource !== lastSource;

	if (!stateChanged && rgb.every((value, index) => value === lastColor[index])) return;

	const now = Date.now();
	if (!stateChanged && now - lastUpdate < UpdateIntervalMs) return;

	// Register 0x40 = 0x5A is the controller's save command, which OpenRGB
	// exposes only behind MODE_FLAG_MANUAL_SAVE, and Xtreme Tuner only issues on
	// an explicit Apply. The captured transaction sent it alongside every colour
	// write, which as a per-frame render meant a save 20 times a second - enough
	// to reach typical EEPROM endurance in hours for no benefit, since the colour
	// registers latch on their own. Mode, zone and brightness are equally static,
	// so a steady-state frame is now a single three-byte colour write.
	if (stateChanged) {
		bus.WriteByte(0x30, 0x01);
		bus.WriteByte(0x2B, 0x00);
		bus.WriteByte(0x2D, brightness);
	}

	const result = bus.WriteBlock(0x02, 0x03, rgb);

	if (stateChanged && galaxCommit === "Persist On Change") {
		bus.WriteByte(0x40, 0x5A);
	} else if (galaxCommit === "Every Frame (legacy)") {
		bus.WriteByte(0x40, 0x5A);
	}

	if(!loggedWriteResult) {
		loggedWriteResult = true;
		device.log(`GALAX colour stream verified RGB=[${rgb}] commit=[${galaxCommit}] result=[${result}]`, {toFile: true});
	}

	lastColor = rgb;
	lastSource = galaxSource;
	lastBrightness = brightness;
	lastUpdate = now;
}

// The register sweep turned up the one thing the captured protocol never
// touched: eight consecutive RGB triplets at 0x05-0x1C holding a clean
// RED/ORANGE/YELLOW/GREEN/CYAN/BLUE/MAGENTA/AZURE ramp, with 0x01 = 8 sitting
// in front of them as the count. That is a host-writable colour table, and it
// is the only structure on this controller wide enough to carry more than one
// colour at a time. Whether the hardware treats it as a per-LED frame buffer or
// as the palette its effects cycle through decides how far this can go, and the
// two cases are told apart by the Onboard Effect ID:
//
//   Effect ID 1  (static) - if the card shows a spatial gradient, it is a frame
//                           buffer and full canvas addressing is on the table
//   Effect ID 22 (animation) - if the animation adopts these colours, it is a
//                           palette, and the effect is ours to colour
//
// Either outcome is worth having, so the table is streamed from the canvas.
// The palette is nine contiguous RGB triplets at 0x05-0x1F. The effect capture
// shows Xtreme Tuner writing six bytes at 0x1A - slots 8 and 9 - whenever an
// effect takes user colours, while slots 1-7 hold a fixed
// RED/ORANGE/YELLOW/GREEN/CYAN/BLUE/MAGENTA ramp that the rainbow-style effects
// sweep through. Different effects read different parts of it, so all nine are
// written: the ramp for the sweeping effects, and the two user slots for the
// one- and two-colour ones.
const COLOR_TABLE_BASE = 0x05;
const USER_COLOR_BASE = 0x1A;
const COLOR_TABLE_SLOTS = 9;
const USER_COLOR_SLOTS = 2;
let lastColorTable = "";

// Effect IDs and their parameter blocks, captured by clicking through every
// tile on the Xtreme Tuner RGB page. The block length is effect-specific, which
// is why a fixed three-byte write was wrong for most of them - only 0x16 and
// 0x12 actually take three. Byte 0 is the speed on every effect that has one.
const ONBOARD_EFFECTS = {
	1: [], 2: [0x06, 0x00], 3: [0x00, 0x01], 4: [0x02, 0x02, 0x04, 0x05],
	18: [0x01, 0x10, 0x06], 19: [0x04, 0x00], 20: [0x01, 0x01], 21: [0x03, 0x02],
	22: [0x09, 0x01, 0x09], 23: [0x01, 0x01], 24: [0x00, 0x00], 25: [],
	32: [0x01], 33: [0x01], 34: [0x01], 35: [0x03], 36: [0x05], 37: [0x06],
	38: [0x01], 39: [0x00, 0x00], 40: [0x04, 0x04], 41: [0x08, 0x08]
};

// Auditioning 22 effects by hand-typing IDs is miserable, and the thing you are
// looking for - which effects take our colours and which pulse - is only
// visible, never in the protocol. Cycle them and log each one as it starts, so
// the log lines up with what the card was doing.
const EFFECT_IDS = Object.keys(ONBOARD_EFFECTS).map(Number).sort((first, second) => first - second);
const SweepHoldMs = 6000;
let sweepIndex = -1;
let sweepUntil = 0;

function sweepEffect() {
	const now = Date.now();

	if (now < sweepUntil && sweepIndex >= 0) return EFFECT_IDS[sweepIndex];

	sweepIndex = (sweepIndex + 1) % EFFECT_IDS.length;
	sweepUntil = now + SweepHoldMs;

	const mode = EFFECT_IDS[sweepIndex];
	device.log(`GALAX effect sweep ${sweepIndex + 1}/${EFFECT_IDS.length}: effect ${mode} (0x${mode.toString(16)})`, {toFile: true});

	return mode;
}

function effectParams(mode) {
	const captured = ONBOARD_EFFECTS[mode];
	const params = (captured ? captured.slice() : [0x09, 0x01, 0x09]);

	if (params.length > 0) params[0] = byteOf(galaxOnboardSpeed, params[0]);
	if (params.length > 1 && galaxOnboardDirection !== undefined) params[1] = byteOf(galaxOnboardDirection, params[1]);

	return params;
}

function buildPalette(ramp, userA, userB) {
	const rampSlots = COLOR_TABLE_SLOTS - USER_COLOR_SLOTS;
	const table = [];

	for (let slot = 0; slot < rampSlots; slot++) {
		const color = ramp(slot / (rampSlots - 1));

		table.push(color[0] | 0, color[1] | 0, color[2] | 0);
	}

	// Slots 8 and 9 are what the one- and two-colour effects actually read.
	for (const color of [userA, userB]) {
		table.push(color[0] | 0, color[1] | 0, color[2] | 0);
	}

	return table;
}

// The ramp follows the canvas across the card, and the two user slots take the
// ends of the strip so a two-colour effect gets the most contrast available
// rather than two neighbouring samples that look identical.
//
// Effects that sweep the palette render whatever level each slot holds, so a
// dark region of the canvas lands in the ramp as a near-black slot and the sweep
// visibly fades through it. Equalize lifts every slot to full brightness while
// keeping its hue, which holds the level steady across the sweep. A slot with no
// colour left in it at all falls back to the strip's dominant hue, since scaling
// black just yields black.
function paletteFromCanvas() {
	const dominant = vividColor();
	const sampleAt = position => normalizeSlot(device.color(Math.min(SAMPLE_WIDTH - 1, Math.round(position * (SAMPLE_WIDTH - 1))), 0), dominant);

	return buildPalette(sampleAt, sampleAt(0), sampleAt(1));
}

const DARK_SLOT_THRESHOLD = 8;

function normalizeSlot(color, fallback) {
	if (galaxPaletteNormalize === "Raw Canvas") return color;

	const source = Math.max(color[0], color[1], color[2]) < DARK_SLOT_THRESHOLD ? fallback : color;
	const max = Math.max(source[0], source[1], source[2]);

	if (max === 0) return [0, 0, 0];

	return source.map(channel => Math.min(255, Math.round(channel * 255 / max)));
}

// A linear ramp from Color A to Color B. Setting both the same fills every slot
// with one colour, which is how a single-colour onboard effect is expressed.
function paletteFromCustom() {
	const from = hexToRgb(galaxOnboardColor, [255, 0, 64]);
	const to = hexToRgb(galaxOnboardColorB, [0, 64, 255]);
	const blend = mix => from.map((channel, index) => Math.round(channel + (to[index] - channel) * mix));

	return buildPalette(blend, from, to);
}

// Xtreme Tuner writes the two user colours as their own six-byte transaction at
// 0x1A and never writes 0x05 at all. Sending all nine slots as one 27-byte block
// only ever recoloured the effects that read the ramp - the ones reading the
// user slots kept showing stock colours, because the tail of that block was not
// reaching 0x1A. Mirror the captured shape instead: the ramp as one write, the
// user slots as a separate one.
function writePalette(table) {
	const signature = table.join(",");

	if (signature === lastColorTable) return;

	const rampBytes = (COLOR_TABLE_SLOTS - USER_COLOR_SLOTS) * 3;
	const userBytes = USER_COLOR_SLOTS * 3;
	const rampResult = bus.WriteBlock(COLOR_TABLE_BASE, rampBytes, table.slice(0, rampBytes));
	const userResult = bus.WriteBlock(USER_COLOR_BASE, userBytes, table.slice(rampBytes));

	if (!loggedColorTable) {
		loggedColorTable = true;
		device.log(`GALAX palette ramp=[0x05 ${rampBytes}B result ${rampResult}] user=[0x1a ${userBytes}B result ${userResult}] data=[${signature}]`, {toFile: true});
	}

	lastColorTable = signature;
}

let loggedColorTable = false;
let lastOnboardShape = "";

// The controller renders its own addressable effects, and the captured
// transaction shows it takes a base colour at 0x02 in the same breath as the
// mode at 0x30. So the spatial animation the host cannot produce is generated
// on the card, while the colour it animates is still ours to drive - a moving
// gradient whose hue follows the canvas. The mode and its 0x21 parameters are
// written only when they change; re-sending them every frame would restart the
// animation and defeat the whole point.
// Every animated effect that pulses does so in the controller's own firmware -
// there is no parameter that turns a breathe off, so no amount of tuning 0x21
// will stop it. The way out is to stop asking the card to animate at all: hold
// it in static mode and let the palette carry the gradient, with the canvas
// updating the palette. Static cannot fade because nothing is running.
//
// The reason this has never actually been tried is that the onboard paths above
// also write a single colour to 0x02 every 50ms, and in static mode one colour
// there is exactly what the card renders - overriding the very buffer the
// gradient lives in. This path deliberately never touches 0x02.
function writeCanvasGradient() {
	const brightness = getBrightness();
	const shape = `gradient:${brightness}`;

	if (shape !== lastOnboardShape) {
		bus.WriteByte(0x30, 0x01);
		bus.WriteByte(0x2B, 0x00);
		bus.WriteByte(0x2D, brightness);
		bus.WriteByte(0x40, 0x5A);
		device.log(`GALAX canvas gradient: static mode 0x01, brightness=[${brightness}], 0x02 left untouched`, {toFile: true});
		lastOnboardShape = shape;
		lastColorTable = "";
		lastSource = galaxSource;
		lastBrightness = brightness;
	}

	const now = Date.now();

	if (now - lastUpdate < UpdateIntervalMs) return;

	lastUpdate = now;
	writePalette(paletteFromCanvas());
}

function writeOnboardAnimation(modeOverride, forceCanvasPalette = false, lockedParams = null) {
	const brightness = getBrightness();
	const mode = modeOverride ?? (galaxDiagnostics === "Sweep Onboard Effects" ? sweepEffect() : byteOf(galaxOnboardMode, 0x16));
	const sourceName = forceCanvasPalette ? "Spatial Audition" : galaxSource;
	const shape = [sourceName, mode, galaxOnboardSpeed, galaxOnboardDirection, brightness].join(":");
	const shapeChanged = shape !== lastOnboardShape;
	const custom = !forceCanvasPalette && galaxSource === "Onboard Animation (Custom Color)";
	const color = custom ? hexToRgb(galaxOnboardColor, [255, 0, 64]) : smooth(vividColor());

	const now = Date.now();
	const due = shapeChanged || now - lastUpdate >= UpdateIntervalMs;

	// The onboard effects read their colours from the palette at 0x05-0x1F, not
	// from the single colour at 0x02 - which is why pushing colour to 0x02 left
	// the stock rainbow running untouched. Writing the palette is what actually
	// recolours the animation. 0x02 is still written below because the simpler
	// modes do use it.
	if (due) writePalette(custom ? paletteFromCustom() : paletteFromCanvas());

	if (shapeChanged) {
		const params = lockedParams ? lockedParams.slice() : effectParams(mode);

		if (params.length > 0) bus.WriteBlock(0x21, params.length, params);
		bus.WriteByte(0x30, mode);
		bus.WriteByte(0x2B, 0x00);
		bus.WriteByte(0x2D, brightness);
		bus.WriteByte(0x40, 0x5A);
		device.log(`GALAX onboard animation mode=[0x${mode.toString(16)}] params=[${params}] color=[${color}] brightness=[${brightness}]`, {toFile: true});
		lastOnboardShape = shape;
		lastSource = sourceName;
		lastBrightness = brightness;
		lastColor = [-1, -1, -1];
	}

	const rgb = color.slice(0, 3).map(value => Math.max(0, Math.min(255, value | 0)));

	if (!due) return;
	if (rgb.every((value, index) => value === lastColor[index])) return;

	bus.WriteBlock(0x02, 0x03, rgb);
	lastColor = rgb;
	lastSource = sourceName;
	lastBrightness = brightness;
	lastUpdate = now;
}

// A parameter declared under a group SignalRGB does not render never reaches
// the plugin, and it arrives here as undefined rather than as an error. Falling
// back to 0 turned that into mode 0x00 and a black base colour, which looks
// exactly like broken hardware. Fall back to the captured values instead and say
// so in the log.
function byteOf(value, fallback) {
	const parsed = Number.parseInt(value, 10);

	if (!Number.isFinite(parsed)) {
		warnMissingParameter();

		return fallback;
	}

	return Math.max(0, Math.min(255, parsed));
}

let warnedMissingParameter = false;

function warnMissingParameter() {
	if (warnedMissingParameter) return;
	warnedMissingParameter = true;
	device.log("GALAX onboard parameter unavailable; using captured defaults. Check the parameter group names.", {toFile: true});
}

function getBrightness() {
	return Math.max(0, Math.min(3, Number.parseInt(galaxBrightness, 10) || 0));
}

// SignalRGB hands colour properties over as "#rrggbb", but a device that has
// never had the property written can hand back a decimal triplet or nothing at
// all. Returning black in those cases is indistinguishable from a deliberate
// black, so take an explicit fallback instead.
function hexToRgb(hex, fallback = [0, 0, 0]) {
	const hexMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);

	if (hexMatch) {
		return [
			parseInt(hexMatch[1], 16),
			parseInt(hexMatch[2], 16),
			parseInt(hexMatch[3], 16)
		];
	}

	const triplet = String(hex ?? "").match(/\d+/g);

	if (triplet && triplet.length >= 3) {
		return triplet.slice(0, 3).map(value => Math.max(0, Math.min(255, Number.parseInt(value, 10))));
	}

	return fallback;
}

export function BrandGPUList() { return [GPU]; }
