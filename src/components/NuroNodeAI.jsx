import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, db, storage } from '../firebase';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

const MAX_POINTS = 220;
const QR_VERSION = 'NURONODE-MEDCARD-V1';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const COMMANDS = {
  F: 'FORWARD',
  L: 'LEFT',
  R: 'RIGHT',
  B: 'BACKWARD',
  S: 'STOP',
  E: 'EMERGENCY_STOP',
  C: 'RECALIBRATE',
};

const DEVICE_STORAGE_KEY = 'nuronode.activeDevice.v1';
const DEVICE_OPTIONS = {
  CAR: {
    id: 'CAR',
    label: 'Mobility Control',
    subtitle: 'Car / Wheelchair',
    serial: 'DEVICE:CAR',
    receiver: 'Car ESP32',
    mode: 'Selected',
  },
  HOME: {
    id: 'HOME',
    label: 'Home Automation',
    subtitle: 'Relay NodeMCU ESP8266',
    serial: 'DEVICE:HOME',
    receiver: 'Home NodeMCU ESP8266',
    mode: 'Selected',
  },
  BROADCAST: {
    id: 'BROADCAST',
    label: 'Emergency Mode',
    subtitle: 'Broadcast to compatible receivers',
    serial: 'DEVICE:BROADCAST',
    receiver: 'ESP-NOW Broadcast',
    mode: 'Broadcast',
  },
};

const SCREENS = [
  { id: 'home', label: 'Dashboard', icon: 'D' },
  { id: 'devices', label: 'Device Selection', icon: 'N' },
  { id: 'signal', label: 'Signal Center', icon: 'S' },
  { id: 'eye', label: 'Eye Control', icon: 'E' },
  { id: 'mobility', label: 'Mobility', icon: 'M' },
  { id: 'patient', label: 'Patient Profile', icon: 'P' },
  { id: 'reports', label: 'Reports + AI', icon: 'R' },
];

const emptyPatient = {
  id: `PAT-${Date.now()}`,
  fullName: '',
  age: '',
  gender: '',
  bloodGroup: '',
  height: '',
  weight: '',
  medicalCondition: '',
  disabilityType: '',
  allergies: '',
  medications: '',
  doctorName: '',
  doctorPhone: '',
  caregiverName: '',
  caregiverPhone: '',
  profilePhoto: '',
  medicalNotes: '',
};

const emptyContact = {
  name: '',
  relationship: '',
  phone: '',
  priority: 1,
};

const emptyTwilio = {
  accountSid: '',
  authToken: '',
  senderNumber: '',
};

const initialSession = {
  id: `NN-${Date.now()}`,
  startedAt: Date.now(),
  raw: [],
  baseline: [],
  threshold: [],
  telemetryHistory: [],
  events: [],
  commands: [],
  parseErrors: 0,
  packets: 0,
  blinks: 0,
  blinkSequences: [],
  lastCommand: 'STOP',
  currentBlinkSequence: 0,
  connectedDevice: 'Nurosync ESP32 Headband',
};

function parseNurosyncLine(line) {
  const text = line.trim();
  if (!text) return { type: 'empty' };

  if (text.startsWith('Command:')) {
    return { type: 'command', command: text.split(':').slice(1).join(':').trim() };
  }

  if (text.startsWith('Blink detected in sequence:')) {
    return { type: 'blink-detected', count: Number(text.split(':').slice(1).join(':').trim()) };
  }

  if (text.startsWith('Blink sequence executed:')) {
    return { type: 'blink-executed', count: Number(text.split(':').slice(1).join(':').trim()) };
  }

  if (text === 'Blink started') return { type: 'event', label: text };
  if (text === 'Long blink detected') return { type: 'long-blink', label: text };

  if (text.includes('Raw_Signal:') && text.includes('Baseline:') && text.includes('Blink_Threshold:')) {
    const values = {};
    text.split(',').forEach((part) => {
      const [key, value] = part.split(':');
      if (key && value) values[key.trim()] = Number(value.trim());
    });

    if ([values.Raw_Signal, values.Baseline, values.Blink_Threshold].every(Number.isFinite)) {
      return {
        type: 'telemetry',
        raw: values.Raw_Signal,
        baseline: values.Baseline,
        threshold: values.Blink_Threshold,
        rawLine: text,
      };
    }
  }

  if (text.startsWith('Manual threshold updated:')) {
    return { type: 'threshold-updated', threshold: Number(text.split(':').slice(1).join(':').trim()) };
  }

  if (text.startsWith('Calibration') || text.startsWith('Baseline:') || text.startsWith('Blink Threshold:') || text.startsWith('Release Threshold:')) {
    return { type: 'calibration-log', label: text };
  }

  if (
    text.startsWith('ESP-NOW') ||
    text.startsWith('Ready:') ||
    text.startsWith('NuroSync') ||
    text.startsWith('Car peer') ||
    text.startsWith('Home peer') ||
    text.startsWith('Device Mode:') ||
    text.startsWith('Active Receiver:') ||
    text.startsWith('ESP-NOW Route:')
  ) {
    return { type: 'system', label: text };
  }

  return { type: 'parse-error', line: text };
}

