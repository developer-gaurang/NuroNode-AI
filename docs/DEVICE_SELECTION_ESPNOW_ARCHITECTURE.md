# NuroNode Device Selection and ESP-NOW Routing

## Overview

NuroNode now treats the ESP32-S3 headband as the wireless master for assistive devices. The desktop app only selects the active receiver over USB serial. Blink detection, calibration, filtering, Nurosync telemetry, and threshold behavior remain in the headband firmware.

```text
NuroNode Desktop App
  -> USB Serial DEVICE:* command
ESP32-S3 Headband
  -> ESP-NOW routed command packet
Car ESP32 or Home NodeMCU ESP8266
```

## Desktop Serial Control

The Device Selection page sends these serial commands:

- `DEVICE:CAR` for Mobility Control
- `DEVICE:HOME` for Home Automation
- `DEVICE:BROADCAST` for Emergency Mode / standalone broadcast

The selected device is saved in browser local storage under `nuronode.activeDevice.v1`. If no saved value exists, the app defaults to `DEVICE:BROADCAST`.

While USB is connected, the app refreshes the selected `DEVICE:*` route every 10 seconds. On clean disconnect it sends `DEVICE:BROADCAST` before closing the serial port.

## Headband Routing

The headband firmware stores:

- Car MAC
- Home Automation MAC
- Broadcast MAC
- Active MAC

Blink commands are sent only to the active MAC in selected mode. Broadcast mode sends to `FF:FF:FF:FF:FF:FF`.

If selected USB routing is not refreshed for 15 seconds, the headband switches back to broadcast mode so it can operate without the PC.

## Command Flow

Blink mapping is unchanged:

- 1 blink -> `FORWARD`
- 2 blinks -> `LEFT`
- 3 blinks -> `RIGHT`
- 4 blinks -> `BACKWARD`
- 5+ blinks -> `STOP`
- Long blink -> `EMERGENCY_STOP` and SOS

Long blink is the global emergency override. It is handled from the serial event stream regardless of the current app page or selected receiver.

## Receivers

The car ESP32 receiver continues to execute mobility commands and emergency stop packets.

The home NodeMCU ESP8266 receiver now accepts:

- `LIGHT_ON`
- `LIGHT_OFF`
- `FAN_ON`
- `FAN_OFF`
- `SOCKET_ON`
- `SOCKET_OFF`
- `ALL_OFF`
- `STOP`
- `EMERGENCY_STOP`

Relay GPIO actions are intentionally left for the next hardware phase; the current receiver logs command reception and maintains the communication architecture.

## Setup Note

Update `homeMac` in the ESP32-S3 headband sketch after flashing the NodeMCU receiver and reading its `HOME_REAL_MAC` line from serial output.
