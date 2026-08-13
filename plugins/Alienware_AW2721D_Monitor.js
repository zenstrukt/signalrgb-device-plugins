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
export function DeviceType() { return "monitor"; }
export function Size() { return [4, 1]; }
export function DefaultPosition() { return [0, 0]; }
export function DefaultScale() { return 4.0; }
export function ImageUrl() { return "https://assets.signalrgb.com/devices/default/monitor.png"; }
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

const ZONE_NAMES = ["Logo", "Stand", "Downlight", "Power Button"];
const ZONE_BITS = [0x01, 0x02, 0x04, 0x08];
const ZONE_COUNT = 4;

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
export function LedPositions() { return [[0, 0], [1, 0], [2, 0], [3, 0]]; }

const lastSent = [];

export function Initialize() {
	device.setName("Alienware AW2721D Monitor");
	lastSent.length = 0;
	setZoneColor(0x0F, [0, 0, 0]);
}

export function Render() {
	const brightness = getBrightness();

	for (let zone = 0; zone < ZONE_COUNT; zone++) {
		const color = getZoneColor(zone);
		const previous = lastSent[zone];

		// The monitor needs ~50ms between writes, so four zones refreshed
		// unconditionally would cap the whole device at 5fps. Only zones whose
		// colour actually moved are sent, which keeps a typical effect - where
		// most zones are steady most of the time - far cheaper than that.
		if (previous && previous[0] === color[0] && previous[1] === color[1] && previous[2] === color[2] && previous[3] === brightness) {
			continue;
		}

		setZoneColor(ZONE_BITS[mapZone(zone)], color, brightness);
		lastSent[zone] = [color[0], color[1], color[2], brightness];
	}
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
	device.pause(50);
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