function formatDuration(startedAt, endedAt = Date.now()) {
  const total = Math.max(0, Math.floor((endedAt - startedAt) / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function formatDateTime(value) {
  return new Date(value).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function signalMetrics(session) {
  const raw = session.raw;
  if (!raw.length) {
    return {
      latest: 0,
      baseline: 0,
      threshold: 0,
      quality: 'Waiting',
      qualityScore: 0,
      noise: 0,
      drift: 0,
      contact: 'No telemetry',
      reliability: 0,
      average: 0,
      peak: 0,
      thresholdMin: 0,
      thresholdMax: 0,
      emergencyStops: 0,
    };
  }

  const latest = raw[raw.length - 1];
  const recent = raw.slice(-80);
  const mean = recent.reduce((sum, item) => sum + item, 0) / recent.length;
  const noise = Math.sqrt(recent.reduce((sum, item) => sum + (item - mean) ** 2, 0) / recent.length);
  const baseline = session.baseline.at(-1) ?? 0;
  const threshold = session.threshold.at(-1) ?? 0;
  const drift = session.baseline.length > 1 ? Math.abs(session.baseline[0] - baseline) : 0;
  const saturated = recent.filter((item) => item <= 10 || item >= 4085).length / recent.length;
  const reliability = clamp(Math.round(100 - Math.min(55, noise / 3) - saturated * 100 - Math.min(20, drift / 40)), 0, 100);
  const quality = reliability >= 82 ? 'Clinical' : reliability >= 60 ? 'Usable' : 'Needs attention';
  const contact = saturated > 0.08 ? 'Check electrode contact' : noise > 180 ? 'High noise' : 'Stable contact';
  const average = raw.reduce((sum, item) => sum + item, 0) / raw.length;
  const peak = Math.max(...raw);
  const thresholdMin = session.threshold.length ? Math.min(...session.threshold) : 0;
  const thresholdMax = session.threshold.length ? Math.max(...session.threshold) : 0;
  const emergencyStops = session.commands.filter((item) => item.command === 'EMERGENCY_STOP').length;

  return {
    latest,
    baseline,
    threshold,
    quality,
    qualityScore: reliability,
    noise,
    drift,
    contact,
    reliability,
    average,
    peak,
    thresholdMin,
    thresholdMax,
    emergencyStops,
  };
}

function buildCaregiverRecommendations(metrics, session, sosEvents) {
  const recs = [];
  if (!session.packets) recs.push('Connect the Nurosync headband and confirm live telemetry before mobility use.');
  if (metrics.contact !== 'Stable contact') recs.push(`${metrics.contact}. Re-seat electrodes and consider recalibration.`);
  if (metrics.reliability > 0 && metrics.reliability < 60) recs.push('Signal reliability is below the safe operating range. Shorten the session and recalibrate.');
  if (metrics.drift > 120) recs.push('Baseline drift is elevated. Run Nurosync recalibration before continuing.');
  if (metrics.emergencyStops || sosEvents.length) recs.push('Review the emergency event and confirm the patient is safe before resuming control.');
  if (!recs.length) recs.push('Session is stable. Continue monitoring blink timing, signal quality, and command history.');
  return recs;
}

function emergencyProfileUrl(patient) {
  const patientId = encodeURIComponent(patient.id || 'nuronode-patient');
  return `${window.location.origin}/medical-profile/${patientId}`;
}

function buildQrPayload(patient, primaryContact) {
  return emergencyProfileUrl(patient);
}

function qrImageUrl(payload, size = 360) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&format=png&data=${encodeURIComponent(payload)}`;
}

function localPhotoKey(uid) {
  return `nuronode.profilePhoto.${uid}`;
}

function loadSavedDeviceId() {
  if (typeof window === 'undefined') return 'BROADCAST';
  const saved = window.localStorage.getItem(DEVICE_STORAGE_KEY);
  return DEVICE_OPTIONS[saved] ? saved : 'BROADCAST';
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Unable to read image file.'));
    reader.readAsDataURL(file);
  });
}

function toCsvValue(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadText(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function StatusPill({ status, tone = 'neutral' }) {
  return (
    <span className={`status-pill ${tone}`}>
      <span />
      {status}
    </span>
  );
}

function Card({ title, value, meta, tone = 'cyan' }) {
  return (
    <section className={`metric-card ${tone}`}>
      <div className="card-label">{title}</div>
      <div className="card-value">{value}</div>
      {meta && <div className="card-meta">{meta}</div>}
    </section>
  );
}

function Panel({ title, right, children, className = '' }) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-header">
        <h2>{title}</h2>
        {right}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function renderMarkdownText(text) {
  if (!text) return null;
  return text.split('\n').map((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return <br key={index} />;
    if (/^#{1,3}\s+/.test(trimmed)) return <strong className="markdown-heading" key={index}>{trimmed.replace(/^#{1,3}\s+/, '')}</strong>;
    if (/^(\d+\.|-)\s+/.test(trimmed)) return <p className="markdown-list" key={index}>{trimmed.replace(/^(\d+\.|-)\s+/, '')}</p>;
    return <p key={index}>{trimmed}</p>;
  });
}

function Field({ label, name, value, onChange, type = 'text', children }) {
  return (
    <label className="form-field">
      <span>{label}</span>
      {children || (
        <input
          type={type}
          name={name}
          value={value}
          onChange={(event) => onChange(name, event.target.value)}
        />
      )}
    </label>
  );
}

function NuroNodeAI() {
  const [activeScreen, setActiveScreen] = useState('home');
  const [activeDeviceId, setActiveDeviceId] = useState(loadSavedDeviceId);
  const [lastDevicePacket, setLastDevicePacket] = useState(() => DEVICE_OPTIONS[loadSavedDeviceId()].serial);
  const [headbandStatus, setHeadbandStatus] = useState('Awaiting serial link');
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState('');
  const [dataStatus, setDataStatus] = useState('Cloud sync ready');
  const [session, setSession] = useState(initialSession);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState('OFFLINE');
  const [logs, setLogs] = useState([
    { type: 'system', text: 'NuroNode AI loaded on Nurosync protocol foundation.' },
    { type: 'system', text: 'Awaiting ESP32 Web Serial connection at 115200 baud.' },
  ]);
  const [reader, setReader] = useState(null);
  const [serialPort, setSerialPort] = useState(null);
  const [clock, setClock] = useState(formatDuration(initialSession.startedAt));
  const [manualThreshold, setManualThreshold] = useState('');
  const [patient, setPatient] = useState(emptyPatient);
  const [contacts, setContacts] = useState([]);
  const [twilio, setTwilio] = useState(emptyTwilio);
  const [sosEvents, setSosEvents] = useState([]);
  const [activeSosId, setActiveSosId] = useState(null);
  const [reports, setReports] = useState([]);
  const [aiInsight, setAiInsight] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessages, setAiMessages] = useState([
    { role: 'assistant', text: 'Ask Gemini for session interpretation, calibration advice, caregiver next steps, or report summaries.' },
  ]);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [fullscreenQr, setFullscreenQr] = useState(false);
  const [medicalRoute, setMedicalRoute] = useState(() => window.location.pathname.startsWith('/medical-profile/'));
  const [publicMedical, setPublicMedical] = useState(null);
  const serialPortRef = useRef(null);
  const readerRef = useRef(null);
  const activeDeviceRef = useRef(DEVICE_OPTIONS[activeDeviceId]);
  const sessionRef = useRef(initialSession);
  const metricsRef = useRef(signalMetrics(initialSession));
  const patientRef = useRef(patient);
  const contactsRef = useRef(contacts);
  const twilioRef = useRef(twilio);
  const sosEventsRef = useRef(sosEvents);

  const metrics = useMemo(() => signalMetrics(session), [session]);
  const primaryContact = useMemo(() => [...contacts].sort((a, b) => Number(a.priority) - Number(b.priority))[0], [contacts]);
  const recommendations = useMemo(() => buildCaregiverRecommendations(metrics, session, sosEvents), [metrics, session, sosEvents]);
  const commandCounts = useMemo(() => {
    return session.commands.reduce((acc, item) => {
      acc[item.command] = (acc[item.command] || 0) + 1;
      return acc;
    }, {});
  }, [session.commands]);
  const activeDevice = DEVICE_OPTIONS[activeDeviceId] || DEVICE_OPTIONS.BROADCAST;

  useEffect(() => {
    activeDeviceRef.current = activeDevice;
    window.localStorage.setItem(DEVICE_STORAGE_KEY, activeDevice.id);
  }, [activeDevice]);
  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { metricsRef.current = metrics; }, [metrics]);
  useEffect(() => { patientRef.current = patient; }, [patient]);
  useEffect(() => { contactsRef.current = contacts; }, [contacts]);
  useEffect(() => { twilioRef.current = twilio; }, [twilio]);
  useEffect(() => { sosEventsRef.current = sosEvents; }, [sosEvents]);

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthLoading(false);
    });
  }, []);

  const loadCloudData = useCallback(async (user) => {
    if (!user) return;
    setDataStatus('Loading secure Firebase data');
    const profileRef = doc(db, 'users', user.uid, 'profile', 'current');
    const contactsRef = collection(db, 'users', user.uid, 'emergency_contacts');
    const settingsRef = doc(db, 'users', user.uid, 'settings', 'current');
    const sosRef = query(collection(db, 'users', user.uid, 'sos_history'), orderBy('timestamp', 'desc'), limit(30));
    const reportsRef = query(collection(db, 'users', user.uid, 'reports'), orderBy('createdAt', 'desc'), limit(30));

    const [profileSnap, contactsSnap, settingsSnap, sosSnap, reportsSnap] = await Promise.all([
      getDoc(profileRef),
      getDocs(contactsRef),
      getDoc(settingsRef),
      getDocs(sosRef),
      getDocs(reportsRef),
    ]);

    const cloudProfile = { ...emptyPatient, id: user.uid, ...(profileSnap.exists() ? profileSnap.data() : {}) };
    const cachedPhoto = window.localStorage.getItem(localPhotoKey(user.uid));
    setPatient({ ...cloudProfile, profilePhoto: cloudProfile.profilePhoto || cachedPhoto || '' });
    setContacts(contactsSnap.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => Number(a.priority) - Number(b.priority)));
    setTwilio({ ...emptyTwilio, ...(settingsSnap.exists() ? settingsSnap.data().twilio || {} : {}) });
    setSosEvents(sosSnap.docs.map((item) => ({ id: item.id, ...item.data() })));
    setReports(reportsSnap.docs.map((item) => ({ id: item.id, ...item.data() })));
    setDataStatus('Firebase sync active');
  }, []);

  useEffect(() => {
    if (!authUser) {
      setPatient(emptyPatient);
      setContacts([]);
      setSosEvents([]);
      setReports([]);
      setAiInsight(null);
      return;
    }
    loadCloudData(authUser).catch((error) => {
      setDataStatus(`Firebase load failed: ${error.message}`);
    });
  }, [authUser, loadCloudData]);

  const addLog = useCallback((text, type = 'system') => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs((prev) => [...prev.slice(-80), { type, text: `[${time}] ${text}` }]);
  }, []);

  const handleAuth = useCallback(async ({ mode, email, password, displayName, rememberMe }) => {
    setAuthMessage('');
    await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
    if (mode === 'signup') {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName) await updateProfile(credential.user, { displayName });
      const profile = { ...emptyPatient, id: credential.user.uid, fullName: displayName || '', email };
      await setDoc(doc(db, 'users', credential.user.uid), { email, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
      await setDoc(doc(db, 'users', credential.user.uid, 'profile', 'current'), profile, { merge: true });
      await setDoc(doc(db, 'users', credential.user.uid, 'settings', 'current'), { createdAt: serverTimestamp() }, { merge: true });
      setPatient(profile);
      setAuthMessage('Account created and linked to Firebase.');
      return;
    }
    await signInWithEmailAndPassword(auth, email, password);
    setAuthMessage('Login successful.');
  }, []);

  const handlePasswordReset = useCallback(async (email) => {
    if (!email) {
      setAuthMessage('Enter your email before requesting a reset link.');
      return;
    }
    await sendPasswordResetEmail(auth, email);
    setAuthMessage('Firebase password reset email sent.');
  }, []);

  const handleLogout = useCallback(async () => {
    await signOut(auth);
    setAuthMessage('Logged out.');
  }, []);

  const savePatientProfile = useCallback(async (profile = patient) => {
    if (!authUser) return;
    const payload = { ...profile, id: authUser.uid, updatedAt: Date.now() };
    await setDoc(doc(db, 'users', authUser.uid), { email: authUser.email, updatedAt: serverTimestamp() }, { merge: true });
    await setDoc(doc(db, 'users', authUser.uid, 'profile', 'current'), payload, { merge: true });
    await setDoc(doc(db, 'public_medical_profiles', authUser.uid), {
      ...payload,
      emergency_contacts: contacts,
      owner_uid: authUser.uid,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    setPatient(payload);
    setDataStatus('Patient profile saved to Firestore');
  }, [authUser, contacts, patient]);

  const saveTwilioSettings = useCallback(async (nextTwilio) => {
    if (!authUser) return;
    await setDoc(doc(db, 'users', authUser.uid, 'settings', 'current'), { twilio: nextTwilio, updatedAt: serverTimestamp() }, { merge: true });
  }, [authUser]);

  const updateDelivery = useCallback((eventId, contactId, patch) => {
    setSosEvents((prev) => prev.map((event) => {
      if (event.id !== eventId) return event;
      return {
        ...event,
        deliveries: event.deliveries.map((delivery) => (
          delivery.contactId === contactId ? { ...delivery, ...patch } : delivery
        )),
      };
    }));
  }, []);

  const sendSmsViaTwilio = useCallback(async (eventId, contact, message) => {
    const cfg = twilioRef.current;
    if (!cfg.accountSid || !cfg.authToken || !cfg.senderNumber) {
      updateDelivery(eventId, contact.id, {
        status: 'Failed',
        detail: 'Twilio configuration missing',
        updatedAt: Date.now(),
      });
      return;
    }

    try {
      updateDelivery(eventId, contact.id, { status: 'Pending', detail: 'Submitting to Twilio', updatedAt: Date.now() });
      const body = new URLSearchParams({
        To: contact.phone,
        From: cfg.senderNumber,
        Body: message,
      });
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${cfg.accountSid}:${cfg.authToken}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body,
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        updateDelivery(eventId, contact.id, {
          status: 'Failed',
          detail: payload.message || `Twilio HTTP ${response.status}`,
          updatedAt: Date.now(),
        });
        return;
      }

      updateDelivery(eventId, contact.id, {
        status: payload.status === 'delivered' ? 'Delivered' : 'Sent',
        detail: payload.sid || 'Submitted to Twilio',
        twilioSid: payload.sid,
        updatedAt: Date.now(),
      });
    } catch (error) {
      updateDelivery(eventId, contact.id, {
        status: 'Failed',
        detail: error.message,
        updatedAt: Date.now(),
      });
    }
  }, [updateDelivery]);

  const triggerSos = useCallback(async (triggeredBy) => {
    const now = Date.now();
    const currentSession = sessionRef.current;
    const currentMetrics = metricsRef.current;
    const currentPatient = patientRef.current;
    const orderedContacts = [...contactsRef.current].sort((a, b) => Number(a.priority) - Number(b.priority));
    const eventId = `SOS-${now}`;
    const signalSnapshot = {
      raw: currentSession.raw.slice(-60),
      baseline: currentSession.baseline.slice(-60),
      threshold: currentSession.threshold.slice(-60),
    };

    let coords = null;
    let locationStatus = 'Unavailable';
    if ('geolocation' in navigator) {
      try {
        coords = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 8000,
            maximumAge: 60000,
          });
        });
        locationStatus = 'Captured';
      } catch (error) {
        locationStatus = error.message || 'Permission denied';
      }
    }

    const lat = coords?.coords?.latitude ?? null;
    const lon = coords?.coords?.longitude ?? null;
    const mapsUrl = lat != null && lon != null ? `https://maps.google.com/?q=${lat},${lon}` : 'Location unavailable';
    const message = [
      'NuroNode Emergency Alert',
      '',
      `Patient: ${currentPatient.fullName || 'Not provided'}`,
      'Emergency detected through NuroNode AI.',
      `Triggered By: ${triggeredBy}`,
      `Time: ${new Date(now).toLocaleTimeString('en-US', { hour12: false })}`,
      `Location: ${mapsUrl}`,
      '',
      'Please contact immediately.',
    ].join('\n');

    const event = {
      id: eventId,
      timestamp: now,
      triggeredBy,
      patient: { ...currentPatient },
      sessionStats: {
        sessionId: currentSession.id,
        startedAt: currentSession.startedAt,
        duration: formatDuration(currentSession.startedAt, now),
        packets: currentSession.packets,
        blinks: currentSession.blinks,
        blinkSequences: currentSession.blinkSequences.slice(-20),
        commands: currentSession.commands.slice(-20),
        parseErrors: currentSession.parseErrors,
        metrics: { ...currentMetrics },
      },
      signalSnapshot,
      location: { lat, lon, mapsUrl, status: locationStatus },
      emergencyPayload: message,
      deliveries: orderedContacts.map((contact) => ({
        contactId: contact.id,
        name: contact.name,
        relationship: contact.relationship,
        phone: contact.phone,
        priority: contact.priority,
        status: 'Pending',
        detail: 'Queued',
        updatedAt: now,
      })),
      resolutionStatus: 'Active',
    };

    setSosEvents((prev) => [event, ...prev].slice(0, 20));
    setActiveSosId(eventId);
    setActiveScreen('home');
    addLog(`SOS event created from ${triggeredBy}.`, 'danger');
    if (authUser) {
      await setDoc(doc(db, 'users', authUser.uid, 'sos_history', eventId), {
        ...event,
        createdAt: serverTimestamp(),
      }, { merge: true });
    }

    if (!orderedContacts.length) {
      updateDelivery(eventId, 'no-contact', { status: 'Failed', detail: 'No contacts configured' });
      return;
    }

    orderedContacts.forEach((contact) => {
      sendSmsViaTwilio(eventId, contact, message);
    });
  }, [addLog, authUser, sendSmsViaTwilio, updateDelivery]);

  const applyParsedLine = useCallback((line) => {
    const parsed = parseNurosyncLine(line);
    const timestamp = Date.now();

    setSession((prev) => {
      if (parsed.type === 'telemetry') {
        const sample = {
          timestamp,
          raw: parsed.raw,
          baseline: parsed.baseline,
          threshold: parsed.threshold,
          rawLine: parsed.rawLine,
        };
        return {
          ...prev,
          raw: [...prev.raw.slice(-(MAX_POINTS - 1)), parsed.raw],
          baseline: [...prev.baseline.slice(-(MAX_POINTS - 1)), parsed.baseline],
          threshold: [...prev.threshold.slice(-(MAX_POINTS - 1)), parsed.threshold],
          telemetryHistory: [...prev.telemetryHistory.slice(-2999), sample],
          packets: prev.packets + 1,
        };
      }

      if (parsed.type === 'command') {
        return {
          ...prev,
          lastCommand: parsed.command,
          commands: [...prev.commands.slice(-119), { time: timestamp, command: parsed.command, source: 'Headband Blink' }],
        };
      }

      if (parsed.type === 'blink-detected') {
        return {
          ...prev,
          blinks: prev.blinks + 1,
          currentBlinkSequence: parsed.count,
          events: [...prev.events.slice(-119), { time: timestamp, label: `${parsed.count} blink sequence detected` }],
        };
      }

      if (parsed.type === 'blink-executed') {
        return {
          ...prev,
          currentBlinkSequence: 0,
          blinkSequences: [...prev.blinkSequences.slice(-59), { time: timestamp, count: parsed.count }],
          events: [...prev.events.slice(-119), { time: timestamp, label: `${parsed.count} blink sequence executed` }],
        };
      }

      if (parsed.type === 'threshold-updated' && Number.isFinite(parsed.threshold)) {
        return {
          ...prev,
          threshold: [...prev.threshold.slice(-(MAX_POINTS - 1)), parsed.threshold],
          events: [...prev.events.slice(-119), { time: timestamp, label: `Manual threshold updated to ${parsed.threshold}` }],
        };
      }

      if (parsed.type === 'long-blink') {
        return {
          ...prev,
          events: [...prev.events.slice(-119), { time: timestamp, label: parsed.label }],
        };
      }

      if (parsed.type === 'event' || parsed.type === 'calibration-log' || parsed.type === 'system') {
        return {
          ...prev,
          events: [...prev.events.slice(-119), { time: timestamp, label: parsed.label }],
        };
      }

      if (parsed.type === 'parse-error') {
        return { ...prev, parseErrors: prev.parseErrors + 1 };
      }

      return prev;
    });

    if (parsed.type === 'command') addLog(`RX Command: ${parsed.command}`, parsed.command === 'EMERGENCY_STOP' ? 'danger' : 'success');
    if (parsed.type === 'parse-error') addLog(`Unparsed firmware line: ${parsed.line}`, 'warning');
    if (parsed.type === 'calibration-log') addLog(parsed.label, 'system');
    if (parsed.type === 'system') setHeadbandStatus(parsed.label);
    if (parsed.type === 'long-blink') triggerSos('Long Blink');
  }, [addLog, triggerSos]);

  const readSerialData = useCallback(async (port) => {
    const portReader = port.readable.getReader();
    readerRef.current = portReader;
    setReader(portReader);
    let buffer = '';

    try {
      while (true) {
        const { value, done } = await portReader.read();
        if (done) break;
        buffer += new TextDecoder().decode(value);
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        lines.forEach((line) => applyParsedLine(line));
      }
    } catch (err) {
      addLog(`Serial link closed: ${err.message}`, 'warning');
    } finally {
      setIsConnected(false);
      setConnectionState('OFFLINE');
      setReader(null);
      readerRef.current = null;
    }
  }, [addLog, applyParsedLine]);

  const writeSerialLine = useCallback(async (line) => {
    const port = serialPortRef.current;
    if (!port?.writable) return false;
    const writer = port.writable.getWriter();
    try {
      await writer.write(new TextEncoder().encode(`${line}\n`));
      return true;
    } finally {
      writer.releaseLock();
    }
  }, []);

  const sendDeviceMode = useCallback(async (device = activeDeviceRef.current, options = {}) => {
    const target = device || DEVICE_OPTIONS.BROADCAST;
    setActiveDeviceId(target.id);
    setLastDevicePacket(target.serial);

    if (!serialPortRef.current?.writable) {
      if (!options.silent) addLog(`${target.serial} queued. Headband will receive it on USB connect.`, 'warning');
      return false;
    }

    try {
      await writeSerialLine(target.serial);
      setHeadbandStatus(`Selected device mode requested: ${target.label}`);
      if (!options.silent) addLog(`TX ${target.serial} for ${target.receiver}.`, target.id === 'BROADCAST' ? 'warning' : 'success');
      return true;
    } catch (err) {
      addLog(`Device selection write failed: ${err.message}`, 'danger');
      return false;
    }
  }, [addLog, writeSerialLine]);

  useEffect(() => {
    if (!isConnected) return undefined;
    const timer = window.setInterval(() => {
      sendDeviceMode(activeDeviceRef.current, { silent: true });
    }, 10000);
    return () => window.clearInterval(timer);
  }, [isConnected, sendDeviceMode]);

  const connectSerial = useCallback(async () => {
    if (!('serial' in navigator)) {
      setConnectionState('UNSUPPORTED');
      addLog('Web Serial is not available. Use Chrome or Edge on localhost.', 'danger');
      return;
    }

    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      serialPortRef.current = port;
      setSerialPort(port);
      setIsConnected(true);
      setConnectionState('LINKED');
      addLog('Connected to Nurosync ESP32 headband at 115200 baud.', 'success');
      readSerialData(port);
      sendDeviceMode(activeDeviceRef.current);
    } catch (err) {
      setConnectionState('ERROR');
      addLog(`Connection failed: ${err.message}`, 'danger');
    }
  }, [addLog, readSerialData, sendDeviceMode]);

  const disconnectSerial = useCallback(async () => {
    try {
      if (serialPortRef.current?.writable) await writeSerialLine(DEVICE_OPTIONS.BROADCAST.serial);
      if (readerRef.current) await readerRef.current.cancel();
      if (serialPortRef.current) await serialPortRef.current.close();
    } catch (err) {
      addLog(`Disconnect warning: ${err.message}`, 'warning');
    }
    readerRef.current = null;
    serialPortRef.current = null;
    setReader(null);
    setSerialPort(null);
    setIsConnected(false);
    setConnectionState('OFFLINE');
    setLastDevicePacket(DEVICE_OPTIONS.BROADCAST.serial);
    setHeadbandStatus('USB disconnected. Headband firmware falls back to broadcast mode.');
    addLog('Serial session released.', 'warning');
  }, [addLog, writeSerialLine]);

  const sendSerialCommand = useCallback(async (command, label = COMMANDS[command] || command) => {
    const port = serialPortRef.current;
    if (!port?.writable) {
      addLog(`Command ${label} blocked: headband is offline.`, 'warning');
      return false;
    }

    try {
      await writeSerialLine(command);
      setSession((prev) => ({
        ...prev,
        lastCommand: label,
        commands: [...prev.commands.slice(-119), { time: Date.now(), command: label, source: 'NuroNode AI Manual Control' }],
      }));
      addLog(`TX ${label} using Nurosync command "${command}".`, label.includes('EMERGENCY') ? 'danger' : 'success');
      return true;
    } catch (err) {
      addLog(`Serial write failed: ${err.message}`, 'danger');
      return false;
    }
  }, [addLog, writeSerialLine]);

  const triggerManualEmergency = useCallback(async () => {
    await sendSerialCommand('E', 'EMERGENCY_STOP');
    triggerSos('Emergency Button');
  }, [sendSerialCommand, triggerSos]);

  const applyThreshold = useCallback(() => {
    const value = Number(manualThreshold);
    if (!Number.isInteger(value) || value < 0 || value > 4095) {
      addLog('Threshold must be an integer from 0 to 4095.', 'warning');
      return;
    }
    sendSerialCommand(`T:${value}`, `THRESHOLD_MANUAL:${value}`);
    setManualThreshold('');
  }, [addLog, manualThreshold, sendSerialCommand]);

  const resolveSos = useCallback((eventId) => {
    setSosEvents((prev) => prev.map((event) => (
      event.id === eventId ? { ...event, resolutionStatus: 'Resolved', resolvedAt: Date.now() } : event
    )));
    addLog('SOS event marked resolved.', 'success');
  }, [addLog]);

  const updatePatient = useCallback((name, value) => {
    setPatient((prev) => ({ ...prev, [name]: value }));
  }, []);

  const updatePatientPhoto = useCallback(async (file) => {
    if (!file) return;
    if (!authUser) {
      setDataStatus('Login required before uploading a profile image');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setDataStatus('Please choose an image file for the patient profile photo');
      return;
    }
    try {
      const previewUrl = await readFileAsDataUrl(file);
      window.localStorage.setItem(localPhotoKey(authUser.uid), previewUrl);
      const previewProfile = { ...patientRef.current, profilePhoto: previewUrl };
      setPatient(previewProfile);
      setDataStatus('Profile preview ready. Uploading to Firebase Storage...');
      const imageRef = ref(storage, `users/${authUser.uid}/profile/${Date.now()}-${file.name}`);
      await uploadBytes(imageRef, file);
      const url = await getDownloadURL(imageRef);
      const next = { ...patientRef.current, profilePhoto: url };
      window.localStorage.setItem(localPhotoKey(authUser.uid), url);
      setPatient(next);
      await savePatientProfile(next);
      setDataStatus('Profile image saved to Firebase Storage');
    } catch (error) {
      await savePatientProfile(patientRef.current);
      setDataStatus(`Firebase Storage upload failed. Local profile photo fallback saved for this user: ${error.message}`);
    }
  }, [authUser, savePatientProfile]);

  const saveContact = useCallback(async (contact) => {
    if (!authUser) return;
    const clean = {
      ...emptyContact,
      ...contact,
      id: contact.id || `CONTACT-${Date.now()}`,
      priority: Number(contact.priority) || contacts.length + 1,
    };
    if (!clean.name || !clean.phone) return;
    setContacts((prev) => {
      const next = prev.some((item) => item.id === clean.id)
        ? prev.map((item) => (item.id === clean.id ? clean : item))
        : [...prev, clean];
      return next.sort((a, b) => Number(a.priority) - Number(b.priority));
    });
    await setDoc(doc(db, 'users', authUser.uid, 'emergency_contacts', clean.id), clean, { merge: true });
    await savePatientProfile({ ...patientRef.current });
  }, [authUser, contacts.length, savePatientProfile]);

  const deleteContact = useCallback(async (id) => {
    if (!authUser) return;
    setContacts((prev) => prev.filter((item) => item.id !== id).map((item, index) => ({ ...item, priority: index + 1 })));
    await deleteDoc(doc(db, 'users', authUser.uid, 'emergency_contacts', id));
    await savePatientProfile({ ...patientRef.current });
  }, [authUser, savePatientProfile]);

  const moveContact = useCallback(async (id, direction) => {
    if (!authUser) return;
    let nextContacts = [];
    setContacts((prev) => {
      const ordered = [...prev].sort((a, b) => Number(a.priority) - Number(b.priority));
      const index = ordered.findIndex((item) => item.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= ordered.length) return prev;
      [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
      nextContacts = ordered.map((item, idx) => ({ ...item, priority: idx + 1 }));
      return nextContacts;
    });
    await Promise.all(nextContacts.map((contact) => setDoc(doc(db, 'users', authUser.uid, 'emergency_contacts', contact.id), contact, { merge: true })));
  }, [authUser]);

  const updateTwilio = useCallback((name, value) => {
    setTwilio((prev) => {
      const next = { ...prev, [name]: value };
      saveTwilioSettings(next).catch((error) => setDataStatus(`Settings save failed: ${error.message}`));
      return next;
    });
  }, [saveTwilioSettings]);

  const buildReportPayload = useCallback(() => {
    const endedAt = Date.now();
    return {
      id: `REPORT-${session.id}-${endedAt}`,
      title: `NuroNode Nurosync Session ${session.id}`,
      createdAtMs: endedAt,
      patient: { ...patient },
      session: {
        id: session.id,
        startedAt: session.startedAt,
        endedAt,
        duration: formatDuration(session.startedAt, endedAt),
        packets: session.packets,
        blinks: session.blinks,
        blinkEvents: session.blinkSequences,
        commands: session.commands,
        rawSignal: session.raw.slice(-220),
        baseline: session.baseline.slice(-220),
        threshold: session.threshold.slice(-220),
        signalQuality: metrics.quality,
      },
      metrics: { ...metrics },
      sosEvents: sosEvents.slice(0, 20),
      recommendations,
    };
  }, [metrics, patient, recommendations, session, sosEvents]);

  const saveCurrentReport = useCallback(async () => {
    if (!authUser) return;
    const payload = buildReportPayload();
    await setDoc(doc(db, 'users', authUser.uid, 'reports', payload.id), {
      ...payload,
      createdAt: serverTimestamp(),
    }, { merge: true });
    setReports((prev) => [payload, ...prev.filter((item) => item.id !== payload.id)].slice(0, 30));
    setDataStatus('Report saved to Firestore');
  }, [authUser, buildReportPayload]);

  const deleteReport = useCallback(async (reportId) => {
    if (!authUser) return;
    await deleteDoc(doc(db, 'users', authUser.uid, 'reports', reportId));
    setReports((prev) => prev.filter((item) => item.id !== reportId));
    setDataStatus('Report deleted from Firestore');
  }, [authUser]);

  const downloadReport = useCallback((report) => {
    downloadText(`${report.id}.json`, JSON.stringify(report, null, 2), 'application/json;charset=utf-8');
  }, []);

  const generateAiInsights = useCallback(async (question = 'Generate full AI Health Insights for this session.') => {
    if (!authUser) return;
    setAiLoading(true);
    setAiMessages((prev) => [...prev, { role: 'user', text: question }]);
    try {
      const token = await authUser.getIdToken();
      const payload = buildReportPayload();
      const response = await fetch(`${API_BASE_URL}/api/ai/session-summary`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          patient_id: authUser.uid,
          session_metrics: {
            raw_signal: payload.session.rawSignal,
            baseline: payload.session.baseline,
            threshold: payload.session.threshold,
            blink_count: payload.session.blinks,
            blink_events: payload.session.blinkEvents,
            signal_quality: payload.session.signalQuality,
            session_duration: payload.session.duration,
            metrics: payload.metrics,
            commands: payload.session.commands.slice(-30),
            sos_events: payload.sosEvents,
          },
          question,
        }),
      });
      const insight = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(insight.detail || `Gemini HTTP ${response.status}`);
      const record = {
        id: `AI-${Date.now()}`,
        provider: insight.provider,
        summary: insight.summary,
        reportId: payload.id,
        createdAtMs: Date.now(),
      };
      await setDoc(doc(db, 'users', authUser.uid, 'ai_history', record.id), {
        ...record,
        createdAt: serverTimestamp(),
      }, { merge: true });
      setAiInsight(record);
      setAiMessages((prev) => [...prev, { role: 'assistant', text: insight.summary, provider: insight.provider }]);
      setDataStatus('Gemini AI Health Insights saved');
    } catch (error) {
      const message = error.message || 'Gemini request failed.';
      setAiInsight({ provider: 'error', summary: message });
      setAiMessages((prev) => [...prev, { role: 'assistant error', text: message, provider: 'Gemini error' }]);
      setDataStatus(`Gemini failed: ${message}`);
    } finally {
      setAiLoading(false);
    }
  }, [authUser, buildReportPayload]);

  const exportCsv = useCallback(() => {
    const headers = ['timestamp', 'raw_signal', 'baseline', 'blink_threshold', 'last_command', 'patient_name', 'session_id'];
    const rows = session.telemetryHistory.map((sample) => [
      new Date(sample.timestamp).toISOString(),
      sample.raw,
      sample.baseline,
      sample.threshold,
      session.lastCommand,
      patient.fullName,
      session.id,
    ]);
    const content = [headers, ...rows].map((row) => row.map(toCsvValue).join(',')).join('\n');
    downloadText(`NuroNode_Session_${session.id}.csv`, content, 'text/csv;charset=utf-8');
  }, [patient.fullName, session]);

  const exportReportHtml = useCallback(async () => {
    const html = document.querySelector('.report-preview')?.outerHTML || '';
    downloadText(`NuroNode_Report_${session.id}.html`, html, 'text/html;charset=utf-8');
    await saveCurrentReport();
  }, [saveCurrentReport, session.id]);

  useEffect(() => {
    const id = window.setInterval(() => setClock(formatDuration(session.startedAt)), 1000);
    return () => window.clearInterval(id);
  }, [session.startedAt]);

  useEffect(() => {
    const syncRoute = () => setMedicalRoute(window.location.pathname.startsWith('/medical-profile/'));
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, []);

  useEffect(() => {
    if (!medicalRoute) return;
    const patientId = decodeURIComponent(window.location.pathname.split('/medical-profile/')[1] || '');
    if (!patientId) return;
    getDoc(doc(db, 'public_medical_profiles', patientId))
      .then((snap) => {
        setPublicMedical(snap.exists() ? snap.data() : null);
      })
      .catch(() => setPublicMedical(null));
  }, [medicalRoute]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = event.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const key = event.key.toUpperCase();
      if (['F', 'L', 'R', 'B', 'S'].includes(key)) sendSerialCommand(key);
      if (key === 'E') triggerManualEmergency();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sendSerialCommand, triggerManualEmergency]);

  const chartData = useMemo(() => {
    const labels = session.raw.map((_, index) => index + 1);
    return {
      labels,
      datasets: [
        {
          label: 'Live EOG Signal',
          data: session.raw,
          borderColor: '#00D4FF',
          backgroundColor: 'rgba(0, 212, 255, 0.15)',
          tension: 0.32,
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
        },
        {
          label: 'Baseline',
          data: session.baseline,
          borderColor: '#22C55E',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.2,
        },
        {
          label: 'Blink Threshold',
          data: session.threshold,
          borderColor: '#F59E0B',
          borderWidth: 1.5,
          pointRadius: 0,
          borderDash: [7, 5],
          tension: 0.2,
        },
      ],
    };
  }, [session.baseline, session.raw, session.threshold]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 650, easing: 'easeOutQuart' },
    scales: {
      x: { display: false },
      y: {
        min: 0,
        max: 4095,
        grid: { color: 'rgba(148, 163, 184, 0.10)' },
        ticks: { color: 'rgba(226, 232, 240, 0.55)' },
      },
    },
    plugins: {
      legend: {
        labels: { color: '#CBD5E1', boxWidth: 10, usePointStyle: true },
      },
      tooltip: { enabled: true },
    },
  };

  const activeSos = sosEvents.find((event) => event.id === activeSosId) || sosEvents[0];

  if (medicalRoute) {
    return (
      <MedicalProfilePage
        patient={{ ...emptyPatient, ...(publicMedical || patient) }}
        contacts={publicMedical?.emergency_contacts || contacts}
        activeSos={activeSos}
        triggerManualEmergency={triggerManualEmergency}
      />
    );
  }

  if (authLoading) {
    return <div className="auth-screen"><div className="auth-card"><h1>NuroNode AI</h1><p>Connecting to Firebase...</p></div></div>;
  }

  if (!authUser) {
    return <AuthGate onSubmit={handleAuth} onPasswordReset={handlePasswordReset} message={authMessage} />;
  }

  return (
    <div className={`app-shell ${drawerOpen ? 'drawer-expanded' : 'drawer-collapsed'}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">NN</div>
          <div className="brand-copy">
            <span>NuroNode AI</span>
            <small>Biomedical Assistive Intelligence Platform</small>
          </div>
        </div>
        <nav>
          {SCREENS.map((screen) => (
            <button
              key={screen.id}
              className={activeScreen === screen.id ? 'active' : ''}
              onClick={() => setActiveScreen(screen.id)}
              title={screen.label}
            >
              <span className="nav-icon">{screen.icon}</span>
              <span className="nav-label">{screen.label}</span>
            </button>
          ))}
        </nav>
        <div className="side-footer">
          <StatusPill status={dataStatus} tone={dataStatus.includes('failed') || dataStatus.includes('failed') ? 'danger' : 'success'} />
          <StatusPill status={connectionState} tone={isConnected ? 'success' : connectionState === 'ERROR' ? 'danger' : 'neutral'} />
          <button className="primary-action" onClick={isConnected ? disconnectSerial : connectSerial}>
            {isConnected ? 'Disconnect' : 'Connect Headband'}
          </button>
          <button className="secondary-action" onClick={handleLogout}>
            Logout
          </button>
          <button className="danger-action" onClick={triggerManualEmergency}>
            Emergency SOS
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <button className="icon-button" onClick={() => setDrawerOpen((value) => !value)} aria-label="Toggle drawer">☰</button>
            <div>
            <p className="eyebrow">Nurosync Engine + Care Intelligence</p>
            <h1>{SCREENS.find((screen) => screen.id === activeScreen)?.label}</h1>
            </div>
          </div>
          <div className="topbar-status">
            <span className="current-patient">{patient.fullName || 'Current Patient Pending'}</span>
            <span>Session {clock}</span>
            <StatusPill status={connectionState} tone={isConnected ? 'success' : connectionState === 'ERROR' ? 'danger' : 'neutral'} />
            <StatusPill status={activeDevice.receiver} tone={activeDevice.id === 'BROADCAST' ? 'warning' : 'success'} />
            <StatusPill status={metrics.quality} tone={metrics.reliability > 80 ? 'success' : metrics.reliability > 0 ? 'warning' : 'neutral'} />
            <StatusPill status={aiLoading ? 'AI Thinking' : aiInsight?.provider || 'AI Ready'} tone={aiLoading ? 'warning' : aiInsight?.provider === 'error' ? 'danger' : 'success'} />
            <button className="icon-button" onClick={() => setActiveScreen('patient')} title="Settings">⚙</button>
            <PatientAvatar patient={patient} />
            <button className="secondary-action topbar-logout" onClick={handleLogout}>Logout</button>
          </div>
        </header>

        {activeScreen === 'home' && (
          <HomeDashboard
            isConnected={isConnected}
            connectionState={connectionState}
            activeDevice={activeDevice}
            metrics={metrics}
            session={session}
            clock={clock}
            patient={patient}
            sosEvents={sosEvents}
            activeSos={activeSos}
            triggerManualEmergency={triggerManualEmergency}
            primaryContact={primaryContact}
            setActiveScreen={setActiveScreen}
          />
        )}

        {activeScreen === 'devices' && (
          <DeviceSelectionPage
            activeDevice={activeDevice}
            activeDeviceId={activeDeviceId}
            deviceOptions={DEVICE_OPTIONS}
            isConnected={isConnected}
            connectionState={connectionState}
            lastDevicePacket={lastDevicePacket}
            headbandStatus={headbandStatus}
            sendDeviceMode={sendDeviceMode}
            triggerManualEmergency={triggerManualEmergency}
          />
        )}

        {activeScreen === 'signal' && (
          <SignalCenter
            chartData={chartData}
            chartOptions={chartOptions}
            metrics={metrics}
            session={session}
            logs={logs}
          />
        )}

        {activeScreen === 'eye' && (
          <EyeControlCenter
            metrics={metrics}
            session={session}
            manualThreshold={manualThreshold}
            setManualThreshold={setManualThreshold}
            sendSerialCommand={sendSerialCommand}
            applyThreshold={applyThreshold}
          />
        )}

        {activeScreen === 'mobility' && (
          <MobilityCenter
            session={session}
            isConnected={isConnected}
            sendSerialCommand={sendSerialCommand}
            commandCounts={commandCounts}
            triggerManualEmergency={triggerManualEmergency}
          />
        )}

        {activeScreen === 'patient' && (
          <PatientHub
            patient={patient}
            updatePatient={updatePatient}
            updatePatientPhoto={updatePatientPhoto}
            savePatientProfile={savePatientProfile}
            contacts={contacts}
            saveContact={saveContact}
            deleteContact={deleteContact}
            moveContact={moveContact}
            twilio={twilio}
            updateTwilio={updateTwilio}
            sosEvents={sosEvents}
            activeSos={activeSos}
            setActiveSosId={setActiveSosId}
            triggerManualEmergency={triggerManualEmergency}
            resolveSos={resolveSos}
            primaryContact={primaryContact}
            setFullscreenQr={setFullscreenQr}
          />
        )}

        {activeScreen === 'reports' && (
          <ReportsPage
            patient={patient}
            session={session}
            metrics={metrics}
            sosEvents={sosEvents}
            recommendations={recommendations}
            exportCsv={exportCsv}
            exportReportHtml={exportReportHtml}
            saveCurrentReport={saveCurrentReport}
            deleteReport={deleteReport}
            downloadReport={downloadReport}
            reports={reports}
            generateAiInsights={generateAiInsights}
            aiInsight={aiInsight}
            aiLoading={aiLoading}
            aiMessages={aiMessages}
          />
        )}
      </main>

      {fullscreenQr && (
        <QrFullscreen
          patient={patient}
          primaryContact={primaryContact}
          onClose={() => setFullscreenQr(false)}
        />
      )}
    </div>
  );
}

function HomeDashboard(props) {
  const {
    isConnected,
    connectionState,
    activeDevice,
    metrics,
    session,
    clock,
    patient,
    sosEvents,
    activeSos,
    triggerManualEmergency,
    primaryContact,
    setActiveScreen,
  } = props;
  const emergencyActive = activeSos?.resolutionStatus === 'Active' || session.lastCommand === 'EMERGENCY_STOP';

  return (
    <div className="screen-stack">
      <div className="hero-band patient-hero">
        <div className="patient-identity">
          <PatientAvatar patient={patient} />
          <div>
            <p className="eyebrow">Active Patient Profile</p>
            <h2>{patient.fullName || 'Patient profile required for clinical session'}</h2>
            <p className="hero-subline">
              {patient.medicalCondition || 'Add medical condition'} / {patient.disabilityType || 'disability type pending'}
            </p>
          </div>
        </div>
        <div className="hero-command">
          <span>Current Command</span>
          <strong>{session.lastCommand}</strong>
        </div>
      </div>

      <div className="metric-grid six">
        <Card title="Patient Status" value={patient.fullName || 'Profile pending'} meta={patient.bloodGroup ? `${patient.bloodGroup} / ${patient.medicalCondition || 'condition pending'}` : 'Open Patient Hub to complete'} tone={patient.fullName ? 'green' : 'amber'} />
        <Card title="Device Status" value={isConnected ? 'Headband online' : 'Headband offline'} meta={session.connectedDevice} tone={isConnected ? 'green' : 'red'} />
        <Card title="Active Receiver" value={activeDevice.receiver} meta={`${activeDevice.mode} mode`} tone={activeDevice.id === 'BROADCAST' ? 'amber' : 'green'} />
        <Card title="Signal Status" value={metrics.quality} meta={`${metrics.qualityScore}% reliability`} tone={metrics.reliability > 80 ? 'green' : 'amber'} />
        <Card title="Blink Status" value={session.currentBlinkSequence ? `${session.currentBlinkSequence} blink sequence` : `${session.blinks} blinks`} meta="Nurosync firmware events" />
        <Card title="Emergency Status" value={emergencyActive ? 'Active' : 'Clear'} meta={activeSos ? `Last: ${activeSos.triggeredBy}` : 'Long blink / triple blink / button'} tone={emergencyActive ? 'red' : 'green'} />
        <Card title="Current Command" value={session.lastCommand} meta={`${session.commands.length} commands in session`} />
        <Card title="Session Runtime" value={clock} meta={`${session.packets} telemetry packets`} />
      </div>

      <div className="two-column">
        <Panel title="Recent Activity" right={<StatusPill status={`${session.events.length + sosEvents.length} events`} tone="neutral" />}>
          <EventList
            items={[
              ...sosEvents.slice(0, 3).map((event) => ({
                time: event.timestamp,
                label: `${event.triggeredBy} SOS ${event.resolutionStatus}`,
              })),
              ...session.events.slice(-8).reverse(),
            ].slice(0, 10)}
          />
        </Panel>
        <Panel title="Quick Action Buttons" right={<StatusPill status={connectionState} tone={isConnected ? 'success' : 'neutral'} />}>
          <div className="quick-actions dashboard-actions">
            <button onClick={triggerManualEmergency} className="danger-action">Quick SOS Button</button>
            <button onClick={() => setActiveScreen('signal')} className="secondary-action">Open Signal Center</button>
            <button onClick={() => setActiveScreen('patient')} className="secondary-action">Open Patient Hub</button>
            <button onClick={() => setActiveScreen('reports')} className="secondary-action">Open Reports</button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function DeviceSelectionPage({
  activeDevice,
  activeDeviceId,
  deviceOptions,
  isConnected,
  connectionState,
  lastDevicePacket,
  headbandStatus,
  sendDeviceMode,
  triggerManualEmergency,
}) {
  const cards = [deviceOptions.CAR, deviceOptions.HOME, deviceOptions.BROADCAST];
  const espNowStatus = isConnected
    ? activeDevice.id === 'BROADCAST' ? 'Broadcast packets enabled' : 'Targeted ESP-NOW routing'
    : 'Standalone broadcast fallback';

  return (
    <div className="screen-stack">
      <div className="hero-band device-hero">
        <div>
          <p className="eyebrow">Wireless Master Routing</p>
          <h2>{activeDevice.label}</h2>
          <p className="hero-subline">{activeDevice.receiver} receives blink packets while this mode is active.</p>
        </div>
        <div className="hero-command">
          <span>Current Mode</span>
          <strong>{activeDevice.mode}</strong>
        </div>
      </div>

      <div className="device-card-grid">
        {cards.map((device) => (
          <button
            className={`device-select-card ${activeDeviceId === device.id ? 'active' : ''}`}
            key={device.id}
            onClick={() => sendDeviceMode(device)}
          >
            <span>{device.id === 'CAR' ? 'MC' : device.id === 'HOME' ? 'HA' : 'SOS'}</span>
            <strong>{device.label}</strong>
            <small>{device.subtitle}</small>
            <em>{device.serial}</em>
          </button>
        ))}
      </div>

      <div className="metric-grid six">
        <Card title="Current Active Device" value={activeDevice.label} meta={activeDevice.subtitle} tone={activeDevice.id === 'BROADCAST' ? 'amber' : 'green'} />
        <Card title="Current Connection" value={connectionState} meta={isConnected ? 'USB serial linked' : 'USB serial offline'} tone={isConnected ? 'green' : 'red'} />
        <Card title="ESP-NOW Status" value={espNowStatus} meta="Headband is the wireless master" />
        <Card title="Last Packet Sent" value={lastDevicePacket} meta="USB serial routing command" />
        <Card title="Current Receiver" value={activeDevice.receiver} meta={activeDevice.id === 'BROADCAST' ? 'Any compatible receiver' : 'Single receiver target'} />
        <Card title="Current Mode" value={activeDevice.mode} meta={activeDevice.serial} tone={activeDevice.id === 'BROADCAST' ? 'amber' : 'green'} />
        <Card title="Current Headband Status" value={headbandStatus} meta="Latest firmware routing event" />
      </div>

      <Panel title="Global Emergency Override" right={<StatusPill status="Always Armed" tone="danger" />}>
        <div className="quick-actions dashboard-actions">
          <button className="danger-action" onClick={triggerManualEmergency}>Emergency SOS</button>
          <button className="secondary-action" onClick={() => sendDeviceMode(deviceOptions.BROADCAST)}>Enable Broadcast Mode</button>
        </div>
      </Panel>
    </div>
  );
}

function AuthGate({ onSubmit, onPasswordReset, message }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await onSubmit({ mode, email, password, displayName, rememberMe });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    setBusy(true);
    setError('');
    try {
      await onPasswordReset(email);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div>
          <p className="eyebrow">Secure Biomedical Workspace</p>
          <h1>NuroNode AI</h1>
          <p>Firebase-authenticated access for patient data, reports, QR medical cards, SOS history, and AI health insights.</p>
        </div>
        <div className="module-tabs">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Login</button>
          <button className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Signup</button>
        </div>
        <div className="auth-form">
          {mode === 'signup' && <Field label="Full Name" name="displayName" value={displayName} onChange={(_, value) => setDisplayName(value)} />}
          <Field label="Email" name="email" value={email} onChange={(_, value) => setEmail(value)} type="email" />
          <Field label="Password" name="password" value={password} onChange={(_, value) => setPassword(value)} type="password" />
          <label className="remember-row">
            <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
            <span>Remember Me</span>
          </label>
          <button className="primary-action wide" disabled={busy} onClick={submit}>{busy ? 'Connecting...' : mode === 'login' ? 'Login' : 'Create Account'}</button>
          <button className="secondary-action" disabled={busy} onClick={resetPassword}>Forgot Password</button>
        </div>
        {(message || error) && <div className={error ? 'auth-message danger' : 'auth-message'}>{error || message}</div>}
      </section>
    </main>
  );
}

function PatientAvatar({ patient }) {
  return (
    <div className="patient-avatar">
      {patient.profilePhoto ? (
        <img src={patient.profilePhoto} alt={patient.fullName || 'Patient'} />
      ) : (
        <span>{(patient.fullName || 'NN').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>
      )}
    </div>
  );
}

function PatientHub({
  patient,
  updatePatient,
  updatePatientPhoto,
  savePatientProfile,
  contacts,
  saveContact,
  deleteContact,
  moveContact,
  twilio,
  updateTwilio,
  sosEvents,
  activeSos,
  setActiveSosId,
  triggerManualEmergency,
  resolveSos,
  primaryContact,
  setFullscreenQr,
}) {
  const [activeTab, setActiveTab] = useState('profile');
  const tabs = [
    ['profile', 'Patient Profile'],
    ['contacts', 'Emergency Contacts'],
    ['sos', 'SOS Center'],
    ['qr', 'Medical QR Card'],
  ];

  return (
    <div className="screen-stack">
      <div className="module-tabs">
        {tabs.map(([id, label]) => (
          <button key={id} className={activeTab === id ? 'active' : ''} onClick={() => setActiveTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'profile' && (
        <PatientProfilePanel patient={patient} updatePatient={updatePatient} updatePatientPhoto={updatePatientPhoto} savePatientProfile={savePatientProfile} />
      )}
      {activeTab === 'contacts' && (
        <EmergencyContactsPanel contacts={contacts} saveContact={saveContact} deleteContact={deleteContact} moveContact={moveContact} />
      )}
      {activeTab === 'sos' && (
        <SosCenter
          activeSos={activeSos}
          sosEvents={sosEvents}
          setActiveSosId={setActiveSosId}
          triggerManualEmergency={triggerManualEmergency}
          resolveSos={resolveSos}
          contacts={contacts}
          twilio={twilio}
          updateTwilio={updateTwilio}
        />
      )}
      {activeTab === 'qr' && (
        <QrMedicalCard
          patient={patient}
          contacts={contacts}
          primaryContact={primaryContact}
          activeSos={activeSos}
          setFullscreenQr={setFullscreenQr}
        />
      )}
    </div>
  );
}

function PatientProfilePanel({ patient, updatePatient, updatePatientPhoto, savePatientProfile }) {
  return (
    <Panel title="Patient Profile" right={<StatusPill status={patient.fullName ? 'Linked to session' : 'Incomplete'} tone={patient.fullName ? 'success' : 'warning'} />}>
      <div className="profile-grid">
        <div className="photo-field">
          <PatientAvatar patient={patient} />
          <label className="file-button">
            Upload Photo
            <input type="file" accept="image/*" onChange={(event) => updatePatientPhoto(event.target.files?.[0])} />
          </label>
          <p className="quiet-note">Preview appears instantly. Firebase Storage is used when available, with a per-user local fallback.</p>
        </div>
        <Field label="Full Name" name="fullName" value={patient.fullName} onChange={updatePatient} />
        <Field label="Age" name="age" value={patient.age} onChange={updatePatient} />
        <Field label="Gender" name="gender" value={patient.gender} onChange={updatePatient} />
        <Field label="Blood Group" name="bloodGroup" value={patient.bloodGroup} onChange={updatePatient} />
        <Field label="Height" name="height" value={patient.height} onChange={updatePatient} />
        <Field label="Weight" name="weight" value={patient.weight} onChange={updatePatient} />
        <Field label="Doctor Name" name="doctorName" value={patient.doctorName} onChange={updatePatient} />
        <Field label="Doctor Phone" name="doctorPhone" value={patient.doctorPhone} onChange={updatePatient} />
        <Field label="Caregiver Name" name="caregiverName" value={patient.caregiverName} onChange={updatePatient} />
        <Field label="Caregiver Phone" name="caregiverPhone" value={patient.caregiverPhone} onChange={updatePatient} />
        <Field label="Medical Condition" name="medicalCondition" value={patient.medicalCondition} onChange={updatePatient}>
          <textarea value={patient.medicalCondition} onChange={(event) => updatePatient('medicalCondition', event.target.value)} />
        </Field>
        <Field label="Disability Type" name="disabilityType" value={patient.disabilityType} onChange={updatePatient}>
          <textarea value={patient.disabilityType} onChange={(event) => updatePatient('disabilityType', event.target.value)} />
        </Field>
        <Field label="Allergies" name="allergies" value={patient.allergies} onChange={updatePatient}>
          <textarea value={patient.allergies} onChange={(event) => updatePatient('allergies', event.target.value)} />
        </Field>
        <Field label="Medications" name="medications" value={patient.medications} onChange={updatePatient}>
          <textarea value={patient.medications} onChange={(event) => updatePatient('medications', event.target.value)} />
        </Field>
        <Field label="Medical Notes" name="medicalNotes" value={patient.medicalNotes} onChange={updatePatient}>
          <textarea value={patient.medicalNotes} onChange={(event) => updatePatient('medicalNotes', event.target.value)} />
        </Field>
        <button className="primary-action wide profile-save" onClick={() => savePatientProfile(patient)}>
          Save Patient Profile
        </button>
      </div>
    </Panel>
  );
}

function EmergencyContactsPanel({ contacts, saveContact, deleteContact, moveContact }) {
  const [draft, setDraft] = useState(emptyContact);
  const [editingId, setEditingId] = useState(null);

  const submit = () => {
    saveContact({ ...draft, id: editingId });
    setDraft(emptyContact);
    setEditingId(null);
  };

  return (
    <Panel title="Emergency Contacts" right={<StatusPill status={`${contacts.length} contacts`} tone={contacts.length ? 'success' : 'warning'} />}>
      <div className="contact-form">
        <Field label="Name" name="name" value={draft.name} onChange={(name, value) => setDraft((prev) => ({ ...prev, [name]: value }))} />
        <Field label="Relationship" name="relationship" value={draft.relationship} onChange={(name, value) => setDraft((prev) => ({ ...prev, [name]: value }))} />
        <Field label="Phone Number" name="phone" value={draft.phone} onChange={(name, value) => setDraft((prev) => ({ ...prev, [name]: value }))} />
        <Field label="Priority Level" name="priority" value={draft.priority} onChange={(name, value) => setDraft((prev) => ({ ...prev, [name]: value }))} type="number" />
        <button className="primary-action wide" onClick={submit}>{editingId ? 'Update Contact' : 'Add Contact'}</button>
      </div>
      <div className="contact-list">
        {[...contacts].sort((a, b) => Number(a.priority) - Number(b.priority)).map((contact) => (
          <div className="contact-row" key={contact.id}>
            <div>
              <strong>Priority {contact.priority}: {contact.name}</strong>
              <span>{contact.relationship || 'Relationship'} / {contact.phone}</span>
            </div>
            <div className="row-actions">
              <button onClick={() => moveContact(contact.id, -1)}>Up</button>
              <button onClick={() => moveContact(contact.id, 1)}>Down</button>
              <button onClick={() => { setDraft(contact); setEditingId(contact.id); }}>Edit</button>
              <button onClick={() => deleteContact(contact.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function SosCenter({ activeSos, sosEvents, setActiveSosId, triggerManualEmergency, resolveSos, contacts, twilio, updateTwilio }) {
  const deliveryTone = activeSos?.deliveries?.some((item) => item.status === 'Failed') ? 'danger' : activeSos ? 'success' : 'neutral';
  return (
    <Panel
      title="SOS Center"
      className="sos-panel"
      right={<StatusPill status={activeSos?.resolutionStatus || 'Standby'} tone={activeSos?.resolutionStatus === 'Active' ? 'danger' : deliveryTone} />}
    >
      <div className="sos-layout">
        <div className="sos-dashboard">
          <div className="sos-head">
            <div>
              <span>Emergency Status</span>
              <strong>{activeSos ? activeSos.resolutionStatus : 'No SOS events'}</strong>
            </div>
            <button className="danger-action" onClick={triggerManualEmergency}>Emergency Button</button>
          </div>
          <div className="stat-list">
            <Stat label="Time" value={activeSos ? formatDateTime(activeSos.timestamp) : 'Waiting'} />
            <Stat label="Triggered By" value={activeSos?.triggeredBy || 'Long blink / triple blink / button'} />
            <Stat label="Location" value={activeSos?.location?.mapsUrl || 'Not captured'} />
            <Stat label="Contacts" value={`${contacts.length} configured`} />
          </div>
          {activeSos?.location?.mapsUrl?.startsWith('https://') && (
            <a className="map-link" href={activeSos.location.mapsUrl} target="_blank" rel="noreferrer">Open Google Maps Location</a>
          )}
          {activeSos?.resolutionStatus === 'Active' && (
            <button className="primary-action wide" onClick={() => resolveSos(activeSos.id)}>Mark SOS Resolved</button>
          )}
        </div>

        <div className="delivery-board">
          <h3>SMS Delivery Status</h3>
          {activeSos?.deliveries?.length ? activeSos.deliveries.map((delivery) => (
            <div className="delivery-row" key={delivery.contactId}>
              <div>
                <strong>{delivery.name}</strong>
                <span>{delivery.relationship} / {delivery.phone}</span>
              </div>
              <StatusPill status={delivery.status} tone={delivery.status === 'Failed' ? 'danger' : delivery.status === 'Sent' || delivery.status === 'Delivered' ? 'success' : 'warning'} />
              <small>{delivery.detail}</small>
            </div>
          )) : <div className="empty-list">SOS delivery history appears after a trigger.</div>}
        </div>
      </div>

      <div className="two-column compact-top">
        <TwilioConfig twilio={twilio} updateTwilio={updateTwilio} />
        <div>
          <h3>Emergency History</h3>
          <div className="event-list">
            {sosEvents.length ? sosEvents.map((event) => (
              <button className="history-button" key={event.id} onClick={() => setActiveSosId(event.id)}>
                <strong>{event.triggeredBy}</strong>
                <span>{formatDateTime(event.timestamp)} / {event.resolutionStatus}</span>
              </button>
            )) : <div className="empty-list">No emergency history yet.</div>}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function TwilioConfig({ twilio, updateTwilio }) {
  return (
    <div className="twilio-config">
      <h3>Twilio Configuration</h3>
      <Field label="Account SID" name="accountSid" value={twilio.accountSid} onChange={updateTwilio} />
      <Field label="Auth Token" name="authToken" value={twilio.authToken} onChange={updateTwilio} type="password" />
      <Field label="Sender Number" name="senderNumber" value={twilio.senderNumber} onChange={updateTwilio} />
      <p className="quiet-note">Credentials sync to the authenticated Firebase settings document.</p>
    </div>
  );
}

function QrMedicalCard({ patient, contacts = [], primaryContact, activeSos, setFullscreenQr }) {
  const payload = buildQrPayload(patient, primaryContact);
  const url = qrImageUrl(payload, 420);
  const downloadQr = async () => {
    const response = await fetch(url);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `NuroNode_Medical_QR_${patient.fullName || 'Patient'}.png`;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  };

  return (
    <Panel id="qr-card" title="QR Medical Card" right={<StatusPill status={QR_VERSION} tone="success" />}>
      <div id="qr-card" className="qr-card">
        <img src={url} alt="NuroNode medical QR code" />
        <div className="qr-details">
          <div className="qr-profile-head">
            <PatientAvatar patient={patient} />
            <div>
              <h3>{patient.fullName || 'Patient Name Pending'}</h3>
              <p className="quiet-note">Emergency Medical Profile</p>
            </div>
          </div>
          <div className="stat-list">
            <Stat label="Blood Group" value={patient.bloodGroup || 'Not provided'} />
            <Stat label="Condition" value={patient.medicalCondition || 'Not provided'} />
            <Stat label="Allergies" value={patient.allergies || 'Not provided'} />
            <Stat label="Doctor" value={`${patient.doctorName || 'Not provided'} ${patient.doctorPhone || ''}`} />
            <Stat label="Emergency Contact" value={primaryContact ? `${primaryContact.name} ${primaryContact.phone}` : patient.caregiverPhone || 'Not provided'} />
            <Stat label="Emergency Profile URL" value={emergencyProfileUrl(patient)} />
          </div>
          <div className="button-row">
            <button className="primary-action" onClick={() => window.open(payload, '_blank', 'noreferrer')}>Generate QR</button>
            <button className="secondary-action" onClick={downloadQr}>Download QR</button>
            <button className="secondary-action" onClick={() => window.print()}>Print QR</button>
            <button className="secondary-action" onClick={() => setFullscreenQr(true)}>Fullscreen QR</button>
          </div>
        </div>
      </div>
      <EmergencyMedicalView patient={patient} contacts={contacts} activeSos={activeSos} />
    </Panel>
  );
}

function EmergencyMedicalView({ patient, contacts = [], activeSos }) {
  const primaryContact = [...contacts].sort((a, b) => Number(a.priority) - Number(b.priority))[0];
  return (
    <div className="emergency-view">
      <h3>Emergency Preview</h3>
      <div className="metric-grid">
        <Card title="Patient Details" value={patient.fullName || 'Not provided'} meta={`${patient.age || '-'} / ${patient.gender || '-'} / ${patient.bloodGroup || '-'}`} />
        <Card title="Medical Conditions" value={patient.medicalCondition || 'Not provided'} meta={patient.disabilityType || 'Disability type pending'} />
        <Card title="Allergies" value={patient.allergies || 'Not provided'} meta={patient.medications || 'Medication list pending'} tone="amber" />
        <Card title="Emergency Contact" value={primaryContact?.name || patient.caregiverName || 'Not provided'} meta={primaryContact?.phone || patient.caregiverPhone || 'No phone'} tone="red" />
      </div>
      <div className="stat-list compact-top">
        <Stat label="GPS Status" value={activeSos?.location?.status || 'Available after SOS trigger'} />
        <Stat label="Google Maps Link" value={activeSos?.location?.mapsUrl || 'Not captured'} />
        <Stat label="Generated Time" value={formatDateTime(Date.now())} />
        <Stat label="Medical QR Version" value={QR_VERSION} />
      </div>
    </div>
  );
}

function QrFullscreen({ patient, primaryContact, onClose }) {
  const payload = buildQrPayload(patient, primaryContact);
  return (
    <div className="qr-fullscreen">
      <button onClick={onClose}>Close</button>
      <img src={qrImageUrl(payload, 640)} alt="Fullscreen medical QR code" />
      <h2>{patient.fullName || 'NuroNode Medical Card'}</h2>
      <p>{patient.bloodGroup || 'Blood group pending'} / {patient.medicalCondition || 'Condition pending'}</p>
    </div>
  );
}

function ReportsPage({
  patient,
  session,
  metrics,
  sosEvents,
  recommendations,
  exportCsv,
  exportReportHtml,
  saveCurrentReport,
  reports,
  deleteReport,
  downloadReport,
  generateAiInsights,
  aiInsight,
  aiLoading,
  aiMessages,
}) {
  const reliabilityTone = metrics.reliability > 80 ? 'success' : metrics.reliability > 0 ? 'warning' : 'neutral';

  return (
    <div className="screen-stack reports-screen">
      <div className="metric-grid">
        <Card title="Session Reports" value={session.id} meta={formatDateTime(session.startedAt)} />
        <Card title="Signal Analytics" value={`${metrics.reliability}%`} meta={metrics.contact} tone={metrics.reliability > 80 ? 'green' : 'amber'} />
        <Card title="Blink Analytics" value={session.blinks} meta={`${session.blinkSequences.length} executed sequences`} />
        <Card title="Emergency History" value={sosEvents.length} meta={sosEvents[0] ? `Last: ${sosEvents[0].triggeredBy}` : 'No SOS events'} tone={sosEvents.length ? 'red' : 'green'} />
      </div>

      <div className="two-column">
        <Panel title="Clinical Export Controls" right={<StatusPill status="CSV / PDF / Print" tone="success" />}>
          <div className="report-actions">
            <button className="primary-action" onClick={exportCsv}>Export CSV</button>
            <button className="secondary-action" onClick={() => window.print()}>Export PDF</button>
            <button className="secondary-action" onClick={() => window.print()}>Print</button>
            <button className="secondary-action" onClick={exportReportHtml}>Download Report HTML</button>
            <button className="primary-action" onClick={saveCurrentReport}>Save Report</button>
          </div>
        </Panel>
        <Panel title="Reliability" right={<StatusPill status={metrics.quality} tone={reliabilityTone} />}>
          <div className="stat-list">
            <Stat label="Signal reliability" value={`${metrics.reliability}%`} />
            <Stat label="Contact quality" value={metrics.contact} />
            <Stat label="Noise estimate" value={metrics.noise.toFixed(1)} />
            <Stat label="Baseline drift" value={metrics.drift.toFixed(1)} />
          </div>
        </Panel>
      </div>

      <ReportGenerator
        patient={patient}
        session={session}
        metrics={metrics}
        sosEvents={sosEvents}
        recommendations={recommendations}
        exportCsv={exportCsv}
        exportReportHtml={exportReportHtml}
        saveCurrentReport={saveCurrentReport}
      />
      <div className="two-column">
        <Panel title="AI Health Chat" right={<StatusPill status={aiLoading ? 'Gemini typing' : aiInsight?.provider || 'Gemini Ready'} tone={aiInsight?.provider === 'error' ? 'danger' : aiLoading ? 'warning' : 'success'} />}>
          <AiHealthChat
            messages={aiMessages}
            loading={aiLoading}
            onAsk={generateAiInsights}
          />
        </Panel>
        <Panel title="Report History" right={<StatusPill status={`${reports.length} saved`} tone={reports.length ? 'success' : 'neutral'} />}>
          <div className="event-list">
            {reports.length ? reports.map((report) => (
              <div className="history-button" key={report.id}>
                <div>
                  <strong>{report.title || report.id}</strong>
                  <span>{formatDateTime(report.createdAtMs || Date.now())}</span>
                </div>
                <div className="row-actions">
                  <button onClick={() => downloadReport(report)}>Download</button>
                  <button onClick={() => deleteReport(report.id)}>Delete</button>
                </div>
              </div>
            )) : <div className="empty-list">Saved reports will appear here.</div>}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function AiHealthChat({ messages, loading, onAsk }) {
  const [draft, setDraft] = useState('');
  const suggestions = [
    'Summarize this session for a caregiver.',
    'What calibration changes are recommended?',
    'Explain mobility risk from the latest signal.',
  ];
  const submit = (question = draft) => {
    const clean = question.trim();
    if (!clean || loading) return;
    setDraft('');
    onAsk(clean);
  };

  return (
    <div className="ai-chat">
      <div className="ai-thread">
        {messages.map((message, index) => (
          <div className={`ai-bubble ${message.role.includes('user') ? 'user' : 'assistant'} ${message.role.includes('error') ? 'error' : ''}`} key={`${message.role}-${index}`}>
            <span>{message.role.includes('user') ? 'You' : message.provider || 'Gemini Health'}</span>
            <div>{renderMarkdownText(message.text)}</div>
          </div>
        ))}
        {loading && (
          <div className="ai-bubble assistant">
            <span>Gemini Health</span>
            <div className="typing-dots"><i /><i /><i /></div>
          </div>
        )}
      </div>
      <div className="suggested-questions">
        {suggestions.map((question) => (
          <button key={question} disabled={loading} onClick={() => submit(question)}>{question}</button>
        ))}
      </div>
      <div className="ai-composer">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') submit(); }}
          placeholder="Ask Gemini about the current Nurosync session"
        />
        <button className="primary-action" disabled={loading} onClick={() => submit()}>{loading ? 'Sending...' : 'Ask AI'}</button>
      </div>
    </div>
  );
}

function ReportGenerator({ patient, session, metrics, sosEvents, recommendations, exportCsv, exportReportHtml, saveCurrentReport }) {
  const endedAt = Date.now();
  const emergencyStops = session.commands.filter((item) => item.command === 'EMERGENCY_STOP').length;

  return (
    <Panel id="report-generator" title="Nurosync Clinical Report Generator" right={<StatusPill status="Clinical Preview" tone="success" />}>
      <div id="report-generator" className="report-actions">
        <button className="primary-action" onClick={exportCsv}>Export CSV</button>
        <button className="secondary-action" onClick={() => window.print()}>Export PDF / Print</button>
        <button className="secondary-action" onClick={exportReportHtml}>Download Preview HTML</button>
        <button className="primary-action" onClick={saveCurrentReport}>Save to Firestore</button>
      </div>
      <div className="report-preview">
        <header>
          <div>
            <h2>NuroNode AI Nurosync Session Report</h2>
            <p>Biomedical assistive intelligence report. Not a medical diagnosis.</p>
          </div>
          <PatientAvatar patient={patient} />
        </header>
        <section>
          <h3>Session Reports</h3>
          <div className="report-grid">
            <Stat label="Report ID" value={`REPORT-${session.id}`} />
            <Stat label="Generated" value={formatDateTime(endedAt)} />
          </div>
        </section>
        <section>
          <h3>Patient Information</h3>
          <div className="report-grid">
            <Stat label="Patient" value={patient.fullName || 'Not provided'} />
            <Stat label="Age / Gender" value={`${patient.age || '-'} / ${patient.gender || '-'}`} />
            <Stat label="Blood Group" value={patient.bloodGroup || 'Not provided'} />
            <Stat label="Condition" value={patient.medicalCondition || 'Not provided'} />
            <Stat label="Disability Type" value={patient.disabilityType || 'Not provided'} />
            <Stat label="Allergies" value={patient.allergies || 'Not provided'} />
            <Stat label="Medications" value={patient.medications || 'Not provided'} />
            <Stat label="Doctor Contact" value={`${patient.doctorName || '-'} ${patient.doctorPhone || ''}`} />
          </div>
        </section>
        <section>
          <h3>Session Analytics</h3>
          <div className="report-grid">
            <Stat label="Session ID" value={session.id} />
            <Stat label="Session Start" value={formatDateTime(session.startedAt)} />
            <Stat label="Session End" value={formatDateTime(endedAt)} />
            <Stat label="Duration" value={formatDuration(session.startedAt, endedAt)} />
            <Stat label="Telemetry Packets" value={session.packets} />
            <Stat label="Parse Errors" value={session.parseErrors} />
          </div>
        </section>
        <section>
          <h3>Signal Analytics</h3>
          <div className="report-grid">
            <Stat label="Average Signal" value={metrics.average.toFixed(1)} />
            <Stat label="Peak Signal" value={Math.round(metrics.peak)} />
            <Stat label="Latest Baseline" value={Math.round(metrics.baseline)} />
            <Stat label="Latest Threshold" value={Math.round(metrics.threshold)} />
            <Stat label="Threshold Range" value={`${Math.round(metrics.thresholdMin)} - ${Math.round(metrics.thresholdMax)}`} />
            <Stat label="Signal Reliability" value={`${metrics.reliability}%`} />
            <Stat label="Signal Quality" value={metrics.quality} />
            <Stat label="Contact Quality" value={metrics.contact} />
            <Stat label="Noise Estimate" value={metrics.noise.toFixed(1)} />
            <Stat label="Baseline Drift" value={metrics.drift.toFixed(1)} />
          </div>
        </section>
        <section>
          <h3>Blink Analytics</h3>
          <div className="report-grid">
            <Stat label="Blink Count" value={session.blinks} />
            <Stat label="Blink Sequences" value={session.blinkSequences.map((item) => `${item.count}x`).join(', ') || 'None'} />
            <Stat label="Commands Sent" value={session.commands.length} />
            <Stat label="Last Command" value={session.lastCommand} />
            <Stat label="Emergency Stops" value={emergencyStops} />
            <Stat label="SOS Events" value={sosEvents.length} />
          </div>
        </section>
        <section>
          <h3>Command History</h3>
          <div className="report-grid">
            {session.commands.slice(-8).reverse().map((item, index) => (
              <Stat key={`${item.time}-${index}`} label={formatDateTime(item.time)} value={`${item.command} / ${item.source}`} />
            ))}
            {!session.commands.length && <Stat label="Command History" value="No commands recorded" />}
          </div>
        </section>
        <section>
          <h3>Emergency History</h3>
          <div className="report-grid">
            {sosEvents.slice(0, 8).map((event) => (
              <Stat key={event.id} label={formatDateTime(event.timestamp)} value={`${event.triggeredBy} / ${event.resolutionStatus}`} />
            ))}
            {!sosEvents.length && <Stat label="Emergency History" value="No emergency events recorded" />}
          </div>
        </section>
        <section>
          <h3>Caregiver Recommendations</h3>
          <ul>
            {recommendations.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      </div>
    </Panel>
  );
}

function MedicalProfilePage({ patient, contacts, activeSos, triggerManualEmergency }) {
  const orderedContacts = [...contacts].sort((a, b) => Number(a.priority) - Number(b.priority));
  const mapsUrl = activeSos?.location?.mapsUrl?.startsWith('https://') ? activeSos.location.mapsUrl : '';
  const hospitalUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('nearest hospital')}`;

  return (
    <main className="medical-profile-page">
      <section className="medical-card">
        <header className="medical-card-header">
          <div>
            <p className="eyebrow">NuroNode Medical Card</p>
            <h1>{patient.fullName || 'Patient Name Pending'}</h1>
            <p>{patient.age || 'Age pending'} / {patient.gender || 'Gender pending'} / {patient.bloodGroup || 'Blood group pending'}</p>
          </div>
          <PatientAvatar patient={patient} />
        </header>

        <div className="medical-alert-strip">
          <strong>{patient.medicalCondition || 'Medical condition not provided'}</strong>
          <span>{patient.disabilityType || 'Disability type not provided'}</span>
        </div>

        <div className="medical-card-grid">
          <Stat label="Allergies" value={patient.allergies || 'Not provided'} />
          <Stat label="Current Medications" value={patient.medications || 'Not provided'} />
          <Stat label="Doctor" value={patient.doctorName || 'Not provided'} />
          <Stat label="Doctor Phone" value={patient.doctorPhone || 'Not provided'} />
          <Stat label="Caregiver" value={patient.caregiverName || 'Not provided'} />
          <Stat label="Caregiver Phone" value={patient.caregiverPhone || 'Not provided'} />
          <Stat label="Medical Notes" value={patient.medicalNotes || 'No notes provided'} />
          <Stat label="Generated Time" value={formatDateTime(Date.now())} />
          <Stat label="Medical QR Version" value={QR_VERSION} />
        </div>

        <section className="medical-section">
          <h2>Emergency Contacts</h2>
          <div className="contact-list">
            {orderedContacts.length ? orderedContacts.map((contact) => (
              <div className="contact-row" key={contact.id}>
                <div>
                  <strong>Priority {contact.priority}: {contact.name}</strong>
                  <span>{contact.relationship || 'Relationship'} / {contact.phone}</span>
                </div>
                {contact.phone && <a className="call-button" href={`tel:${contact.phone}`}>Call</a>}
              </div>
            )) : <div className="empty-list">No emergency contacts configured.</div>}
          </div>
        </section>

        <div className="medical-actions">
          {patient.doctorPhone && <a className="secondary-action" href={`tel:${patient.doctorPhone}`}>Call Doctor</a>}
          {patient.caregiverPhone && <a className="secondary-action" href={`tel:${patient.caregiverPhone}`}>Call Caregiver</a>}
          <a className="secondary-action" href={hospitalUrl} target="_blank" rel="noreferrer">Hospital Button</a>
          <a className="secondary-action" href={mapsUrl || 'https://www.google.com/maps'} target="_blank" rel="noreferrer">Location Button</a>
          <button className="danger-action" onClick={triggerManualEmergency}>Emergency Button</button>
        </div>
      </section>
    </main>
  );
}

function SignalCenter({ chartData, chartOptions, metrics, session, logs }) {
  return (
    <div className="screen-stack">
      <Panel title="Live EOG Signal" right={<StatusPill status={`${session.packets} packets`} tone={session.packets ? 'success' : 'neutral'} />}>
        <div className="chart-wrap">
          {session.raw.length ? <Line data={chartData} options={chartOptions} /> : <div className="empty-chart">Waiting for Nurosync telemetry</div>}
        </div>
      </Panel>

      <div className="metric-grid">
        <Card title="Raw Signal" value={Math.round(metrics.latest)} meta="0-4095 ADC" />
        <Card title="Baseline" value={Math.round(metrics.baseline)} meta="Firmware calibrated" tone="green" />
        <Card title="Threshold" value={Math.round(metrics.threshold)} meta="Blink trigger level" tone="amber" />
        <Card title="Signal Quality" value={`${metrics.qualityScore}%`} meta={metrics.contact} tone={metrics.reliability > 80 ? 'green' : 'amber'} />
      </div>

      <div className="two-column">
        <Panel title="Session Analytics">
          <div className="stat-list">
            <Stat label="Average signal" value={metrics.average.toFixed(1)} />
            <Stat label="Peak signal" value={Math.round(metrics.peak)} />
            <Stat label="Noise estimate" value={metrics.noise.toFixed(1)} />
            <Stat label="Baseline drift" value={metrics.drift.toFixed(1)} />
            <Stat label="Blink events" value={session.blinks} />
            <Stat label="Command count" value={session.commands.length} />
          </div>
        </Panel>
        <Panel title="Firmware Event Stream">
          <EventList items={logs.slice(-10).reverse().map((item) => ({ time: Date.now(), label: item.text, type: item.type }))} />
        </Panel>
      </div>
    </div>
  );
}

function EyeControlCenter({ metrics, session, manualThreshold, setManualThreshold, sendSerialCommand, applyThreshold }) {
  const mapping = [
    ['1 blink', 'FORWARD'],
    ['2 blinks', 'LEFT'],
    ['3 blinks', 'RIGHT + SOS'],
    ['4 blinks', 'BACKWARD'],
    ['5+ blinks', 'STOP'],
    ['Long blink', 'EMERGENCY_STOP + SOS'],
  ];

  return (
    <div className="screen-stack">
      <div className="two-column">
        <Panel title="Calibration">
          <div className="calibration-block">
            <div>
              <span>Current baseline</span>
              <strong>{Math.round(metrics.baseline)}</strong>
            </div>
            <div>
              <span>Current threshold</span>
              <strong>{Math.round(metrics.threshold)}</strong>
            </div>
            <button className="primary-action wide" onClick={() => sendSerialCommand('C', 'RECALIBRATE')}>
              Run Nurosync Recalibration
            </button>
          </div>
        </Panel>
        <Panel title="Threshold Control">
          <div className="threshold-row">
            <input
              value={manualThreshold}
              onChange={(event) => setManualThreshold(event.target.value)}
              placeholder="0-4095"
              inputMode="numeric"
            />
            <button className="secondary-action" onClick={applyThreshold}>Apply T:&lt;value&gt;</button>
          </div>
          <p className="quiet-note">Uses the firmware-supported Nurosync manual threshold command.</p>
        </Panel>
      </div>

      <div className="two-column">
        <Panel title="Blink History">
          <EventList items={session.events.slice(-10).reverse()} />
        </Panel>
        <Panel title="Gesture Mapping">
          <div className="mapping-grid">
            {mapping.map(([gesture, command]) => (
              <div className="mapping-item" key={gesture}>
                <span>{gesture}</span>
                <strong>{command}</strong>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Reliability Metrics">
        <div className="metric-grid">
          <Card title="Signal Reliability" value={`${metrics.reliability}%`} meta={metrics.contact} />
          <Card title="Blink Reliability" value={session.blinks ? 'Active' : 'Waiting'} meta={`${session.blinks} blink detections`} />
          <Card title="Current Sequence" value={session.currentBlinkSequence || 'None'} meta="Clears after execution timeout" />
          <Card title="Accepted Commands" value={session.commands.length} meta="Headband and manual sources" />
        </div>
      </Panel>
    </div>
  );
}

function MobilityCenter({ session, isConnected, sendSerialCommand, commandCounts, triggerManualEmergency }) {
  const buttons = [
    ['F', 'Forward'],
    ['L', 'Left'],
    ['S', 'Stop'],
    ['R', 'Right'],
    ['B', 'Backward'],
  ];

  return (
    <div className="screen-stack">
      <div className="metric-grid">
        <Card title="Current Command" value={session.lastCommand} meta="Latest Nurosync command" />
        <Card title="Connected Device" value={isConnected ? 'ESP32 Headband' : 'Offline'} meta="Commands relay to RC car over ESP-NOW" tone={isConnected ? 'green' : 'red'} />
        <Card title="Connection Health" value={isConnected ? 'Healthy' : 'Awaiting link'} meta={`${session.parseErrors} parse errors`} />
        <Card title="Emergency Stop" value={session.lastCommand === 'EMERGENCY_STOP' ? 'Active' : 'Ready'} meta="Mapped to E / long blink" tone={session.lastCommand === 'EMERGENCY_STOP' ? 'red' : 'green'} />
      </div>

      <div className="two-column">
        <Panel title="Mobility Command Deck">
          <div className="command-deck">
            {buttons.map(([command, label]) => (
              <button
                key={command}
                className={command === 'S' ? 'danger-command' : ''}
                onClick={() => sendSerialCommand(command)}
              >
                <span>{command}</span>
                {label}
              </button>
            ))}
            <button className="danger-command emergency-wide" onClick={triggerManualEmergency}>
              <span>E</span>
              Emergency SOS
            </button>
          </div>
        </Panel>
        <Panel title="Connection Health">
          <div className="stat-list">
            <Stat label="Command packets" value={session.commands.length} />
            <Stat label="Forward" value={commandCounts.FORWARD || 0} />
            <Stat label="Stop" value={(commandCounts.STOP || 0) + (commandCounts.EMERGENCY_STOP || 0)} />
            <Stat label="Telemetry packets" value={session.packets} />
          </div>
        </Panel>
      </div>

      <Panel title="Command History">
        <EventList items={session.commands.slice(-14).reverse().map((item) => ({ time: item.time, label: `${item.command} from ${item.source}` }))} />
      </Panel>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EventList({ items }) {
  if (!items.length) return <div className="empty-list">No session events yet.</div>;

  return (
    <div className="event-list">
      {items.map((item, index) => (
        <div className="event-item" key={`${item.time}-${item.label}-${index}`}>
          <span>{new Date(item.time).toLocaleTimeString('en-US', { hour12: false })}</span>
          <strong>{item.label}</strong>
        </div>
      ))}
    </div>
  );
}

export default NuroNodeAI;
