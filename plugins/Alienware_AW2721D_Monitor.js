// SignalRGB plugin for the Alienware AW2721D 27" gaming monitor (AlienFX).
// Protocol captured from Alienware Command Center's AlienFXSubAgent by tracing
// its HID writes. See docs/aw2721d-protocol.md.
//
// Not supported by OpenRGB, which covers the AW3225QF (PID 0x1013) and the
// AW3423DWF (PID 0x100E) only. The AW3423DWF needs a challenge-response login
// before it accepts lighting; this panel does not - nothing resembling one
// appeared anywhere in the capture, and colour writes land on their own.

export function Name() { return "Alienware AW2721D Monitor"; }
export function VendorId() { return 0x187C; }
export function ProductId() { return 0x1009; }
export function Publisher() { return "Jake"; }
export function Type() { return "Hid"; }
export function DeviceType() { return "other"; }
export function Size() { return [17, 5]; }
export function DefaultPosition() { return [0, 0]; }
export function DefaultScale() { return 8.0; }
export function ImageUrl() { return "https://assets.signalrgb.com/devices/brands/alienware/misc/aw3423dw-monitor.png"; }
export function ConflictingProcesses() { return ["AlienFXSubAgent.exe", "AWCC.UCSubAgent.exe", "AWCC.SCSubAgent.exe"]; }

export function Validate(endpoint) {
	return endpoint.interface === 0 && endpoint.usage_page === 0xFF00 && endpoint.usage === 0x0001;
}

/* global shutdownColor:readonly, LightingMode:readonly, forcedColor:readonly, awBrightness:readonly, awZoneOrder:readonly, device:readonly */

export function ControllableParameters() {
	return [
		{"property":"shutdownColor", "group":"lighting", "label":"Shutdown Color", "description":"Color applied when SignalRGB exits normally", "type":"color", "default":"#000000"},
		{"property":"LightingMode", "group":"lighting", "label":"Lighting Mode", "description":"Canvas pulls from the active Effect; Forced overrides it with one color", "type":"combobox", "values":["Canvas", "Forced"], "default":"Canvas"},
		{"property":"forcedColor", "group":"lighting", "label":"Forced Color", "description":"Color used when Lighting Mode is Forced", "type":"color", "default":"#009bde"},
		{"property":"awBrightness", "group":"lighting", "label":"Brightness", "description":"Hardware brightness, 0-100. Sent with every colour write, exactly as AlienFX does", "type":"number", "min":"0", "max":"100", "step":"5", "default":"100"},
		{"property":"awZoneOrder", "group":"lighting", "label":"Zone Order", "description":"Which physical zone each canvas position drives. The capture proved the zone field is a 4-bit mask but not which bit is which light, so swap this if the zones land in the wrong order", "type":"combobox", "values":["Logo, Stand, Downlight, Power", "Power, Downlight, Stand, Logo"], "default":"Logo, Stand, Downlight, Power"}
	];
}

const ZONE_NAMES = ["Back Logo", "Stand", "Downlight", "Power Button"];
const ZONE_BITS = [0x01, 0x02, 0x04, 0x08];
const ZONE_COUNT = 4;
const WRITE_INTERVAL_MS = 50;

const PACKET_BYTES = 65;
const REPORT_PAD = 0xFF;

// Every AlienFX packet is a DDC/CI block wrapped in a 65-byte HID report:
//
//   00 92 37 <block_len> 00 51 <80|n> D0 <opcode> <zone> <payload...> <checksum>
//
// with the remainder padded to 0xFF. The checksum seeds at 0x6E and XORs every
// byte from index 5 up to itself, and its position follows the block length -
// which is why it is computed rather than hardcoded per command.
const CHECKSUM_SEED = 0x6E;
const OPCODE_STATIC_COLOR = 0x04;

export function LedNames() { return ZONE_NAMES; }
// Spread the zones over the monitor's physical footprint so horizontal canvas
// effects reach the left/rear logo, centre stand/downlight and right power LED.
export function LedPositions() { return [[1, 0], [8, 0], [8, 4], [16, 4]]; }

const lastSent = [];
const desired = [];
let nextZone = 0;
let lastWriteAt = 0;

