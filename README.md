# SignalRGB device plugins

SignalRGB support for hardware it does not ship support for, written from
protocol captures against the vendor software rather than from documentation.

Everything here runs as a **custom plugin** — drop the file in, restart
SignalRGB, done. No forked build, no patched install.

| Device | What works | Status |
| --- | --- | --- |
| ASUS ROG Ryujin II (`0B05:1988`) | 320x240 LCD, live canvas streaming | Working |
| GALAX RTX 4090 SG 1-Click OC (`10DE:2684` / `10DE:167C`) | Lighting, onboard effects, host-written colour palette | Working |

Plus `lcd-faces/`, LCD faces you can use on any SignalRGB device with a screen.

## Why these two

Neither is supported upstream. SignalRGB already maps the Ryujin II's PID for
pump and fan control, but gates the LCD path to the Ryujin III. The GALAX card
has no support at all, and OpenRGB models its whole controller as a single LED.

Both turned out to be more capable than that. The details are in `docs/`.

## Install

Copy the files you want into SignalRGB's user folders and restart it:

```
plugins\*.js          ->  %USERPROFILE%\Documents\WhirlwindFX\Plugins
lcd-faces\*.html      ->  %USERPROFILE%\Documents\WhirlwindFX\LCDFaces
```

Or run `install.ps1`, which copies both and tells you what it placed.

Custom plugins override SignalRGB's built-in mapping for the same VID/PID, so a
device that already half-works upstream will use the file here instead.

### ASUS ROG Ryujin II

Close Armoury Crate and stop its services first — it holds the device. The
plugin lists them under `ConflictingProcesses`, so SignalRGB will warn you.

Open the device, set **LCD Source** to `SignalRGB Canvas`, then pick a face or
upload media through SignalRGB's own LCD interface.

If the factory animation cuts in and out, raise **LCD Frame Rate**. The
controller is armed waiting for a frame between updates, and a long idle gap is
when it falls back to its stored slot.

### GALAX RTX 4090 SG

Close Xtreme Tuner. The card is single-zone over SMBus, but its controller
renders its own effects from a host-writable colour palette, so the plugin can
drive those effects from the SignalRGB canvas.

`Diagnostics -> Dump Register Map` prints the controller's register file to the
SignalRGB log. Useful if you have a different GALAX card and want to check
whether the same map applies.

## LCD faces

`Radial Telemetry.html` — sensor gauge in three layouts (radial, split,
minimal), configurable sensors and scales, a colour ramp that runs accent to
amber to warning as you approach a threshold, live history trace, peak marker,
and slow drift to protect against burn-in on a screen that runs all day.

Set **Backdrop Opacity** below 100 to let the active SignalRGB effect show
through behind the gauge.

## Contributing

New devices, new faces and corrections are all welcome — see `CONTRIBUTING.md`.
If you have a GALAX card that is not the 4090 SG, a register dump is genuinely
useful even if you change nothing else.

## Licence

MIT. See `LICENSE`.

`Lian_Li_Uni_Fans_SL_1.2.js` is not included here — it is a derivative of
WhirlwindFX's own plugin and belongs upstream rather than in this repo.
