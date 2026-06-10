// ===== STATE =====
let recognition = null;
let isRecording = false;
let finalTranscript = '';
let timerInterval = null;
let timerSeconds = 0;
let audioContext = null;
let analyser = null;
let animationId = null;
let mediaStream = null;

// Ganti dengan API Key AssemblyAI Anda
const ASSEMBLYAI_API_KEY = '634a80b69b6242caad774efbe4b90135';

// ===== INIT =====
window.addEventListener('DOMContentLoaded', () => {
  checkBrowserSupport();
  initWaveformIdle();
});

function checkBrowserSupport() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    const status = document.getElementById('micStatus');
    status.textContent = '⚠ Browser tidak mendukung Web Speech API. Gunakan Google Chrome.';
    status.style.color = '#F87171';
    document.getElementById('micBtn').disabled = true;
    document.getElementById('micBtn').style.opacity = '0.4';
  }
}

// ===== TAB =====
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.getElementById('panel-mic').classList.toggle('hidden', tab !== 'mic');
  document.getElementById('panel-file').classList.toggle('hidden', tab !== 'file');
  if (isRecording) stopRecording();
}

// ===== RECORDING =====
function toggleRecording() {
  isRecording ? stopRecording() : startRecording();
}

function startRecording() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  const lang = document.getElementById('langSelect').value;
  recognition = new SpeechRecognition();
  recognition.lang = lang;
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onstart = () => {
    isRecording = true;
    updateMicUI(true);
    startTimer();
    startWaveform();
  };

  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += t + ' ';
      } else {
        interim = t;
      }
    }
    updateTranscriptDisplay(finalTranscript, interim);
  };

  recognition.onerror = (event) => {
    const msgs = {
      'not-allowed': '⚠ Izin mikrofon ditolak.',
      'no-speech': 'Tidak ada suara terdeteksi.',
      'audio-capture': '⚠ Mikrofon tidak ditemukan.',
      'network': '⚠ Masalah jaringan.',
    };
    showToast(msgs[event.error] || `Error: ${event.error}`, true);
    stopRecording();
  };

  recognition.onend = () => {
    if (isRecording) {
      try { recognition.start(); } catch(e) { stopRecording(); }
    }
  };

  try { recognition.start(); } catch(e) { showToast('Tidak dapat memulai perekaman.', true); }
}

function stopRecording() {
  isRecording = false;
  if (recognition) { recognition.stop(); recognition = null; }
  stopTimer();
  stopWaveform();
  updateMicUI(false);
}

function updateMicUI(recording) {
  const btn    = document.getElementById('micBtn');
  const status = document.getElementById('micStatus');
  const timer  = document.getElementById('recTimer');
  btn.classList.toggle('recording', recording);
  btn.querySelector('.mic-icon').classList.toggle('hidden', recording);
  btn.querySelector('.stop-icon').classList.toggle('hidden', !recording);
  timer.classList.toggle('hidden', !recording);
  status.textContent = recording ? 'Sedang merekam… klik untuk berhenti' : 'Klik untuk mulai merekam';
}

// ===== TIMER =====
function startTimer() {
  timerSeconds = 0;
  updateTimerDisplay();
  timerInterval = setInterval(() => { timerSeconds++; updateTimerDisplay(); }, 1000);
}
function stopTimer() { clearInterval(timerInterval); timerInterval = null; }
function updateTimerDisplay() {
  const m = Math.floor(timerSeconds / 60);
  const s = timerSeconds % 60;
  document.getElementById('timerCount').textContent = `${m}:${s.toString().padStart(2,'0')}`;
}

// ===== WAVEFORM =====
function initWaveformIdle() {
  const canvas = document.getElementById('waveform');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  const bars = 60;
  const barW = canvas.width / bars;
  for (let i = 0; i < bars; i++) {
    ctx.fillStyle = 'rgba(20,184,166,0.2)';
    ctx.beginPath();
    ctx.roundRect(i * barW + 2, (canvas.height - 4) / 2, barW - 4, 4, 2);
    ctx.fill();
  }
}

async function startWaveform() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 128;
    const source = audioContext.createMediaStreamSource(mediaStream);
    source.connect(analyser);
    drawWaveform();
  } catch(e) { console.warn('Waveform unavailable:', e); }
}

function drawWaveform() {
  const canvas = document.getElementById('waveform');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  const data = new Uint8Array(analyser.frequencyBinCount);

  function frame() {
    if (!isRecording) return;
    animationId = requestAnimationFrame(frame);
    analyser.getByteFrequencyData(data);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const barW = canvas.width / data.length;
    for (let i = 0; i < data.length; i++) {
      const v = data[i] / 255;
      const h = Math.max(4, v * canvas.height * 0.85);
      ctx.fillStyle = `rgba(20,184,166,${0.3 + v * 0.7})`;
      ctx.beginPath();
      ctx.roundRect(i * barW + 1, (canvas.height - h) / 2, barW - 2, h, 3);
      ctx.fill();
    }
  }
  frame();
}

function stopWaveform() {
  cancelAnimationFrame(animationId);
  if (audioContext) { audioContext.close(); audioContext = null; }
  if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
  initWaveformIdle();
}

// ===== TRANSCRIPT DISPLAY =====
function updateTranscriptDisplay(final, interim = '') {
  const hasContent = final.trim() || interim.trim();
  document.getElementById('emptyState').classList.toggle('hidden', !!hasContent);
  document.getElementById('transcriptText').textContent = final;
  document.getElementById('interimText').textContent = interim;
  const box = document.getElementById('transcriptBox');
  box.scrollTop = box.scrollHeight;
  updateWordCount(final);
  updateButtons(hasContent);
}

function updateWordCount(text) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  document.getElementById('wordCount').textContent = `${words} kata · ${text.length} karakter`;
}

