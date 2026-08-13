# GALAX RTX 4090 SG — SMBus lighting protocol

Reverse-engineered from GALAX Xtreme Tuner 1.1.0.4 by tracing `NvAPI_GPU_I2CWrite`
and `NvAPI_GPU_I2CWriteEx` with Frida, then confirmed by reading the controller's
register file back over SignalRGB's SMBus API.

**Card:** GALAX GeForce RTX 4090 SG 1-Click OC
**PCI:** `10DE:2684` / subsystem `10DE:167C`
**Bus:** NVIDIA I2C, DDC port 2, `portId` 1
**Address:** raw `0xA0` (NVAPI) = `0x50` 7-bit (OpenRGB / SignalRGB)

Xtreme Tuner runs as a 32-bit process, so its `NV_I2C_INFO_V3` version field is
`0x3002C` (struct size 44). A 64-bit caller must compute its own size — copying
the constant will fail.

## Register map

Read back with a single-byte read per register. `--` means the register did not
respond.

```
0x00: 01 08 2c 16 75 ff 00 00 ff 80 00 ff ff 00 00 ff
0x10: 00 00 ff ff 00 00 ff ff 00 ff 00 90 ff 00 00 ff
0x20: 00 09 01 09 05 00 00 01 00 00 00 00 ff 03 01 13
0x30: 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
0x40: ff 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
0x50: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
0x60: ff ff 00 00 00 00 00 00 00 00 00 00 00 00 00 00
0x70: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
```

| Register | Width | Meaning |
| --- | --- | --- |
| `0x00` | 1 | Protocol/device revision |
| `0x01` | 1 | Palette slot count (observed `0x08`) |
| `0x02`–`0x04` | 3 | Base colour, R/G/B. Used by static and single-colour effects |
| `0x05`–`0x19` | 21 | Palette ramp, 7 RGB triplets. Swept by the rainbow-style effects |
| `0x1A`–`0x1F` | 6 | **User colours**, 2 RGB triplets. Read by the one- and two-colour effects |
| `0x21`–`0x24` | 1–4 | Effect parameter block. Length is effect-specific; byte 0 is speed |
| `0x27` | 1 | External/motherboard sync (`0x00` off, `0x01` on) |
| `0x2B` | 1 | Zone select. Always `0x00` in every capture — the card is single-zone |
| `0x2D` | 1 | Brightness, `0x00`–`0x03` |
| `0x30` | 1 | Effect/mode id |
| `0x40` | 1 | Save. Write `0x5A` |

### The palette is the important part

There is **no per-LED frame buffer**. The host cannot paint the card directly,
which is why OpenRGB models it as `ZONE_TYPE_SINGLE` / `leds_max 1`.

What it does have is the nine-slot colour table at `0x05`–`0x1F`. The card's own
controller renders the motion; the palette supplies the colours, and the palette
is host-writable. That is the route to a canvas-driven gradient.

Two things matter when writing it:

- **Write `0x1A` as its own transaction.** Xtreme Tuner writes exactly six bytes
  there and never writes `0x05` at all. Sending all nine slots as one 27-byte
  block recolours the ramp but does **not** reach `0x1A`, so the effects that
  read the user slots keep showing factory colours.
- **`0x40 = 0x5A` is a save, not a latch.** The colour registers apply on their
  own. Xtreme Tuner only issues it on an explicit Apply, and OpenRGB exposes it
  behind `MODE_FLAG_MANUAL_SAVE`. Issuing it per rendered frame would reach
  typical EEPROM endurance in hours.

## Effect ids

Captured by clicking every tile on the Xtreme Tuner RGB page. The parameter
block length varies per effect — writing a fixed three bytes is wrong for most
of them.

| Id | Hex | Params | Colour source |
| --- | --- | --- | --- |
| 1 | `0x01` | — | `0x02` (static) |
| 2 | `0x02` | `06 00` | ramp |
| 3 | `0x03` | `00 01` | ramp |
| 4 | `0x04` | `02 02 04 05` | ramp |
| 18 | `0x12` | `01 10 06` | ramp |
| 19 | `0x13` | `04 00` | ramp |
| 20 | `0x14` | `01 01` | ramp |
| 21 | `0x15` | `03 02` | ramp |
| 22 | `0x16` | `09 01 09` | ramp |
| 23 | `0x17` | `01 01` | ramp |
| 24 | `0x18` | `00 00` | ramp |
| 25 | `0x19` | — | off |
| 32 | `0x20` | `01` | **user colours (`0x1A`)** |
| 33 | `0x21` | `01` | **user colours (`0x1A`)** |
| 34 | `0x22` | `01` | **user colours (`0x1A`)** |
| 35 | `0x23` | `03` / `09` | ramp |
| 36 | `0x24` | `05` | ramp |
| 37 | `0x25` | `06` | ramp |
| 38 | `0x26` | `01` | ramp |
| 39 | `0x27` | `00 00` | `0x02` base colour |
| 40 | `0x28` | `04 04` | ramp |
| 41 | `0x29` | `08 08` | ramp |

Ids `1`, `2`, `22` and `25` match OpenRGB's independently derived `STATIC`,
`BREATHING`, `RAINBOW` and `OFF` values, which is a useful cross-check that the
rest of the table is sound.

Several animated effects pulse in firmware. There is no parameter that disables
the pulse — if a steady output is wanted, hold the card in static mode (`0x30 =
0x01`) and let the palette carry the gradient.

## Writing a frame

Steady state is a single three-byte colour write. Mode, zone, brightness and the
parameter block only need writing when they change.

```
mode change:   0x21 <params>   0x30 <mode>   0x2B 00   0x2D <brightness>   0x40 5A
palette:       0x05 <21 bytes ramp>          0x1A <6 bytes user colours>
per frame:     0x02 <r g b>
```
