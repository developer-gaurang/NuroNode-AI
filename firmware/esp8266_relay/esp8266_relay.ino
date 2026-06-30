#include <ESP8266WiFi.h>
#include <espnow.h>

/*
  NuroNode Home Automation Receiver
  Board: NodeMCU ESP8266
  Relay Module: 4 Channel Relay Module
  Communication: ESP-NOW and Arduino Serial Monitor
*/

// =========================
// Firmware Configuration
// =========================
const char DEVICE_NAME[] = "NuroNode Home Automation";
const char FIRMWARE_VERSION[] = "1.0.0";
const unsigned long SERIAL_BAUD_RATE = 115200;
const unsigned long STARTUP_DELAY_MS = 1000;
const unsigned long WIFI_SETTLE_DELAY_MS = 100;
const unsigned long TEST_RELAY_DELAY_MS = 700;
const unsigned long RESTART_DELAY_MS = 500;
const uint8_t ESP_NOW_SUCCESS = 0;

// Most 4-channel relay modules for NodeMCU are active LOW.
const uint8_t RELAY_ON_LEVEL = LOW;
const uint8_t RELAY_OFF_LEVEL = HIGH;

// =========================
// ESP-NOW Packet Definition
// =========================
typedef struct {
  char command[20];
} NuroCommand;

NuroCommand incomingPacket;

// =========================
// Relay Device Definition
// =========================
struct RelayDevice {
  const char *name;
  const char *onCommand;
  const char *offCommand;
  uint8_t pin;
  bool isOn;
};

RelayDevice relayDevices[] = {
  {"LIGHT", "LIGHT_ON", "LIGHT_OFF", D1, false},
  {"FAN", "FAN_ON", "FAN_OFF", D2, false},
  {"TV", "TV_ON", "TV_OFF", D5, false},
  {"SOCKET", "SOCKET_ON", "SOCKET_OFF", D6, false}
};

const uint8_t RELAY_COUNT = sizeof(relayDevices) / sizeof(relayDevices[0]);

bool espNowReady = false;
bool wifiReady = false;
bool relayReady = false;
unsigned long lastPacketTime = 0;
String lastCommand = "NONE";

// =========================
// Utility Helpers
// =========================
String normalizeCommand(String command) {
  command.trim();
  command.toUpperCase();
  return command;
}

void printDivider() {
  Serial.println("--------------------------------");
}

void printMacAddress() {
  Serial.print("MAC Address: ");
  Serial.println(WiFi.macAddress());
}

const char *onOffText(bool state) {
  return state ? "ON" : "OFF";
}

void printMemoryUsage() {
  Serial.print("Memory Usage - Free Heap: ");
  Serial.print(ESP.getFreeHeap());
  Serial.println(" bytes");
}

void printWifiStatus() {
  Serial.print("WiFi Status: ");
  Serial.println(WiFi.status() == WL_CONNECTED ? "Connected" : "Not connected");

  Serial.print("WiFi Mode: ");
  WiFiMode_t mode = WiFi.getMode();
  if (mode == WIFI_STA) {
    Serial.println("WIFI_STA");
  } else if (mode == WIFI_AP) {
    Serial.println("WIFI_AP");
  } else if (mode == WIFI_AP_STA) {
    Serial.println("WIFI_AP_STA");
  } else {
    Serial.println("WIFI_OFF");
  }
}

void printEspNowStatus() {
  Serial.print("ESP-NOW Status: ");
  Serial.println(espNowReady ? "Ready" : "Not ready");
}

void printRelayState(const RelayDevice &device) {
  Serial.print(device.name);
  Serial.print(": ");
  Serial.println(onOffText(device.isOn));
}

void printAllRelayStates() {
  Serial.println("All Relay States:");
  for (uint8_t index = 0; index < RELAY_COUNT; index++) {
    Serial.print("  Relay ");
    Serial.print(index + 1);
    Serial.print(" - ");
    printRelayState(relayDevices[index]);
  }
}

void printPacketSender(uint8_t *mac) {
  Serial.printf(
    "Packet Received From: %02X:%02X:%02X:%02X:%02X:%02X\n",
    mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]
  );
}

// =========================
// Relay Control
// =========================
void applyRelayState(uint8_t relayIndex, bool turnOn) {
  if (relayIndex >= RELAY_COUNT) {
    Serial.println("Relay Error: Invalid relay index");
    return;
  }

  RelayDevice &device = relayDevices[relayIndex];
  digitalWrite(device.pin, turnOn ? RELAY_ON_LEVEL : RELAY_OFF_LEVEL);
  device.isOn = turnOn;

  Serial.print("Relay Changed: Relay ");
  Serial.print(relayIndex + 1);
  Serial.print(" ");
  Serial.print(device.name);
  Serial.print(" ");
  Serial.println(onOffText(device.isOn));

  Serial.print(device.name);
  Serial.print(" ");
  Serial.println(onOffText(device.isOn));

  Serial.print("Relay ");
  Serial.print(relayIndex + 1);
  Serial.println(turnOn ? " Activated" : " Deactivated");
}

