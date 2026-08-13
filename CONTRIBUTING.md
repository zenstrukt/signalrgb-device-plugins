# Contributing

## Adding a device

The useful unit of contribution is a **protocol capture**, not a finished
plugin. If you have hardware and can capture what its vendor software does, that
is most of the work — a plugin usually falls out of it.

What a capture needs to be useful:

- The transport. USB control transfers, HID reports, SMBus/I2C, and the exact
  addresses involved.
- One complete transaction per user action. Set a colour, hit apply, capture.
  Change one thing at a time so registers can be attributed.
- The idle traffic too. Polling and keepalives matter — several bugs in this
  repo were the device timing out between frames, not the frames themselves.

Both existing devices were captured with Frida hooking the vendor process. For
SMBus GPUs that means `NvAPI_GPU_I2CWrite` / `NvAPI_GPU_I2CWriteEx`; for USB
devices, the relevant `libusb` or HID entry points.

Put findings in `docs/<device>-protocol.md` with the register map and whatever
is still unknown. Say what you have not confirmed — a documented gap is worth
more than a confident guess.

## Plugin conventions

- Match the surrounding style. These files follow SignalRGB's own plugin
  conventions, including tabs.
- Comments explain **why**, not what. Anything surprising in a protocol needs a
  reason recorded, because the next person will assume it is a mistake and
  "fix" it.
- Do not write registers you have not seen the vendor software write, unless it
  is behind an opt-in setting that says so.
- Watch for save/persist commands. Several controllers expose a
  write-to-EEPROM register that vendor software only issues on an explicit
  apply. Sending it every frame will wear the part out.
- Expose uncertainty as a setting rather than hardcoding a guess. Where two
  documented generations of a device disagree, let the user switch.

## Testing

There is no test harness — it is hardware. Say what you actually verified and
on what firmware. "Works on mine" with a firmware revision is a real data point;
"should work" is not.

For LCD faces, render at the panel's true resolution before submitting. A face
that looks right in a browser window at 1200px wide will not survive 320x240.

## Reporting a device that does not work

Open an issue with the device report template. SignalRGB's log is at:

```
%LOCALAPPDATA%\WhirlwindFX\SignalRgb\Logs
```
