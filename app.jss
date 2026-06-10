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
      'not-allowed': '⚠ Izin mikrofon ditolak. Aktifkan di pengaturan browser.',
      'no-speech':   'Tidak ada suara terdeteksi.',
      'audio-capture': '⚠ Mikrofon tidak ditemukan.',
      'network':     '⚠ Masalah jaringan.',
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

// ===== TRANSCRIPT =====
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
function loadFile(file) {
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

// ===== TRANSCRIBE FILE =====
function transcribeFile() {
  const player = document.getElementById('audioPlayer');
  if (!player.src) { showToast('Pilih file terlebih dahulu!', true); return; }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { showToast('Gunakan Google Chrome untuk fitur ini.', true); return; }

  finalTranscript = '';
  updateTranscriptDisplay('', 'Memproses audio…');
  showToast('Memutar dan mentranskripsi audio…');

  const rec = new SpeechRecognition();
  rec.lang = 'id-ID';
  rec.continuous = true;
  rec.interimResults = true;

  rec.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += t + ' ';
      else interim = t;
    }
    updateTranscriptDisplay(finalTranscript, interim);
  };

  rec.onerror = (e) => { if (e.error !== 'no-speech') showToast(`Error: ${e.error}`, true); };

  rec.onend = () => {
    if (!player.paused) {
      try { rec.start(); } catch(e) {}
    } else {
      updateTranscriptDisplay(finalTranscript, '');
      showToast('Transkripsi selesai!');
    }
  };

  player.currentTime = 0;
  player.play();
  rec.start();
  player.onended = () => { setTimeout(() => rec.stop(), 1500); };
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
  toast._timeout = setTimeout(() => toast.classList.add('hidden'), 3000);
}

window.addEventListener('resize', () => { if (!isRecording) initWaveformIdle(); });