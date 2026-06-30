#include <WiFi.h>
#include <esp_now.h>

#define EOG_PIN 1

// Receiver MAC addresses
uint8_t carMac[] = {0xC0, 0xCD, 0xD6, 0x85, 0xC7, 0x4C};
uint8_t homeMac[] = {0x24, 0x6F, 0x28, 0x00, 0x00, 0x00};
uint8_t broadcastMac[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
uint8_t activeMac[6];

enum DeviceMode {
  DEVICE_MODE_CAR,
  DEVICE_MODE_HOME,
  DEVICE_MODE_BROADCAST
};

DeviceMode activeDeviceMode = DEVICE_MODE_BROADCAST;
const unsigned long USB_DEVICE_MODE_TIMEOUT_MS = 15000;
unsigned long lastDeviceModeCommandTime = 0;
bool selectedModeFromUsb = false;

typedef struct {
  char command[20];
} NuroCommand;

NuroCommand msg;

// Timing and calibration settings
const int SAMPLE_DELAY_MS = 10;
const int CALIBRATION_TIME_MS = 5000;
const int BLINK_THRESHOLD_OFFSET = 700;
const int RELEASE_OFFSET = 120;

const unsigned long COMMAND_COOLDOWN_MS = 1200;
const unsigned long BLINK_SEQUENCE_TIMEOUT_MS = 1500;
const unsigned long LONG_BLINK_MS = 1200;

// Signal variables
int baseline = 0;
int blinkThreshold = 0;
int releaseThreshold = 0;

// Blink detection variables
bool isBlinking = false;
unsigned long blinkStartTime = 0;
unsigned long lastBlinkDetectedTime = 0;
unsigned long lastCommandTime = 0;
int sequenceBlinkCount = 0;

const char* activeReceiverName() {
  if (activeDeviceMode == DEVICE_MODE_CAR) return "CAR";
  if (activeDeviceMode == DEVICE_MODE_HOME) return "HOME";
  return "BROADCAST";
}

void printActiveRoute() {
  Serial.print("Device Mode:");
  Serial.println(activeDeviceMode == DEVICE_MODE_BROADCAST ? "BROADCAST" : "SELECTED");

  Serial.print("Active Receiver:");
  Serial.println(activeReceiverName());

  Serial.print("ESP-NOW Route:");
  Serial.println(activeDeviceMode == DEVICE_MODE_BROADCAST ? "BROADCAST" : "UNICAST");
}

void setActiveDevice(DeviceMode mode, bool fromUsb) {
  activeDeviceMode = mode;
  selectedModeFromUsb = fromUsb && mode != DEVICE_MODE_BROADCAST;
  lastDeviceModeCommandTime = millis();

  if (mode == DEVICE_MODE_CAR) {
    memcpy(activeMac, carMac, 6);
  } else if (mode == DEVICE_MODE_HOME) {
    memcpy(activeMac, homeMac, 6);
  } else {
    memcpy(activeMac, broadcastMac, 6);
  }

  printActiveRoute();
}

// ESP-NOW send callback for ESP32 Arduino Core 3.x
void onSent(const wifi_tx_info_t *tx_info, esp_now_send_status_t status) {
  Serial.print("ESP-NOW Send Status: ");
  Serial.println(status == ESP_NOW_SEND_SUCCESS ? "SUCCESS" : "FAILED");
}

void sendCommand(const char* command) {
  unsigned long now = millis();

  // Safety commands should never be blocked by cooldown
  bool isSafetyCommand =
    strcmp(command, "STOP") == 0 ||
    strcmp(command, "EMERGENCY_STOP") == 0;

  // Cooldown only for movement commands
  if (!isSafetyCommand && now - lastCommandTime < COMMAND_COOLDOWN_MS) {
    return;
  }

  memset(&msg, 0, sizeof(msg));
  strncpy(msg.command, command, sizeof(msg.command) - 1);

  const uint8_t* targetMac = activeDeviceMode == DEVICE_MODE_BROADCAST ? broadcastMac : activeMac;
  esp_err_t result = esp_now_send(targetMac, (uint8_t *)&msg, sizeof(msg));

  Serial.print("Command:");
  Serial.println(command);

  Serial.print("Active Receiver:");
  Serial.println(activeReceiverName());

  Serial.print("ESP-NOW Result:");
  Serial.println(result == ESP_OK ? "OK" : "ERROR");

  lastCommandTime = now;
}

void setupESPNow() {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);

  Serial.print("Headband MAC: ");
  Serial.println(WiFi.macAddress());

  if (esp_now_init() != ESP_OK) {
    Serial.println("ESP-NOW Init Failed");
    return;
  }

  esp_now_register_send_cb(onSent);

  esp_now_peer_info_t carPeer = {};
  memcpy(carPeer.peer_addr, carMac, 6);
  carPeer.channel = 0;
  carPeer.encrypt = false;

  if (esp_now_add_peer(&carPeer) == ESP_OK) {
    Serial.println("Car peer added successfully");
  } else {
    Serial.println("Failed to add car peer");
  }

  esp_now_peer_info_t homePeer = {};
  memcpy(homePeer.peer_addr, homeMac, 6);
  homePeer.channel = 0;
  homePeer.encrypt = false;

  if (esp_now_add_peer(&homePeer) == ESP_OK) {
    Serial.println("Home peer added successfully");
  } else {
    Serial.println("Failed to add home peer");
  }

  esp_now_peer_info_t broadcastPeer = {};
  memcpy(broadcastPeer.peer_addr, broadcastMac, 6);
  broadcastPeer.channel = 0;
  broadcastPeer.encrypt = false;

  if (esp_now_add_peer(&broadcastPeer) == ESP_OK) {
    Serial.println("Broadcast peer added successfully");
  } else {
    Serial.println("Failed to add broadcast peer");
  }

  setActiveDevice(DEVICE_MODE_BROADCAST, false);
}