export function Initialize() {
	device.setName("Alienware AW2721D Monitor");
	lastSent.length = 0;
	desired.length = 0;
	nextZone = 0;

	// Alienware Gen-2 monitors must be put in Direct Mode before D0/04 colour
	// packets are treated as a live software stream instead of onboard lighting.
	setDirectMode();
	device.pause(WRITE_INTERVAL_MS);
	setZoneColor(0x0F, [0, 0, 0]);
	lastWriteAt = Date.now();
}

export function Render() {
	const brightness = getBrightness();

	for (let zone = 0; zone < ZONE_COUNT; zone++) {
		const color = getZoneColor(zone);
		desired[zone] = [color[0], color[1], color[2], brightness];
	}

	// Render can run far faster than this monitor accepts HID commands. Keep the
	// newest canvas sample for every zone, but transmit at most one packet per
	// 50 ms. This avoids the old 200 ms blocking Render path and stale backlog.
	if (Date.now() - lastWriteAt < WRITE_INTERVAL_MS) return;

	const zone = findPendingZone();
	if (zone < 0) return;

	const target = desired[zone];
	let mask = 0;

	// One packet can address any combination of zones sharing a colour. Forced
	// mode therefore updates all four lights atomically instead of in four steps.
	for (let i = 0; i < ZONE_COUNT; i++) {
		if (!colorsEqual(desired[i], target) || colorsEqual(lastSent[i], target)) continue;

		mask |= ZONE_BITS[mapZone(i)];
		lastSent[i] = target.slice();
	}

	setZoneColor(mask, target, target[3]);
	lastWriteAt = Date.now();
	nextZone = (zone + 1) % ZONE_COUNT;
}

export function Shutdown(SystemSuspending) {
	setZoneColor(0x0F, hexToRgb(SystemSuspending ? "#000000" : shutdownColor));
}

function mapZone(zone) {
	return awZoneOrder === "Power, Downlight, Stand, Logo" ? ZONE_COUNT - 1 - zone : zone;
}

function getZoneColor(zone) {
	if (LightingMode === "Forced") return hexToRgb(forcedColor);

	return device.color(zone, 0);
}

function getBrightness() {
	const value = Number.parseInt(awBrightness, 10);

	return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 100));
}

function findPendingZone() {
	for (let offset = 0; offset < ZONE_COUNT; offset++) {
		const zone = (nextZone + offset) % ZONE_COUNT;

		if (!colorsEqual(lastSent[zone], desired[zone])) return zone;
	}

	return -1;
}

function colorsEqual(left, right) {
	return Boolean(left && right && left[0] === right[0] && left[1] === right[1] && left[2] === right[2] && left[3] === right[3]);
}

function setDirectMode() {
	const packet = new Array(PACKET_BYTES).fill(REPORT_PAD);

	packet[0] = 0x00;
	packet[1] = 0x92;
	packet[2] = 0x37;
	packet[3] = 0x05;
	packet[4] = 0x00;
	packet[5] = 0x51;
	packet[6] = 0x82;
	packet[7] = 0xD0;
	packet[8] = 0xF4;
	packet[9] = 0x99;

	device.write(packet, PACKET_BYTES);
}

// Opcode 0xD0 0x04: set a static colour on the zones named by the mask. This is
// the one command a canvas-driven plugin needs - the onboard effects live behind
// 0xD0 0x01 and are exactly what SignalRGB is replacing.
function setZoneColor(zoneMask, color, brightness = 100) {
	const packet = new Array(PACKET_BYTES).fill(REPORT_PAD);

	packet[0] = 0x00;
	packet[1] = 0x92;
	packet[2] = 0x37;
	packet[3] = 0x0A;
	packet[4] = 0x00;
	packet[5] = 0x51;
	packet[6] = 0x87;
	packet[7] = 0xD0;
	packet[8] = OPCODE_STATIC_COLOR;
	packet[9] = zoneMask;
	packet[10] = clampByte(color[0]);
	packet[11] = clampByte(color[1]);
	packet[12] = clampByte(color[2]);
	packet[13] = brightness;

	fillChecksum(packet);
	device.write(packet, PACKET_BYTES);
}

function fillChecksum(packet) {
	const index = 4 + packet[3];
	let checksum = CHECKSUM_SEED;

	for (let i = 5; i < index; i++) {
		checksum ^= packet[i];
	}

	packet[index] = checksum;
}

function clampByte(value) {
	return Math.max(0, Math.min(255, value | 0));
}

function hexToRgb(hex) {
	const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);

	return match ? [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)] : [0, 0, 0];
}
