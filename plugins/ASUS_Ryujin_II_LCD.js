import LCD from "@SignalRGB/lcd";

export function Name() { return "ASUS ROG Ryujin II LCD"; }
export function VendorId() { return 0x0B05; }
export function ProductId() { return 0x1988; }
export function Publisher() { return "Jake"; }
export function Documentation() { return "troubleshooting/ASUS"; }
export function Size() { return [1, 1]; }
export function DefaultPosition() { return [160, 120]; }
export function DefaultScale() { return 1.0; }
export function SupportsFanControl() { return false; }
export function SubdeviceController() { return true; }
export function DeviceType() { return "lcd"; }
export function Type() { return "hybrid"; }
export function Validate(endpoint) { return endpoint.interface === 0 || endpoint.interface === 1; }
export function ImageUrl() { return "https://assets.signalrgb.com/devices/brands/asus/aios/ryujin-2.png"; }
export function ConflictingProcesses() {
	return [
		"ArmouryCrate.exe",
		"ArmouryCrate.Service.exe",
		"ArmouryCrate.UserSessionHelper.exe",
		"ArmourySocketServer.exe",
		"ArmourySwAgent.exe",
		"LightingService.exe",
		"ROGLiveService.exe",
		"asus_framework.exe",
	];
}

/* global lcdMode:readonly lcdFps:readonly */
export function ControllableParameters() {
	return [
		{
			property: "lcdMode",
			group: "lcd",
			label: "LCD Source",
			description: "SignalRGB streams the selected LCD face or uploaded media. Stored GIF leaves the last uploaded animation playing.",
			type: "combobox",
			values: ["SignalRGB Canvas", "Stored GIF"],
			default: "SignalRGB Canvas",
		},
		{
			property: "lcdFps",
			group: "lcd",
			label: "LCD Frame Rate",
			description: "Lower values reduce USB traffic, but leave the controller armed and idle for longer between frames, which is when it falls back to the stored animation. Raise this if the factory loop cuts in.",
			type: "combobox",
			values: ["5", "10", "15", "20", "25", "30"],
			default: "20",
		},
	];
}

const WIDTH = 320;
const HEIGHT = 240;
const FRAME_BYTES = WIDTH * HEIGHT * 3;
const CHUNK_BYTES = 4096;

let streamReady = false;
let lastFrameAt = 0;

// Reused across frames so a 230400-element allocation does not land inside the
// window where the controller is waiting on data. It doubles as the last known
// good frame, which is what gets re-sent when the canvas has nothing ready.
const bgrFrame = new Array(FRAME_BYTES);
let hasGoodFrame = false;
let repeatedFrames = 0;

export function Initialize() {
	device.setName("ASUS ROG Ryujin II LCD");
	device.setImageFromUrl(ImageUrl());
	device.set_endpoint(1, 0x00A1, 0xFF72, 0x0000);
	LCD.initialize({ width: WIDTH, height: HEIGHT });

	if (lcdMode !== "Stored GIF") {
		startStream();
	}
}

export function Render() {
	if (lcdMode === "Stored GIF") {
		return;
	}

	if (!streamReady) {
		startStream();
	}

	const fps = Math.max(1, Number(lcdFps) || 10);
	const now = Date.now();
	if (now - lastFrameAt < 1000 / fps) {
		return;
	}
	lastFrameAt = now;

	const rgb = LCD.getFrame({ format: "RGB" });
	const frameReady = rgb && rgb.length === FRAME_BYTES;

	// A media loop reaching its end, or a face still starting up, leaves the
	// canvas with no frame to hand over for a moment. Returning here - which is
	// what this did - sends the controller nothing while it is already armed and
	// waiting for 230400 bytes, so it starves, gives up, and shows its stored
	// animation until the next good frame arrives. That is the pause at the end
	// of a loop followed by the factory animation and the flick back.
	//
	// Repeating the last good frame keeps the stream fed across the gap. The
	// picture holds still for a beat instead of cutting away to something else.
	if (!frameReady) {
		if (!hasGoodFrame) return;

		repeatedFrames++;
	} else {
		// The controller is armed from the moment it is told a frame is coming,
		// so anything slow before the last chunk widens the starvation window.
		// The channel swap therefore runs once over the whole frame with a
		// stride of three, rather than per chunk with a modulo and a three-way
		// branch on every one of 230400 bytes. Same output, far less time spent.
		for (let i = 0; i < FRAME_BYTES; i += 3) {
			bgrFrame[i] = rgb[i + 2];
			bgrFrame[i + 1] = rgb[i + 1];
			bgrFrame[i + 2] = rgb[i];
		}

		hasGoodFrame = true;
	}

	const startedAt = Date.now();

	for (let offset = 0; offset < FRAME_BYTES; offset += CHUNK_BYTES) {
		const length = Math.min(CHUNK_BYTES, FRAME_BYTES - offset);

		// The final transfer is its exact remaining length; never pad to 4096.
		device.bulk_transfer(0x01, bgrFrame.slice(offset, offset + length), length, 1000);
	}

	// Commit this frame and pre-announce the next 230400-byte frame.
	writeHid([0xEC, 0x7F, 0x03, 0x00, 0x84, 0x03, 0x00]);

	trackFrameTiming(startedAt, now);
}

// A frame that takes longer to push than the interval between frames means the
// controller is armed continuously with no slack, which is the state where the
// fallback shows up. Surfacing it makes the difference between "it glitches
// sometimes" and a number that can be tuned against.
let slowFrames = 0;
let frameCount = 0;
let worstFrameMs = 0;

function trackFrameTiming(startedAt, scheduledAt) {
	const elapsed = Date.now() - startedAt;
	const budget = 1000 / Math.max(1, Number(lcdFps) || 10);

	frameCount++;
	if (elapsed > worstFrameMs) worstFrameMs = elapsed;
	if (elapsed > budget) slowFrames++;

	if (frameCount % 300 === 0) {
		device.log(`[Ryujin II LCD] ${frameCount} frames, ${slowFrames} over budget (${Math.round(budget)}ms), worst ${worstFrameMs}ms, ${repeatedFrames} repeated`, { toFile: true });
		worstFrameMs = 0;
	}
}

export function onlcdModeChanged() {
	if (lcdMode === "SignalRGB Canvas") {
		startStream();
	} else {
		playStoredGif();
	}
}

export function Shutdown() {
	if (lcdMode === "Stored GIF") {
		playStoredGif();
	}
}

function startStream() {
	device.clearReadBuffer();
	writeHid([0xEC, 0xD0]);
	device.pause(100);
	writeHid([0xEC, 0x51, 0x20, 0x00, 0x00]);
	device.pause(100);
	writeHid([0xEC, 0x7F, 0x03, 0x00, 0x84, 0x03, 0x00]);
	device.pause(100);
	streamReady = true;
	device.log("[Ryujin II LCD] SignalRGB 320x240 live stream initialized");
}

function playStoredGif() {
	streamReady = false;
	writeHid([0xEC, 0xD0]);
	device.pause(100);
	writeHid([0xEC, 0x82, 0x00]);
	device.pause(100);
	writeHid([0xEC, 0x5D, 0x00, 0x01, 0x10, 0x01, 0x00, 0x05]);
	device.pause(100);
	writeHid([0xEC, 0x51, 0x10, 0x01, 0x00]);
	device.log("[Ryujin II LCD] Stored GIF slot 0 selected");
}

function writeHid(command) {
	device.write(command, 65);
}