void calibrateBaseline() {
  Serial.println("Calibration started...");
  Serial.println("Keep eyes open and still. Do not blink.");

  long sum = 0;
  int count = 0;
  unsigned long startTime = millis();

  while (millis() - startTime < CALIBRATION_TIME_MS) {
    int value = analogRead(EOG_PIN);
    sum += value;
    count++;
    delay(10);
  }

  if (count > 0) {
    baseline = sum / count;
  }

  blinkThreshold = baseline + BLINK_THRESHOLD_OFFSET;
  releaseThreshold = baseline + RELEASE_OFFSET;

  isBlinking = false;
  sequenceBlinkCount = 0;

  Serial.println("Calibration complete");

  Serial.print("Baseline:");
  Serial.println(baseline);

  Serial.print("Blink Threshold:");
  Serial.println(blinkThreshold);

  Serial.print("Release Threshold:");
  Serial.println(releaseThreshold);
}

void applyManualThreshold(int newThreshold) {
  if (newThreshold <= 0 || newThreshold > 4095) {
    Serial.print("Threshold update failed. Invalid value:");
    Serial.println(newThreshold);
    return;
  }

  blinkThreshold = newThreshold;

  // Release threshold should remain near baseline
  releaseThreshold = baseline + RELEASE_OFFSET;

  isBlinking = false;
  sequenceBlinkCount = 0;

  Serial.print("Manual threshold updated:");
  Serial.println(blinkThreshold);

  Serial.print("Baseline:");
  Serial.println(baseline);

  Serial.print("Blink Threshold:");
  Serial.println(blinkThreshold);

  Serial.print("Release Threshold:");
  Serial.println(releaseThreshold);
}

void executeBlinkSequence(int count) {
  if (count == 1) {
    sendCommand("FORWARD");
  } 
  else if (count == 2) {
    sendCommand("LEFT");
  } 
  else if (count == 3) {
    sendCommand("RIGHT");
  } 
  else if (count == 4) {
    sendCommand("BACKWARD");
  } 
  else {
    sendCommand("STOP");
  }

  Serial.print("Blink sequence executed: ");
  Serial.println(count);
}

