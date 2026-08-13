# Ryujin II LCD protocol notes

## Device

- Product: ASUS ROG Ryujin II
- USB VID/PID: `0B05:1988`
- Tested firmware string: `AURJ1-S750-0104`
- HID control interface: interface 1, usage `0x00A1`, usage page `0xFF72`
- WinUSB media interface: interface 0
- Bulk OUT endpoint: `0x01`, maximum USB packet 512 bytes
- Bulk IN endpoint: `0x81`
- LCD resolution: 320x240

All HID commands are written in a 65-byte zero-filled output buffer beginning with `0xEC`.

## Live SignalRGB frame stream

Initialize live mode:

```text
EC D0
EC 51 20 00 00
EC 7F 03 00 84 03 00
```

`0x00038400` is 230,400 bytes: `320 * 240 * 3`.

For each frame:

1. Obtain RGB888 from SignalRGB's LCD canvas.
2. Convert RGB888 to BGR888.
3. Write to bulk endpoint `0x01` in 4096-byte transfers.
4. Send the final transfer at the exact remaining length (1024 bytes for a 230,400-byte frame).
5. Send `EC 7F 03 00 84 03 00` to commit the frame and announce the next frame.

## Persistent GIF upload (reverse-engineering validation)

The persistent-media path was used to validate the transport independently of SignalRGB:

```text
EC 73 FF                 close/clear interrupted file operation
EC 72 01 02 <slot>      select writable GIF slot
EC 73 01                 create/write
EC 7F 02 <length-le32>   announce GIF byte length
<bulk data on 0x01>
EC 73 FF                 close/commit file operation
```

Expected acknowledgements:

- File operation: `EE 13 00 <operation>`
- Each bulk block: `EE 14 00 <accepted-length-le32>`

The crucial finding was that ASUS sends the last media block at its exact remaining byte count. Padding it to 4096 bytes can leave the media player frozen even though every bulk block receives an acknowledgement.

Select persistent GIF slot 0:

```text
EC D0
EC 82 00
EC 5D 00 01 10 01 00 05
EC 51 10 01 00
```

## Known conflict

Armoury Crate and its helper/services can hold the same interfaces or overwrite playback mode. SignalRGB should own the device while native LCD streaming is active.

