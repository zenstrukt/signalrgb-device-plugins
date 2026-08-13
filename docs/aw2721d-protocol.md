# Alienware AW2721D — AlienFX protocol

Reverse-engineered by tracing Alienware Command Center's `AlienFXSubAgent.exe`
with Frida, hooking `WriteFile`, `HidD_SetFeature`, `HidD_SetOutputReport` and
`DeviceIoControl`.

**Monitor:** Alienware AW2721D, 27" 2560x1440
**HID:** `187C:1009`, usage page `0xFF00`, usage `0x0001`, interface 0
**Zones:** 4 — Logo, Stand, Downlight, Power Button
**Report size:** 65 bytes

The USB parent enumerates as a Microchip hub controller (the monitor's built-in
USB hub); the AlienFX endpoint is the HID child of it, named "Alienware 27
Gaming Monitor".

OpenRGB supports the AW3225QF (`0x1013`) and AW3423DWF (`0x100E`) but not this
panel. The static-colour command below is byte-identical to the AW3225QF's, so
that family framing carries back at least two generations.

**There is no login handshake.** The AW3423DWF requires a challenge-response
(`40 E1 01` out, response back, `40 E1 02` with a derived key) before it accepts
anything. Nothing resembling that appeared anywhere in the capture, and colour
writes land on their own.

## Packet format

Every command is a DDC/CI block wrapped in a 65-byte HID report, padded to
`0xFF`:

```
00 92 37 <block_len> 00 51 <0x80|n> D0 <opcode> <zone> <payload...> <checksum>
```

| Byte | Value |
| --- | --- |
| 0 | `0x00` report id |
| 1–2 | `0x92 0x37` |
| 3 | block length — also fixes the checksum position |
| 4 | `0x00` |
| 5 | `0x51` DDC source address |
| 6 | `0x80 \| payload length` |
| 7 | `0xD0` vendor opcode |
| 8 | sub-opcode — `0x01` effect, `0x02`, `0x04` static colour |
| 9 | zone mask |
| 10.. | payload |
| `4 + byte[3]` | checksum |

### Checksum

Seed `0x6E`, XOR every byte from index 5 up to the checksum's own position:

```c
unsigned char checksum = 0x6E;
unsigned int index = 4 + packet[3];
for (unsigned int i = 5; i < index; i++) checksum ^= packet[i];
packet[index] = checksum;
```

Verified against all 51 captured packets. Because the position follows the block
length, it has to be computed rather than hardcoded per command.

### Zone mask

A 4-bit mask, `0x0F` for all zones. Masks observed in the capture: `0x01`,
`0x03`, `0x07`, `0x08`, `0x0E`, `0x0F` — AWCC sends cumulative selections as
zones are toggled in its UI, which is what proves it is a mask and not an index.

Which bit drives which physical light was not isolated; the plugin exposes a
zone-order setting rather than asserting a mapping it cannot back up.

## Commands

### `D0 F4` — direct/software mode

SignalRGB must put the monitor into direct mode before streaming colours:

```
00 92 37 05 00 51 82 D0 F4 99
```

Without this command, the monitor may accept an individual colour write but
remain governed by its onboard AlienFX state. The plugin sends direct mode once
during initialization, waits 50ms, then starts `D0 04` updates.

### `D0 04` — static colour

```
00 92 37 0A 00 51 87 D0 04 <zone> <r> <g> <b> <brightness> <cksum>
```

Brightness is `0x00`–`0x64` (0–100) and is carried in the colour packet, so it
goes on every write rather than being set once.

Captured examples, all reproduced byte-for-byte by the plugin:

```
00 92 37 0a 00 51 87 d0 04 0f ff 00 00 64 f8    all zones, red
00 92 37 0a 00 51 87 d0 04 0f 00 00 ff 64 f8    all zones, blue
00 92 37 0a 00 51 87 d0 04 0f 17 ff 15 64 fa    all zones, green
```

The monitor wants roughly 50ms between writes. SignalRGB's render loop can run
much faster, so the plugin retains only the newest colour requested for each
zone and sends at most one HID packet per 50ms interval. Zones requesting the
same colour are combined into one mask and updated atomically.

### `D0 01` — onboard effect

```
00 92 37 0F 00 51 8C D0 01 <zone> <r1> <g1> <b1> <r2> <g2> <b2> <bright> <effect> <tempo> <cksum>
```

Two colours, brightness `0x00`–`0x64`, an effect id and a tempo. Brightness and
tempo were both confirmed by sweeping each control to its extremes and watching
one byte move: brightness `0x00` / `0x08` / `0x55` / `0x64`, tempo `0x0A` /
`0x14` / `0x1E`.

Only effect id `0x02` was captured. AWCC exposes Color, Breathing, Pulse, Morph,
Spectrum and Theme, so the remaining ids are still unknown — the effect changes
in that capture pass did not produce distinct ids in this command.

A SignalRGB plugin does not need them: the onboard effects are what it replaces.

### `D0 02`

```
00 92 37 0B 00 51 88 D0 02 <zone> <r> <g> <b> 64 06 <cksum>
```

Seen once, with a `0x06` trailer. Purpose not established.