void handleBlink(int rawValue) {
  unsigned long now = millis();

  // Blink starts when raw signal crosses threshold
  if (!isBlinking && rawValue > blinkThreshold) {
    isBlinking = true;
    blinkStartTime = now;
    Serial.println("Blink started");
  }

  // Blink ends when raw signal comes below release threshold
  if (isBlinking && rawValue < releaseThreshold) {
    isBlinking = false;

    unsigned long blinkDuration = now - blinkStartTime;

    // Long blink = emergency stop
    if (blinkDuration >= LONG_BLINK_MS) {
      sendCommand("EMERGENCY_STOP");
      sequenceBlinkCount = 0;
      Serial.println("Long blink detected");
      return;
    }

    // Normal blink
    if (blinkDuration > 40 && blinkDuration < 900) {
      sequenceBlinkCount++;
      lastBlinkDetectedTime = now;

      Serial.print("Blink detected in sequence: ");
      Serial.println(sequenceBlinkCount);
    }
  }

  // Execute blink sequence after timeout
  if (sequenceBlinkCount > 0 && now - lastBlinkDetectedTime > BLINK_SEQUENCE_TIMEOUT_MS) {
    executeBlinkSequence(sequenceBlinkCount);
    sequenceBlinkCount = 0;
  }
}

void handleSerialCommand() {
  if (!Serial.available()) {
    return;
  }

  String cmd = Serial.readStringUntil('\n');
  cmd.trim();

  if (cmd.length() == 0) {
    return;
  }

  String upperCmd = cmd;
  upperCmd.toUpperCase();

  if (upperCmd == "F") {
    sendCommand("FORWARD");
  } 
  else if (upperCmd == "S") {
    sendCommand("STOP");
  } 
  else if (upperCmd == "L") {
    sendCommand("LEFT");
  } 
  else if (upperCmd == "R") {
    sendCommand("RIGHT");
  } 
  else if (upperCmd == "B") {
    sendCommand("BACKWARD");
  } 
  else if (upperCmd == "E") {
    sendCommand("EMERGENCY_STOP");
  } 
  else if (upperCmd == "C") {
    calibrateBaseline();
  } 
  else if (upperCmd == "DEVICE:CAR") {
    setActiveDevice(DEVICE_MODE_CAR, true);
  }
  else if (upperCmd == "DEVICE:HOME") {
    setActiveDevice(DEVICE_MODE_HOME, true);
  }
  else if (upperCmd == "DEVICE:BROADCAST") {
    setActiveDevice(DEVICE_MODE_BROADCAST, false);
  }
  else if (upperCmd.startsWith("T:")) {
    int newThreshold = upperCmd.substring(2).toInt();
    applyManualThreshold(newThreshold);
  } 
  else {
    Serial.print("Unknown serial command:");
    Serial.println(cmd);
  }
}

void maintainStandaloneFallback() {
  if (
    selectedModeFromUsb &&
    millis() - lastDeviceModeCommandTime > USB_DEVICE_MODE_TIMEOUT_MS
  ) {
    Serial.println("USB device mode heartbeat expired. Switching to broadcast fallback.");
    setActiveDevice(DEVICE_MODE_BROADCAST, false);
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(EOG_PIN, INPUT);

  Serial.println("NuroSync Headband Multi Device Master");
  Serial.println("Starting ESP-NOW...");

  setupESPNow();

  // Safety stop at startup
  sendCommand("STOP");

  // Initial baseline calibration
  calibrateBaseline();

  Serial.println("Ready:");
  Serial.println("1 blink = FORWARD");
  Serial.println("2 blinks = LEFT");
  Serial.println("3 blinks = RIGHT");
  Serial.println("4 blinks = BACKWARD");
  Serial.println("5+ blinks = STOP");
  Serial.println("Long blink = EMERGENCY_STOP");
  Serial.println("Serial commands: F/S/L/R/B/E/C");
  Serial.println("Device commands: DEVICE:CAR / DEVICE:HOME / DEVICE:BROADCAST");
  Serial.println("Manual threshold command: T:<value>");
}

void loop() {
  int rawValue = analogRead(EOG_PIN);

  // Telemetry for Python app
  Serial.print("Raw_Signal:");
  Serial.print(rawValue);

  Serial.print(",Baseline:");
  Serial.print(baseline);

  Serial.print(",Blink_Threshold:");
  Serial.println(blinkThreshold);

  handleBlink(rawValue);
  handleSerialCommand();
  maintainStandaloneFallback();

  delay(SAMPLE_DELAY_MS);
}
