---
name: Device report
about: A device that does not work, or one you want added
title: "[device] "
labels: device
---

**Device and IDs**
Name, and USB VID:PID or PCI vendor/device/subsystem if you have them.
Windows Device Manager shows USB IDs under Details -> Hardware Ids.

**Firmware / vendor software version**
The product string often carries it, e.g. `LianLi-UNI FAN-SL-v1.8`.

**What happens**
What the lighting or screen actually does, not just "does not work". Frozen on
one colour, only the first device in a chain responds, and reverts to a factory
animation are all different faults with different causes.

**Does the vendor software work?**
Important. If the vendor app drives it correctly, the hardware is fine and it is
a protocol problem, which is solvable.

**SignalRGB log**
From `%LOCALAPPDATA%\WhirlwindFX\SignalRgb\Logs`. Attach the newest file, or the
lines mentioning your device.