void setAllRelays(bool turnOn) {
  for (uint8_t index = 0; index < RELAY_COUNT; index++) {
    applyRelayState(index, turnOn);
  }

  Serial.print("All Relays ");
  Serial.println(turnOn ? "Activated" : "Deactivated");
}

void toggleRelayState(uint8_t relayIndex) {
  if (relayIndex >= RELAY_COUNT) {
    Serial.println("Relay Error: Invalid relay index");
    return;
  }

  bool nextState = !relayDevices[relayIndex].isOn;
  applyRelayState(relayIndex, nextState);

  Serial.print("Relay ");
  Serial.print(relayIndex + 1);
  Serial.print(" -> ");
  Serial.println(onOffText(relayDevices[relayIndex].isOn));
}

bool initializeRelays() {
  Serial.println("Relay Initialization Started");

  for (uint8_t index = 0; index < RELAY_COUNT; index++) {
    pinMode(relayDevices[index].pin, OUTPUT);
    digitalWrite(relayDevices[index].pin, RELAY_OFF_LEVEL);
    relayDevices[index].isOn = false;

    Serial.print("Relay ");
    Serial.print(index + 1);
    Serial.print(" Ready: ");
    Serial.println(relayDevices[index].name);
  }

  relayReady = true;
  Serial.println("Relay Ready");
  return true;
}

void runRelaySelfTest() {
  Serial.println("TEST_ALL Started");

  for (uint8_t index = 0; index < RELAY_COUNT; index++) {
    Serial.print("Testing Relay ");
    Serial.print(index + 1);
    Serial.print(" - ");
    Serial.println(relayDevices[index].name);

    applyRelayState(index, true);
    delay(TEST_RELAY_DELAY_MS);
    applyRelayState(index, false);
    delay(TEST_RELAY_DELAY_MS);
  }

  Serial.println("TEST_ALL Complete");
}

// =========================
// Command Responses
// =========================
void printHelp() {
  Serial.println("Supported Commands:");
  Serial.println("HELP");
  Serial.println("STATUS");
  Serial.println("PING");
  Serial.println("VERSION");
  Serial.println("MAC");
  Serial.println("RESTART");
  Serial.println("TEST_ALL");
  Serial.println("ALL_ON");
  Serial.println("ALL_OFF");
  Serial.println("FORWARD");
  Serial.println("LEFT");
  Serial.println("RIGHT");
  Serial.println("BACKWARD");
  Serial.println("STOP");
  Serial.println("EMERGENCY_STOP");

  for (uint8_t index = 0; index < RELAY_COUNT; index++) {
    Serial.println(relayDevices[index].onCommand);
    Serial.println(relayDevices[index].offCommand);
  }
}

void printVersion() {
  Serial.print("Firmware Version: ");
  Serial.println(FIRMWARE_VERSION);
}

void printStatus() {
  Serial.println("Current Status");
  printDivider();
  Serial.print("Device Name: ");
  Serial.println(DEVICE_NAME);
  printVersion();
  printMacAddress();
  printWifiStatus();
  printEspNowStatus();
  printMemoryUsage();
  Serial.print("Last Command: ");
  Serial.println(lastCommand);
  Serial.print("Last Packet Time: ");
  Serial.print(lastPacketTime);
  Serial.println(" ms");
  printAllRelayStates();
  printDivider();
}

void restartDevice() {
  Serial.println("Restart Requested");
  Serial.println("Restarting ESP8266...");
  delay(RESTART_DELAY_MS);
  ESP.restart();
}

// =========================
// Command Processing
// =========================
void printMappedCommandHeader(const char *source, const String &command) {
  Serial.print(source);
  Serial.print(" Command Received : ");
  Serial.println(command);
}

void printRelayMapping(uint8_t relayIndex) {
  Serial.print("Mapped To : Relay ");
  Serial.println(relayIndex + 1);
}

bool processNuroSyncCommand(const String &command, const char *source) {
  if (command == "FORWARD") {
    printMappedCommandHeader(source, command);
    printRelayMapping(0);
    toggleRelayState(0);
    return true;
  }

  if (command == "LEFT") {
    printMappedCommandHeader(source, command);
    printRelayMapping(1);
    toggleRelayState(1);
    return true;
  }

  if (command == "RIGHT") {
    printMappedCommandHeader(source, command);
    printRelayMapping(2);
    toggleRelayState(2);
    return true;
  }

  if (command == "BACKWARD") {
    printMappedCommandHeader(source, command);
    printRelayMapping(3);
    toggleRelayState(3);
    return true;
  }

  if (command == "STOP" || command == "EMERGENCY_STOP") {
    printMappedCommandHeader(source, command);
    setAllRelays(false);
    Serial.println("All Relays OFF");
    return true;
  }

  return false;
}