function updateButtons(hasContent) {
  ['copyBtn','downloadBtn','clearBtn'].forEach(id => {
    document.getElementById(id).disabled = !hasContent;
  });
}

// ===== FILE UPLOAD =====
function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('dropZone').classList.add('dragover');
}
function handleDragLeave(e) {
  document.getElementById('dropZone').classList.remove('dragover');
}
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('dropZone').classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('audio/')) {
    loadFile(file);
  } else {
    showToast('File harus berformat audio!', true);
  }
}
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) loadFile(file);
}

let currentFile = null;

function loadFile(file) {
  currentFile = file;
  const url = URL.createObjectURL(file);
  document.getElementById('fileName').textContent = file.name;
  document.getElementById('fileSize').textContent = formatBytes(file.size);
  document.getElementById('audioPlayer').src = url;
  document.getElementById('fileInfo').classList.remove('hidden');
}

function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b/1024).toFixed(1)} KB`;
  return `${(b/1048576).toFixed(1)} MB`;
}

// ===== ASSEMBLYAI TRANSCRIPTION =====
async function transcribeFile() {
  if (!currentFile) { showToast('Pilih file terlebih dahulu!', true); return; }

  if (ASSEMBLYAI_API_KEY === 'MASUKKAN_API_KEY_ANDA_DISINI') {
    showToast('Masukkan API Key AssemblyAI terlebih dahulu!', true);
    return;
  }

  // Tampilkan loading
  finalTranscript = '';
  updateTranscriptDisplay('', '⏳ Mengunggah audio ke server...');
  setTranscribeButtonLoading(true);

  try {
    // STEP 1: Upload file audio ke AssemblyAI
    showToast('Mengunggah file audio...');
    const uploadUrl = await uploadAudio(currentFile);

    // STEP 2: Kirim request transkripsi
    updateTranscriptDisplay('', '⏳ Memproses transkripsi...');
    showToast('Memproses transkripsi...');
    const transcriptId = await requestTranscription(uploadUrl);

    // STEP 3: Polling hasil transkripsi
    updateTranscriptDisplay('', '⏳ Menunggu hasil...');
    const result = await pollTranscription(transcriptId);

    // STEP 4: Tampilkan hasil
    finalTranscript = result;
    updateTranscriptDisplay(finalTranscript, '');
    showToast('Transkripsi selesai! ✅');

  } catch (err) {
    showToast(`Error: ${err.message}`, true);
    updateTranscriptDisplay('', '');
  } finally {
    setTranscribeButtonLoading(false);
  }
}

async function uploadAudio(file) {
  const response = await fetch('https://api.assemblyai.com/v2/upload', {
    method: 'POST',
    headers: {
      'authorization': ASSEMBLYAI_API_KEY,
      'content-type': file.type,
    },
    body: file,
  });

  if (!response.ok) throw new Error('Gagal upload audio. Cek API Key Anda.');
  const data = await response.json();
  return data.upload_url;
}

async function requestTranscription(audioUrl) {
  const langCode = document.getElementById('langSelect').value;

  // Mapping bahasa ke kode AssemblyAI
  const langMap = {
    'id-ID': 'id',
    'en-US': 'en',
    'en-GB': 'en',
    'zh-CN': 'zh',
    'ja-JP': 'ja',
    'ko-KR': 'ko',
    'ar-SA': 'ar',
  };

  const response = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: {
      'authorization': ASSEMBLYAI_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      language_code: langMap[langCode] || 'id',
    }),
  });

  if (!response.ok) throw new Error('Gagal memulai transkripsi.');
  const data = await response.json();
  return data.id;
}

async function pollTranscription(transcriptId) {
  const maxAttempts = 60; // maksimal 5 menit
  let attempts = 0;

  while (attempts < maxAttempts) {
    await delay(5000); // tunggu 5 detik tiap cek

    const response = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
      headers: { 'authorization': ASSEMBLYAI_API_KEY },
    });

    const data = await response.json();

    if (data.status === 'completed') {
      return data.text;
    } else if (data.status === 'error') {
      throw new Error(`Transkripsi gagal: ${data.error}`);
    }

    attempts++;
    const sisa = maxAttempts - attempts;
    updateTranscriptDisplay('', `⏳ Memproses... (cek ke-${attempts}, estimasi ${sisa * 5} detik lagi)`);
  }

  throw new Error('Timeout: transkripsi terlalu lama.');
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function setTranscribeButtonLoading(loading) {
  const btn = document.querySelector('#panel-file .btn-primary');
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Memproses...`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Mulai Transkripsi`;
}

// ===== ACTIONS =====
function copyText() {
  const text = finalTranscript.trim();
  if (!text) return;
  navigator.clipboard.writeText(text)
    .then(() => showToast('Teks berhasil disalin!'))
    .catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('Teks berhasil disalin!');
    });
}

function downloadText() {
  const text = finalTranscript.trim();
  if (!text) return;
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `transkripsi-${new Date().toISOString().slice(0,10)}.txt`;
  a.click();
  showToast('File berhasil diunduh!');
}

function clearText() {
  finalTranscript = '';
  updateTranscriptDisplay('');
  showToast('Transkripsi dihapus.');
}

// ===== TOAST =====
function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  toast.style.borderColor = isError ? '#F87171' : '#14B8A6';
  toast.style.color       = isError ? '#F87171' : '#14B8A6';
  toast.style.background  = isError ? '#2D1B1B' : '#1E3A5F';
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.add('hidden'), 4000);
}

// CSS untuk animasi spin
const style = document.createElement('style');
style.textContent = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
document.head.appendChild(style);

window.addEventListener('resize', () => { if (!isRecording) initWaveformIdle(); });