bool processRelayCommand(const String &command) {
  if (command == "ALL_ON") {
    setAllRelays(true);
    return true;
  }

  if (command == "ALL_OFF") {
    setAllRelays(false);
    return true;
  }

  for (uint8_t index = 0; index < RELAY_COUNT; index++) {
    if (command == relayDevices[index].onCommand) {
      applyRelayState(index, true);
      return true;
    }

    if (command == relayDevices[index].offCommand) {
      applyRelayState(index, false);
      return true;
    }
  }

  return false;
}

bool executeCommand(String rawCommand, const char *source) {
  String command = normalizeCommand(rawCommand);

  if (command.length() == 0) {
    return false;
  }

  Serial.print("Command Source: ");
  Serial.println(source);
  Serial.print("Command Received: ");
  Serial.println(command);

  lastCommand = command;

  if (command == "HELP") {
    printHelp();
    return true;
  }

  if (command == "STATUS") {
    printStatus();
    return true;
  }

  if (command == "PING") {
    Serial.println("PONG");
    return true;
  }

  if (command == "VERSION") {
    printVersion();
    return true;
  }

  if (command == "MAC") {
    printMacAddress();
    return true;
  }

  if (command == "RESTART") {
    restartDevice();
    return true;
  }

  if (command == "TEST_ALL") {
    runRelaySelfTest();
    return true;
  }

  if (processNuroSyncCommand(command, source)) {
    return true;
  }

  if (processRelayCommand(command)) {
    return true;
  }

  Serial.print("Unknown Command: ");
  Serial.println(command);
  return false;
}

// =========================
// ESP-NOW Handling
// =========================
void onEspNowReceive(uint8_t *mac, uint8_t *data, uint8_t len) {
  if (data == NULL || len == 0) {
    Serial.println("Invalid Packet: Empty ESP-NOW payload");
    return;
  }

  memset(&incomingPacket, 0, sizeof(incomingPacket));
  uint8_t copyLength = len < sizeof(incomingPacket) ? len : sizeof(incomingPacket) - 1;
  memcpy(&incomingPacket, data, copyLength);
  incomingPacket.command[sizeof(incomingPacket.command) - 1] = '\0';

  lastPacketTime = millis();
  printPacketSender(mac);

  bool handled = executeCommand(String(incomingPacket.command), "ESP-NOW");
  if (!handled) {
    Serial.print("Invalid Packet Ignored: ");
    Serial.println(incomingPacket.command);
  }
}

bool initializeEspNow() {
  Serial.println("ESP-NOW Initialization Started");

  if (esp_now_init() != ESP_NOW_SUCCESS) {
    Serial.println("ESP-NOW Error: Initialization failed");
    espNowReady = false;
    return false;
  }

  esp_now_set_self_role(ESP_NOW_ROLE_SLAVE);

  if (esp_now_register_recv_cb(onEspNowReceive) != ESP_NOW_SUCCESS) {
    Serial.println("ESP-NOW Error: Receive callback registration failed");
    espNowReady = false;
    return false;
  }

  espNowReady = true;
  Serial.println("ESP-NOW Ready");
  return true;
}

bool initializeWifi() {
  Serial.println("WiFi Initialization Started");
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(WIFI_SETTLE_DELAY_MS);

  if (WiFi.getMode() != WIFI_STA) {
    Serial.println("WiFi Error: Failed to enter station mode");
    wifiReady = false;
    return false;
  }

  wifiReady = true;
  Serial.println("WiFi Ready");
  return true;
}

// =========================
// Startup Output
// =========================
void printStartupBanner() {
  printDivider();
  Serial.println(DEVICE_NAME);
  printVersion();
  Serial.println("Device Ready");
  Serial.println(wifiReady ? "WiFi Ready" : "WiFi Not Ready");
  Serial.println(espNowReady ? "ESP-NOW Ready" : "ESP-NOW Not Ready");
  Serial.println(relayReady ? "Relay Ready" : "Relay Not Ready");
  printMacAddress();
  Serial.println("Waiting for Commands...");
  printDivider();
}

// =========================
// Arduino Lifecycle
// =========================
void setup() {
  Serial.begin(SERIAL_BAUD_RATE);
  delay(STARTUP_DELAY_MS);

  initializeRelays();

  if (!initializeWifi()) {
    Serial.println("WiFi Failure: ESP-NOW may not operate correctly");
  }

  if (!initializeEspNow()) {
    Serial.println("ESP-NOW Failure: Serial test mode remains available");
  }

  printStartupBanner();
}

void loop() {
  if (Serial.available() > 0) {
    String serialCommand = Serial.readStringUntil('\n');
    bool handled = executeCommand(serialCommand, "Serial");

    if (!handled) {
      Serial.println("Invalid command. Type HELP for supported commands.");
    }
  }
}
