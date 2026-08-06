/* ==========================================================================
   PESQUISA ANDAV 2026 — ECOSSISTEMA SYNGENTA
   Opção 2: Firebase Firestore Real-Time & Offline Persistence Engine + Gemini AI
   ========================================================================== */

const STORAGE_KEYS = {
  RESPONSES: 'syngenta_andav_2026_responses',
  SESSION: 'syngenta_andav_2026_session',
  FIREBASE_CONFIG: 'syngenta_andav_2026_firebase_config',
  GEMINI_KEY: 'syngenta_andav_2026_gemini_key'
};

const DEFAULT_GEMINI_KEY = "AIzaSyBmXmNccfXx1Dcgycybji2ZTHqLenB7f3U";

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAedlN99T1182bU3-YubQ1l_LujOnfpPZc",
  authDomain: "pesquisa-andav-2026.firebaseapp.com",
  projectId: "pesquisa-andav-2026",
  storageBucket: "pesquisa-andav-2026.firebasestorage.app",
  messagingSenderId: "856001913981",
  appId: "1:856001913981:web:2bce4dc798d5b6b1fe3d14"
};

// Estado da Aplicação
const appState = {
  mode: 'essencial', // 'essencial' | 'completo'
  interviewerName: '',
  deviceId: 'Tablet_01',
  startTime: null,
  firebaseApp: null,
  db: null,
  isFirebaseActive: false,
  geminiApiKey: '',
  activeRecorders: {},
  p3State: {
    acessa_agro: null,
    syde: null,
    smart_engage: null,
    cropwise: null
  }
};

const PLATFORM_NAMES = {
  acessa_agro: 'Acessa Agro',
  syde: 'Syde',
  smart_engage: 'Smart Engage',
  cropwise: 'Cropwise'
};

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  loadSavedConfig();
  initFirebaseIfConfigured();
  bindEvents();
  initVoiceRecorders();
  updateSyncStatusBadge();
  updateSavedCountModal();
  pullRemoteDataFromFirebase();
}

/* ==========================================================================
   1. INICIALIZAÇÃO DE CREDENCIAIS (FIREBASE & GEMINI AI)
   ========================================================================== */
function loadSavedConfig() {
  const savedConfigStr = localStorage.getItem(STORAGE_KEYS.FIREBASE_CONFIG);
  let cfg = DEFAULT_FIREBASE_CONFIG;
  if (savedConfigStr) {
    try {
      cfg = JSON.parse(savedConfigStr);
    } catch (e) {}
  }
  document.getElementById('firebaseApiKey').value = cfg.apiKey || '';
  document.getElementById('firebaseProjectId').value = cfg.projectId || '';
  document.getElementById('firebaseAppId').value = cfg.appId || '';

  const savedGeminiKey = localStorage.getItem(STORAGE_KEYS.GEMINI_KEY) || DEFAULT_GEMINI_KEY;
  appState.geminiApiKey = savedGeminiKey;
  const geminiInp = document.getElementById('geminiApiKey');
  if (geminiInp) geminiInp.value = savedGeminiKey;

  const savedSession = localStorage.getItem(STORAGE_KEYS.SESSION);
  if (savedSession) {
    try {
      const sess = JSON.parse(savedSession);
      appState.interviewerName = sess.interviewerName || '';
      appState.deviceId = sess.deviceId || 'Tablet_01';
      document.getElementById('interviewerName').value = appState.interviewerName;
      document.getElementById('deviceId').value = appState.deviceId;
    } catch (e) {}
  }
}

function initFirebaseIfConfigured() {
  if (typeof firebase === 'undefined') return;

  const savedConfigStr = localStorage.getItem(STORAGE_KEYS.FIREBASE_CONFIG);
  let config = DEFAULT_FIREBASE_CONFIG;
  if (savedConfigStr) {
    try {
      config = JSON.parse(savedConfigStr);
    } catch (e) {}
  }

  try {
    if (config.apiKey && config.projectId) {
      if (!firebase.apps.length) {
        appState.firebaseApp = firebase.initializeApp(config);
      } else {
        appState.firebaseApp = firebase.app();
      }
      
      appState.db = firebase.firestore();
      
      // Persistência Offline Nativa Firestore
      appState.db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
        if (err.code == 'failed-precondition') {
          console.warn('[Firebase] Persistência limitada a uma aba.');
        } else if (err.code == 'unimplemented') {
          console.warn('[Firebase] Navegador não suporta persistência nativa.');
        }
      });

      appState.isFirebaseActive = true;
      console.log('[Firebase Firestore] Inicializado com sucesso!');
    }
  } catch (e) {
    console.error('[Firebase Init Error]', e);
    appState.isFirebaseActive = false;
  }
}

function bindEvents() {
  document.getElementById('startSurveyBtn').addEventListener('click', startSurveySession);
  document.getElementById('btnFinishEssencial').addEventListener('click', finishEssencialPath);
  document.getElementById('btnContinueCompleto').addEventListener('click', continueToCompletoPath);

  const p3Radios = document.querySelectorAll('.matrix-table input[type="radio"]');
  p3Radios.forEach(radio => radio.addEventListener('change', handleP3Change));

  const p1Radios = document.querySelectorAll('input[name="p1_atividade"]');
  p1Radios.forEach(radio => radio.addEventListener('change', evaluateConditionalQuestions));

  const p21Radios = document.querySelectorAll('input[name="p21_recrutamento"]');
  p21Radios.forEach(radio => radio.addEventListener('change', (e) => {
    document.getElementById('p21_contato_fields').style.display = e.target.value === 'Sim' ? 'block' : 'none';
  }));

  document.getElementById('surveyForm').addEventListener('submit', handleFormSubmit);
  document.getElementById('newSurveyBtn').addEventListener('click', resetSurveyForm);

  document.getElementById('openSettingsBtn').addEventListener('click', openSettingsModal);
  document.getElementById('openReportsHeaderBtn').addEventListener('click', openReportsModal);
  document.getElementById('syncStatusBadge').addEventListener('click', openSettingsModal);
  document.getElementById('closeSettingsBtn').addEventListener('click', closeSettingsModal);
  
  document.getElementById('tabEndpointBtn').addEventListener('click', () => switchTab('endpoint'));
  document.getElementById('tabReportsBtn').addEventListener('click', () => switchTab('reports'));
  document.getElementById('tabDataBtn').addEventListener('click', () => switchTab('data'));

  document.getElementById('saveApiConfigBtn').addEventListener('click', saveFirebaseConfig);
  document.getElementById('testApiBtn').addEventListener('click', testFirebaseConnection);
  document.getElementById('manualSyncBtn').addEventListener('click', forceManualSync);
  document.getElementById('exportCsvBtn').addEventListener('click', exportDataAsCSV);
  document.getElementById('exportReportsCsvBtn').addEventListener('click', exportDataAsCSV);
  document.getElementById('exportJsonBtn').addEventListener('click', exportDataAsJSON);
  document.getElementById('clearDataBtn').addEventListener('click', clearLocalData);

  window.addEventListener('online', () => {
    updateSyncStatusBadge();
    syncPendingData();
  });
  window.addEventListener('offline', updateSyncStatusBadge);
  
  document.getElementById('surveyForm').addEventListener('change', updateProgressBar);
}

/* ==========================================================================
   2. SISTEMA DE GRAVAÇÃO E TRANSCRIÇÃO DE VOZ (WEB SPEECH + GEMINI AI)
   ========================================================================== */
function initVoiceRecorders() {
  const form = document.getElementById('surveyForm');
  if (!form) return;

  const textFields = form.querySelectorAll('textarea, input[type="text"]');
  textFields.forEach(field => {
    if (!field.id || field.dataset.hasVoiceBtn) return;
    field.dataset.hasVoiceBtn = "true";

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'voice-rec-btn';
    btn.id = `voice_btn_${field.id}`;
    btn.innerHTML = '🎙️ Gravar Voz';
    btn.title = 'Clique para gravar áudio e transcrever o texto neste campo';

    // Posicionar o botão acima ou ao lado do campo
    const parent = field.parentElement;
    if (parent) {
      let labelWrapper = parent.querySelector('.label-voice-wrapper');
      if (!labelWrapper) {
        labelWrapper = document.createElement('div');
        labelWrapper.className = 'label-voice-wrapper';

        const label = parent.querySelector('label');
        if (label) {
          label.parentNode.insertBefore(labelWrapper, label);
          labelWrapper.appendChild(label);
        } else {
          field.parentNode.insertBefore(labelWrapper, field);
        }
      }
      labelWrapper.appendChild(btn);
    }

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleVoiceRecording(field, btn);
    });
  });
}

async function toggleVoiceRecording(fieldEl, btnEl) {
  const fieldId = fieldEl.id;

  if (appState.activeRecorders[fieldId]) {
    stopVoiceRecording(fieldId);
  } else {
    startVoiceRecording(fieldEl, btnEl);
  }
}

async function startVoiceRecording(fieldEl, btnEl) {
  const fieldId = fieldEl.id;
  
  let recInstance = {
    fieldEl,
    btnEl,
    recognition: null,
    mediaRecorder: null,
    audioChunks: [],
    timerInterval: null,
    seconds: 0,
    webSpeechText: ''
  };

  btnEl.classList.add('recording');
  btnEl.innerHTML = '⏹️ 00:00 Gravando... (Clique p/ parar)';

  recInstance.timerInterval = setInterval(() => {
    recInstance.seconds++;
    const mins = String(Math.floor(recInstance.seconds / 60)).padStart(2, '0');
    const secs = String(recInstance.seconds % 60).padStart(2, '0');
    btnEl.innerHTML = `⏹️ ${mins}:${secs} Gravando... (Clique p/ parar)`;
  }, 1000);

  // 1. Tentar Web Speech API Nativinho do Navegador (Real-time pt-BR)
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'pt-BR';
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        recInstance.webSpeechText = transcript;
      };

      recognition.start();
      recInstance.recognition = recognition;
    } catch (e) {
      console.warn('[Web Speech API] Erro ao iniciar:', e);
    }
  }

  // 2. Gravação de Áudio via MediaRecorder para Gemini API
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recInstance.audioChunks.push(event.data);
        }
      };

      mediaRecorder.start(250);
      recInstance.mediaRecorder = mediaRecorder;
      recInstance.audioStream = stream;
    } catch (e) {
      console.warn('[MediaRecorder] Microfone não acessível para gravação de áudio:', e);
    }
  }

  appState.activeRecorders[fieldId] = recInstance;
}

async function stopVoiceRecording(fieldId) {
  const rec = appState.activeRecorders[fieldId];
  if (!rec) return;

  clearInterval(rec.timerInterval);
  const { fieldEl, btnEl, recognition, mediaRecorder, audioStream, webSpeechText } = rec;

  if (recognition) {
    try { recognition.stop(); } catch (e) {}
  }

  let audioBlob = null;
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    audioBlob = await new Promise((resolve) => {
      mediaRecorder.onstop = () => {
        const blob = new Blob(rec.audioChunks, { type: 'audio/webm' });
        resolve(blob);
      };
      mediaRecorder.stop();
    });
  }

  if (audioStream) {
    audioStream.getTracks().forEach(track => track.stop());
  }

  delete appState.activeRecorders[fieldId];

  // Processar Transcrição
  btnEl.classList.remove('recording');
  btnEl.classList.add('processing');
  btnEl.innerHTML = '⏳ Transcrevendo...';

  let finalTranscript = webSpeechText.trim();

  // Se Gemini API Key estiver configurada e tivermos áudio gravado, transcrever via Gemini AI
  if (appState.geminiApiKey && audioBlob && audioBlob.size > 1000) {
    try {
      btnEl.innerHTML = '✨ Transcrevendo via Gemini AI...';
      const geminiText = await transcribeAudioWithGemini(audioBlob, appState.geminiApiKey);
      if (geminiText) {
        finalTranscript = geminiText;
      }
    } catch (err) {
      console.error('[Gemini AI Transcribe Error]', err);
    }
  }

  if (finalTranscript) {
    const currentVal = fieldEl.value.trim();
    fieldEl.value = currentVal ? `${currentVal} ${finalTranscript}` : finalTranscript;
    fieldEl.dispatchEvent(new Event('input', { bubbles: true }));
    fieldEl.dispatchEvent(new Event('change', { bubbles: true }));

    btnEl.innerHTML = '✅ Transcrito!';
    setTimeout(() => {
      btnEl.classList.remove('processing');
      btnEl.innerHTML = '🎙️ Gravar Voz';
    }, 2000);
  } else {
    btnEl.classList.remove('processing');
    btnEl.innerHTML = '⚠️ Não capturado. Tente de novo';
    setTimeout(() => {
      btnEl.innerHTML = '🎙️ Gravar Voz';
    }, 2500);
  }
}

async function transcribeAudioWithGemini(audioBlob, apiKey) {
  const arrayBuffer = await audioBlob.arrayBuffer();
  const base64Audio = btoa(
    new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
  );

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: "Transcreva o áudio em português (pt-BR) fornecido durante a pesquisa ANDAV Syngenta. Retorne EXATAMENTE e APENAS o texto falado, corrigindo pontuação básica." },
          { inlineData: { mimeType: audioBlob.type || "audio/webm", data: base64Audio } }
        ]
      }]
    })
  });

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.error?.message || 'Erro na API Gemini');
  }

  const data = await response.json();
  if (data.candidates && data.candidates[0] && data.candidates[0].content) {
    return data.candidates[0].content.parts[0].text.trim();
  }
  return '';
}


/* ==========================================================================
   3. NAVEGAÇÃO & BLOCOS
   ========================================================================== */
function selectMode(mode) {
  appState.mode = mode;
  document.getElementById('modeCardEssencial').classList.toggle('active', mode === 'essencial');
  document.getElementById('modeCardCompleto').classList.toggle('active', mode === 'completo');
  
  document.getElementById('activeModeBadge').textContent = (mode === 'essencial') ? '⚡ Essencial (2–3 min)' : '📋 Completo (7–9 min)';
}

function startSurveySession() {
  const interviewer = document.getElementById('interviewerName').value.trim();
  const device = document.getElementById('deviceId').value.trim();

  if (!interviewer || !device) {
    alert('Por favor, informe o Nome do Pesquisador e o ID do Tablet antes de iniciar.');
    return;
  }

  appState.interviewerName = interviewer;
  appState.deviceId = device;
  appState.startTime = new Date().toISOString();

  localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify({ interviewerName: interviewer, deviceId: device }));

  document.getElementById('sessionSetupSection').style.display = 'none';
  document.getElementById('surveyForm').style.display = 'block';

  if (appState.mode === 'essencial') {
    document.getElementById('bloco0').style.display = 'block';
    document.getElementById('modeTransitionCard').style.display = 'block';
    document.getElementById('bloco1').style.display = 'none';
    document.getElementById('bloco2').style.display = 'none';
    document.getElementById('bloco3').style.display = 'none';
    document.getElementById('blocoEncerramento').style.display = 'none';
  } else {
    document.getElementById('bloco0').style.display = 'block';
    document.getElementById('modeTransitionCard').style.display = 'none';
    document.getElementById('bloco1').style.display = 'block';
    document.getElementById('bloco2').style.display = 'block';
    document.getElementById('bloco3').style.display = 'block';
    document.getElementById('blocoEncerramento').style.display = 'block';
  }

  evaluateConditionalQuestions();
  updateProgressBar();
  initVoiceRecorders();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function finishEssencialPath() {
  document.getElementById('bloco1').style.display = 'none';
  document.getElementById('bloco2').style.display = 'none';
  document.getElementById('bloco3').style.display = 'none';
  document.getElementById('blocoEncerramento').style.display = 'block';
  updateProgressBar();
  document.getElementById('blocoEncerramento').scrollIntoView({ behavior: 'smooth' });
}

function continueToCompletoPath() {
  appState.mode = 'completo';
  document.getElementById('activeModeBadge').textContent = '📋 Completo (7–9 min)';
  document.getElementById('modeTransitionCard').style.display = 'none';
  
  document.getElementById('bloco1').style.display = 'block';
  document.getElementById('bloco2').style.display = 'block';
  document.getElementById('bloco3').style.display = 'block';
  document.getElementById('blocoEncerramento').style.display = 'block';
  
  evaluateConditionalQuestions();
  updateProgressBar();
  document.getElementById('bloco1').scrollIntoView({ behavior: 'smooth' });
}

/* ==========================================================================
   4. RAMIFICAÇÃO CONDICIONAL
   ========================================================================== */
function handleP3Change() {
  appState.p3State.acessa_agro = getRadioValue('p3_acessa_agro');
  appState.p3State.syde = getRadioValue('p3_syde');
  appState.p3State.smart_engage = getRadioValue('p3_smart_engage');
  appState.p3State.cropwise = getRadioValue('p3_cropwise');

  evaluateConditionalQuestions();
}

function evaluateConditionalQuestions() {
  const p3 = appState.p3State;

  const p10Platforms = Object.keys(p3).filter(key => p3[key] === 'conheco_nunca_usei');
  updateDropdownOptions('p10_plataforma', p10Platforms);
  document.getElementById('q_p10').style.display = p10Platforms.length > 0 ? 'block' : 'none';

  const p11Platforms = Object.keys(p3).filter(key => p3[key] === 'uso_atualmente');
  updateDropdownOptions('p11_plataforma', p11Platforms);
  document.getElementById('q_p11').style.display = p11Platforms.length > 0 ? 'block' : 'none';

  const p12Platforms = Object.keys(p3).filter(key => p3[key] === 'ja_usei_parei');
  updateDropdownOptions('p12_plataforma', p12Platforms);
  document.getElementById('q_p12').style.display = p12Platforms.length > 0 ? 'block' : 'none';

  const p13Platforms = Object.keys(p3).filter(key => p3[key] === 'nao_conheco');
  document.getElementById('q_p13').style.display = p13Platforms.length > 0 ? 'block' : 'none';

  const atividade = getRadioValue('p1_atividade');
  const isPerfilCredito = ['Produtor rural', 'Revenda / distribuidor de insumos', 'Cooperativa'].includes(atividade);
  const isSydeUser = p3.syde && p3.syde !== 'nao_conheco';
  document.getElementById('q_p15').style.display = (isSydeUser || isPerfilCredito) ? 'block' : 'none';

  const isAcessaUser = p3.acessa_agro && p3.acessa_agro !== 'nao_conheco';
  document.getElementById('q_p17').style.display = isAcessaUser ? 'block' : 'none';

  document.getElementById('q_p19').style.display = isPerfilCredito ? 'block' : 'none';

  updateProgressBar();
}

function updateDropdownOptions(selectId, platformKeys) {
  const select = document.getElementById(selectId);
  const currentVal = select.value;
  select.innerHTML = '<option value="">Selecione a plataforma...</option>';
  
  platformKeys.forEach(key => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = PLATFORM_NAMES[key] || key;
    select.appendChild(opt);
  });

  if (platformKeys.includes(currentVal)) {
    select.value = currentVal;
  }
}

function updateProgressBar() {
  const visibleCards = document.querySelectorAll('.question-card:not([style*="display: none"])');
  let answeredCount = 0;

  visibleCards.forEach(card => {
    const inputs = card.querySelectorAll('input, select, textarea');
    let answered = false;
    inputs.forEach(inp => {
      if ((inp.type === 'radio' && inp.checked) || (inp.type !== 'radio' && inp.value.trim() !== '')) {
        answered = true;
      }
    });
    if (answered) answeredCount++;
  });

  const total = visibleCards.length || 1;
  const pct = Math.min(Math.round((answeredCount / total) * 100), 100);
  document.getElementById('progressBarFill').style.width = pct + '%';
}

/* ==========================================================================
   5. ENVIO PARA FIREBASE FIRESTORE & ARMAZENAMENTO LOCAL
   ========================================================================== */
async function handleFormSubmit(e) {
  e.preventDefault();

  const endTime = new Date().toISOString();
  const durationSec = appState.startTime ? Math.round((new Date() - new Date(appState.startTime)) / 1000) : 0;
  const submissionId = 'andav_2026_' + Math.random().toString(36).substr(2, 9);

  const payload = {
    id_submissao: submissionId,
    metadata: {
      entrevistador: appState.interviewerName,
      dispositivo_id: appState.deviceId,
      modo_aplicacao: appState.mode,
      timestamp_inicio: appState.startTime,
      timestamp_fim: endTime,
      duracao_segundos: durationSec
    },
    bloco_0_essencial: {
      p1_atividade: getRadioValue('p1_atividade'),
      p1_outro: document.getElementById('p1_outro').value,
      p2_papel: getRadioValue('p2_papel'),
      p2_outro: document.getElementById('p2_outro').value,
      p3_matriz: appState.p3State,
      p4_dor_compra: getRadioValue('p4_dor_compra'),
      p4_outro: document.getElementById('p4_outro').value,
      p5_dor_credito: getRadioValue('p5_dor_credito'),
      p5_outro: document.getElementById('p5_outro').value,
      p6_gosta: document.getElementById('p6_gosta').value,
      p6_incomoda: document.getElementById('p6_incomoda').value
    },
    bloco_1_perfil: {
      p7_tamanho: getRadioValue('p7_tamanho'),
      p8_estado: document.getElementById('p8_estado').value,
      p9_usa_ferramentas: getRadioValue('p9_usa_ferramentas'),
      p9_quais: document.getElementById('p9_quais').value,
      p9_qtd_sistemas: getRadioValue('p9_qtd_sistemas'),
      p9_mais_gosta: document.getElementById('p9_mais_gosta').value,
      p9_menos_gosta: document.getElementById('p9_menos_gosta').value
    },
    bloco_2_awareness: {
      p10_nunca_usou: {
        plataforma: document.getElementById('p10_plataforma').value,
        motivo: getRadioValue('p10_motivo'),
        outro: document.getElementById('p10_outro').value
      },
      p11_uso_atual: {
        plataforma: document.getElementById('p11_plataforma').value,
        descricao: document.getElementById('p11_descricao').value
      },
      p12_parou_usar: {
        plataforma: document.getElementById('p12_plataforma').value,
        motivo: getRadioValue('p12_motivo'),
        outro: document.getElementById('p12_outro').value
      },
      p13_nao_conhece: {
        canal: getRadioValue('p13_canal'),
        outro: document.getElementById('p13_outro').value
      }
    },
    bloco_3_dores: {
      p14_credito_pesam: getRadioValue('p14_credito_pesam'),
      p14_outro: document.getElementById('p14_outro').value,
      p15_credito_historico: {
        onde: document.getElementById('p15_onde').value,
        dificuldade: document.getElementById('p15_dificuldade').value
      },
      p16_fidelidade: getRadioValue('p16_fidelidade'),
      p16_outro: document.getElementById('p16_outro').value,
      p17_fidelidade_valer_pena: document.getElementById('p17_valer_pena').value,
      p18_desafios_gestao: getRadioValue('p18_desafios_gestao'),
      p18_outro: document.getElementById('p18_outro').value,
      p19_rtv: {
        avaliacao: getRadioValue('p19_rtv_avaliacao'),
        porque: document.getElementById('p19_rtv_porque').value
      }
    },
    encerramentos: {
      p20_experiencia: document.getElementById('p20_experiencia_livre').value,
      p21_recrutamento: getRadioValue('p21_recrutamento'),
      p21_nome: document.getElementById('p21_nome').value,
      p21_contato: document.getElementById('p21_contato').value
    },
    sync_status: 'pending',
    created_at: new Date().toISOString()
  };

  saveResponseLocally(payload);

  const syncedSuccess = await sendResponseToFirebase(payload);
  if (syncedSuccess) {
    payload.sync_status = 'synced';
    updateLocalResponseSyncStatus(payload.id_submissao, 'synced');
  }

  showSuccessScreen(payload);
  updateSyncStatusBadge();
  updateSavedCountModal();
}

function saveResponseLocally(payload) {
  const responses = getSavedResponses();
  responses.push(payload);
  localStorage.setItem(STORAGE_KEYS.RESPONSES, JSON.stringify(responses));
}

function getSavedResponses() {
  const data = localStorage.getItem(STORAGE_KEYS.RESPONSES);
  if (!data) return [];
  try { return JSON.parse(data); } catch (e) { return []; }
}

function updateLocalResponseSyncStatus(idSubmissao, newStatus) {
  const responses = getSavedResponses();
  const item = responses.find(r => r.id_submissao === idSubmissao);
  if (item) {
    item.sync_status = newStatus;
    localStorage.setItem(STORAGE_KEYS.RESPONSES, JSON.stringify(responses));
  }
}

async function sendResponseToFirebase(payload) {
  if (appState.isFirebaseActive && appState.db) {
    try {
      await appState.db.collection('respostas_andav_2026').doc(payload.id_submissao).set(payload);
      console.log('[Firebase Firestore] Resposta gravada na nuvem:', payload.id_submissao);
      return true;
    } catch (err) {
      console.warn('[Firebase Error] Envio direto falhou, mantendo na fila offline:', err);
      return false;
    }
  }
  console.log('[Simulação Firebase] Dados salvos localmente.');
  return true;
}

async function syncPendingData() {
  const responses = getSavedResponses();
  const pending = responses.filter(r => r.sync_status === 'pending');
  if (pending.length === 0) {
    await pullRemoteDataFromFirebase();
    return;
  }

  const badgeText = document.getElementById('syncStatusText');
  badgeText.textContent = `Sync Firebase (${pending.length})...`;

  for (const item of pending) {
    const success = await sendResponseToFirebase(item);
    if (success) {
      updateLocalResponseSyncStatus(item.id_submissao, 'synced');
    }
  }

  await pullRemoteDataFromFirebase();
  updateSyncStatusBadge();
  updateSavedCountModal();
}

async function pullRemoteDataFromFirebase() {
  if (!appState.isFirebaseActive || !appState.db) return false;

  try {
    const snapshot = await appState.db.collection('respostas_andav_2026').get();
    if (snapshot.empty) return false;

    const localResponses = getSavedResponses();
    const localMap = new Map();
    localResponses.forEach(r => {
      if (r && r.id_submissao) localMap.set(r.id_submissao, r);
    });

    snapshot.forEach(doc => {
      const remoteData = doc.data();
      if (remoteData && remoteData.id_submissao) {
        remoteData.sync_status = 'synced';
        localMap.set(remoteData.id_submissao, remoteData);
      }
    });

    const updatedList = Array.from(localMap.values());
    updatedList.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));

    localStorage.setItem(STORAGE_KEYS.RESPONSES, JSON.stringify(updatedList));

    updateSyncStatusBadge();
    updateSavedCountModal();
    renderReportsTab();
    return true;
  } catch (err) {
    console.warn('[Firebase Pull Error] Não foi possível carregar registros remotos:', err);
    return false;
  }
}

function showSuccessScreen(payload) {
  document.getElementById('surveyForm').style.display = 'none';
  document.getElementById('successSection').style.display = 'block';

  document.getElementById('summarySubId').textContent = payload.id_submissao;
  document.getElementById('summaryInterviewer').textContent = `${payload.metadata.entrevistador} (${payload.metadata.dispositivo_id})`;
  document.getElementById('summaryMode').textContent = payload.metadata.modo_aplicacao === 'essencial' ? '⚡ Essencial (2-3 min)' : '📋 Completo (7-9 min)';
  
  const statusEl = document.getElementById('summarySyncStatus');
  if (payload.sync_status === 'synced') {
    statusEl.innerHTML = '<span style="color: var(--syngenta-green-light);">🟢 Firebase Firestore Sincronizado</span>';
  } else {
    statusEl.innerHTML = '<span style="color: var(--accent-yellow);">🟡 Salvo no Tablet (Pendente Sync Firebase)</span>';
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetSurveyForm() {
  document.getElementById('surveyForm').reset();
  appState.p3State = { acessa_agro: null, syde: null, smart_engage: null, cropwise: null };
  
  document.getElementById('successSection').style.display = 'none';
  document.getElementById('sessionSetupSection').style.display = 'block';
  
  updateProgressBar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ==========================================================================
   6. GERENCIADOR DE DADOS, MODAIS E ABA DE RELATÓRIOS & ANALYTICS
   ========================================================================== */
function getRadioValue(name) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  return checked ? checked.value : '';
}

function updateSyncStatusBadge() {
  const badge = document.getElementById('syncStatusBadge');
  const text = document.getElementById('syncStatusText');
  const pendingBadge = document.getElementById('pendingCountBadge');
  
  const responses = getSavedResponses();
  const pending = responses.filter(r => r.sync_status === 'pending').length;

  if (pending > 0) {
    pendingBadge.style.display = 'flex';
    pendingBadge.textContent = pending;
    badge.className = 'sync-status status-pending';
    text.textContent = `${pending} Pendente${pending > 1 ? 's' : ''}`;
  } else {
    pendingBadge.style.display = 'none';
    badge.className = 'sync-status status-online';
    text.textContent = appState.isFirebaseActive ? 'Firebase Conectado' : 'Modo Local Ativo';
  }
}

function openSettingsModal() {
  document.getElementById('settingsModal').style.display = 'flex';
  updateSavedCountModal();
  pullRemoteDataFromFirebase();
}

function openReportsModal() {
  openSettingsModal();
  switchTab('reports');
}

function closeSettingsModal() {
  document.getElementById('settingsModal').style.display = 'none';
}

function switchTab(tab) {
  document.getElementById('tabEndpointBtn').classList.toggle('active', tab === 'endpoint');
  document.getElementById('tabReportsBtn').classList.toggle('active', tab === 'reports');
  document.getElementById('tabDataBtn').classList.toggle('active', tab === 'data');

  document.getElementById('tabEndpointContent').style.display = tab === 'endpoint' ? 'block' : 'none';
  document.getElementById('tabReportsContent').style.display = tab === 'reports' ? 'block' : 'none';
  document.getElementById('tabDataContent').style.display = tab === 'data' ? 'block' : 'none';

  if (tab === 'reports') {
    renderReportsTab();
  }
  if (tab === 'data') {
    updateSavedCountModal();
  }
}

function saveFirebaseConfig() {
  const apiKey = document.getElementById('firebaseApiKey').value.trim();
  const projectId = document.getElementById('firebaseProjectId').value.trim();
  const appId = document.getElementById('firebaseAppId').value.trim();
  const geminiKey = document.getElementById('geminiApiKey').value.trim();

  const config = { apiKey, projectId, appId };
  localStorage.setItem(STORAGE_KEYS.FIREBASE_CONFIG, JSON.stringify(config));

  if (geminiKey) {
    localStorage.setItem(STORAGE_KEYS.GEMINI_KEY, geminiKey);
    appState.geminiApiKey = geminiKey;
  } else {
    localStorage.removeItem(STORAGE_KEYS.GEMINI_KEY);
    appState.geminiApiKey = '';
  }

  initFirebaseIfConfigured();
  alert('Credenciais do Firebase e chave da API Gemini salvas!');
}

async function testFirebaseConnection() {
  saveFirebaseConfig();
  const resultBox = document.getElementById('apiTestResult');
  resultBox.style.display = 'block';

  if (appState.isFirebaseActive && appState.db) {
    resultBox.style.background = 'rgba(16, 185, 129, 0.2)';
    resultBox.style.borderColor = 'var(--syngenta-green)';
    resultBox.style.color = 'var(--syngenta-green-light)';
    resultBox.textContent = '✅ Conectado com sucesso ao Firebase Firestore com suporte offline!';
  } else {
    resultBox.style.background = 'rgba(245, 158, 11, 0.2)';
    resultBox.style.borderColor = 'var(--accent-yellow)';
    resultBox.style.color = 'var(--accent-yellow)';
    resultBox.textContent = '⚠️ Preencha a API Key e o Project ID do Firebase para ativar o banco em nuvem real.';
  }
}

/* RENDERIZADOR DO PAINEL DE RELATÓRIOS & ANALYTICS */
function renderReportsTab() {
  const responses = getSavedResponses();
  const total = responses.length;

  document.getElementById('kpiTotalCount').textContent = total;

  if (total === 0) {
    document.getElementById('kpiCompletoPct').textContent = '0%';
    document.getElementById('kpiCompletoCount').textContent = '0 entrevistas';
    document.getElementById('kpiEssencialPct').textContent = '0%';
    document.getElementById('kpiEssencialCount').textContent = '0 entrevistas';
    document.getElementById('kpiAvgDuration').textContent = '0s';
    
    document.getElementById('p1DistributionList').innerHTML = '<p class="text-muted text-sm">Nenhuma resposta gravada até o momento.</p>';
    document.getElementById('p3DistributionGrid').innerHTML = '<p class="text-muted text-sm">Nenhuma resposta gravada até o momento.</p>';
    document.getElementById('p4DistributionList').innerHTML = '<p class="text-muted text-sm">Sem dados.</p>';
    document.getElementById('p5DistributionList').innerHTML = '<p class="text-muted text-sm">Sem dados.</p>';
    return;
  }

  // KPIs de Modo
  const completoCount = responses.filter(r => r.metadata.modo_aplicacao === 'completo').length;
  const essencialCount = responses.filter(r => r.metadata.modo_aplicacao === 'essencial').length;
  const avgDuration = Math.round(responses.reduce((sum, r) => sum + (r.metadata.duracao_segundos || 0), 0) / total);

  document.getElementById('kpiCompletoPct').textContent = `${Math.round((completoCount / total) * 100)}%`;
  document.getElementById('kpiCompletoCount').textContent = `${completoCount} entrevistas`;
  document.getElementById('kpiEssencialPct').textContent = `${Math.round((essencialCount / total) * 100)}%`;
  document.getElementById('kpiEssencialCount').textContent = `${essencialCount} entrevistas`;
  document.getElementById('kpiAvgDuration').textContent = `${avgDuration}s`;

  // Gráfico P1 (Atividades)
  const p1Counts = {};
  responses.forEach(r => {
    const act = r.bloco_0_essencial.p1_atividade || 'Não especificado';
    p1Counts[act] = (p1Counts[act] || 0) + 1;
  });
  renderBarList('p1DistributionList', p1Counts, total);

  // Gráfico P3 (Matriz Plataformas)
  const p3Grid = document.getElementById('p3DistributionGrid');
  p3Grid.innerHTML = '';
  const platforms = ['acessa_agro', 'syde', 'smart_engage', 'cropwise'];
  
  platforms.forEach(platKey => {
    const counts = { 'uso_atualmente': 0, 'conheco_nunca_usei': 0, 'ja_usei_parei': 0, 'nao_conheco': 0 };
    responses.forEach(r => {
      const val = r.bloco_0_essencial.p3_matriz?.[platKey];
      if (val && counts[val] !== undefined) counts[val]++;
    });

    const platBox = document.createElement('div');
    platBox.className = 'sub-report-box';
    platBox.innerHTML = `<h5>${PLATFORM_NAMES[platKey]}</h5>`;
    const listDiv = document.createElement('div');
    renderBarListInContainer(listDiv, {
      'Uso Atualmente': counts.uso_atualmente,
      'Conheço, nunca usei': counts.conheco_nunca_usei,
      'Já usei, parei': counts.ja_usei_parei,
      'Não conheço': counts.nao_conheco
    }, total);
    platBox.appendChild(listDiv);
    p3Grid.appendChild(platBox);
  });

  // Gráficos P4 e P5
  const p4Counts = {};
  const p5Counts = {};
  responses.forEach(r => {
    const p4 = r.bloco_0_essencial.p4_dor_compra;
    if (p4) p4Counts[p4] = (p4Counts[p4] || 0) + 1;
    const p5 = r.bloco_0_essencial.p5_dor_credito;
    if (p5) p5Counts[p5] = (p5Counts[p5] || 0) + 1;
  });

  renderBarList('p4DistributionList', p4Counts, total);
  renderBarList('p5DistributionList', p5Counts, total);
}

function renderBarList(containerId, countsObj, total) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  renderBarListInContainer(container, countsObj, total);
}

function renderBarListInContainer(container, countsObj, total) {
  const keys = Object.keys(countsObj);
  if (keys.length === 0) {
    container.innerHTML = '<p class="text-muted text-sm">Sem dados registrados.</p>';
    return;
  }

  keys.forEach(key => {
    const count = countsObj[key];
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;

    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <div class="bar-info">
        <span class="bar-name">${key}</span>
        <span class="bar-count">${count} (${pct}%)</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill" style="width: ${pct}%;"></div>
      </div>
    `;
    container.appendChild(row);
  });
}

function updateSavedCountModal() {
  const responses = getSavedResponses();
  const total = responses.length;
  const synced = responses.filter(r => r.sync_status === 'synced').length;
  const pending = responses.filter(r => r.sync_status === 'pending').length;

  document.getElementById('modalSavedCount').textContent = total;
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statSynced').textContent = synced;
  document.getElementById('statPending').textContent = pending;

  const tbody = document.getElementById('savedDataTableBody');
  if (total === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhuma resposta registrada ainda.</td></tr>';
    return;
  }

  tbody.innerHTML = responses.map(r => `
    <tr>
      <td>${new Date(r.created_at).toLocaleDateString()} ${new Date(r.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
      <td>${r.metadata.entrevistador || '-'} (${r.metadata.dispositivo_id})</td>
      <td>${r.bloco_0_essencial.p1_atividade || '-'}</td>
      <td><span class="tag">${r.metadata.modo_aplicacao}</span></td>
      <td>${r.sync_status === 'synced' ? '🟢 Firebase' : '🟡 Pendente'}</td>
    </tr>
  `).join('');
}

async function forceManualSync() {
  await syncPendingData();
  const pulled = await pullRemoteDataFromFirebase();
  if (pulled) {
    alert('Sincronização bidirecional com o Firebase finalizada com sucesso!');
  } else {
    alert('Sincronização manual com o Firebase finalizada.');
  }
}

/* EXPORTAÇÃO COMPLETA E ORGANIZADA EM CSV (EXCEL BOM UTF-8) */
function exportDataAsCSV() {
  const responses = getSavedResponses();
  if (responses.length === 0) {
    alert('Nenhum dado para exportar.');
    return;
  }

  const headers = [
    'ID_Submissao', 'Data_Hora', 'Pesquisador', 'Dispositivo_Tablet', 'Modo_Aplicacao', 'Duracao_Segundos',
    'P1_Atividade', 'P1_Outro', 'P2_Papel', 'P2_Outro',
    'P3_Acessa_Agro', 'P3_Syde', 'P3_Smart_Engage', 'P3_Cropwise',
    'P4_Dor_Compra', 'P4_Outro', 'P5_Dor_Credito', 'P5_Outro',
    'P6_Gosta', 'P6_Incomoda',
    'P7_Porte', 'P8_Estado', 'P9_Usa_Ferramentas', 'P9_Quais_Ferramentas', 'P9_Qtd_Sistemas', 'P9_Mais_Gosta', 'P9_Menos_Gosta',
    'P10_Plataforma_Nao_Usou', 'P10_Motivo', 'P10_Outro',
    'P11_Plataforma_Uso_Atual', 'P11_Descricao',
    'P12_Plataforma_Parou_Usar', 'P12_Motivo', 'P12_Outro',
    'P13_Canal_Nao_Conhece', 'P13_Outro',
    'P14_Credito_Pesa', 'P14_Outro',
    'P15_Credito_Onde', 'P15_Credito_Dificuldade',
    'P16_Fidelidade_Avaliacao', 'P16_Outro',
    'P17_Valer_Pena',
    'P18_Gestao_Desafio', 'P18_Outro',
    'P19_RTV_Avaliacao', 'P19_RTV_Porque',
    'P20_Experiencia_Livre',
    'P21_Recrutamento_OptIn', 'P21_Nome', 'P21_Contato',
    'Status_Sync_Firebase'
  ];

  const csvRows = [headers.join(';')];

  responses.forEach(r => {
    const row = [
      escapeCsv(r.id_submissao),
      escapeCsv(r.created_at),
      escapeCsv(r.metadata?.entrevistador),
      escapeCsv(r.metadata?.dispositivo_id),
      escapeCsv(r.metadata?.modo_aplicacao),
      r.metadata?.duracao_segundos || 0,

      escapeCsv(r.bloco_0_essencial?.p1_atividade),
      escapeCsv(r.bloco_0_essencial?.p1_outro),
      escapeCsv(r.bloco_0_essencial?.p2_papel),
      escapeCsv(r.bloco_0_essencial?.p2_outro),

      escapeCsv(r.bloco_0_essencial?.p3_matriz?.acessa_agro),
      escapeCsv(r.bloco_0_essencial?.p3_matriz?.syde),
      escapeCsv(r.bloco_0_essencial?.p3_matriz?.smart_engage),
      escapeCsv(r.bloco_0_essencial?.p3_matriz?.cropwise),

      escapeCsv(r.bloco_0_essencial?.p4_dor_compra),
      escapeCsv(r.bloco_0_essencial?.p4_outro),
      escapeCsv(r.bloco_0_essencial?.p5_dor_credito),
      escapeCsv(r.bloco_0_essencial?.p5_outro),

      escapeCsv(r.bloco_0_essencial?.p6_gosta),
      escapeCsv(r.bloco_0_essencial?.p6_incomoda),

      escapeCsv(r.bloco_1_perfil?.p7_tamanho),
      escapeCsv(r.bloco_1_perfil?.p8_estado),
      escapeCsv(r.bloco_1_perfil?.p9_usa_ferramentas),
      escapeCsv(r.bloco_1_perfil?.p9_quais),
      escapeCsv(r.bloco_1_perfil?.p9_qtd_sistemas),
      escapeCsv(r.bloco_1_perfil?.p9_mais_gosta),
      escapeCsv(r.bloco_1_perfil?.p9_menos_gosta),

      escapeCsv(r.bloco_2_awareness?.p10_nunca_usou?.plataforma),
      escapeCsv(r.bloco_2_awareness?.p10_nunca_usou?.motivo),
      escapeCsv(r.bloco_2_awareness?.p10_nunca_usou?.outro),

      escapeCsv(r.bloco_2_awareness?.p11_uso_atual?.plataforma),
      escapeCsv(r.bloco_2_awareness?.p11_uso_atual?.descricao),

      escapeCsv(r.bloco_2_awareness?.p12_parou_usar?.plataforma),
      escapeCsv(r.bloco_2_awareness?.p12_parou_usar?.motivo),
      escapeCsv(r.bloco_2_awareness?.p12_parou_usar?.outro),

      escapeCsv(r.bloco_2_awareness?.p13_nao_conhece?.canal),
      escapeCsv(r.bloco_2_awareness?.p13_nao_conhece?.outro),

      escapeCsv(r.bloco_3_dores?.p14_credito_pesam),
      escapeCsv(r.bloco_3_dores?.p14_outro),

      escapeCsv(r.bloco_3_dores?.p15_credito_historico?.onde),
      escapeCsv(r.bloco_3_dores?.p15_credito_historico?.dificuldade),

      escapeCsv(r.bloco_3_dores?.p16_fidelidade),
      escapeCsv(r.bloco_3_dores?.p16_outro),
      escapeCsv(r.bloco_3_dores?.p17_fidelidade_valer_pena),

      escapeCsv(r.bloco_3_dores?.p18_desafios_gestao),
      escapeCsv(r.bloco_3_dores?.p18_outro),

      escapeCsv(r.bloco_3_dores?.p19_rtv?.avaliacao),
      escapeCsv(r.bloco_3_dores?.p19_rtv?.porque),

      escapeCsv(r.encerramentos?.p20_experiencia),
      escapeCsv(r.encerramentos?.p21_recrutamento),
      escapeCsv(r.encerramentos?.p21_nome),
      escapeCsv(r.encerramentos?.p21_contato),

      escapeCsv(r.sync_status)
    ];
    csvRows.push(row.join(';'));
  });

  const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Pesquisa_ANDAV_2026_Respostas_Organizadas_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

function escapeCsv(val) {
  if (!val) return '""';
  const str = String(val).replace(/"/g, '""').replace(/\n/g, ' ');
  return `"${str}"`;
}

function exportDataAsJSON() {
  const responses = getSavedResponses();
  if (responses.length === 0) {
    alert('Nenhum dado para exportar.');
    return;
  }
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(responses, null, 2));
  const a = document.createElement('a');
  a.href = dataStr;
  a.download = `Pesquisa_ANDAV_2026_Data_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
}

function clearLocalData() {
  if (confirm('Tem certeza que deseja apagar TODAS as respostas armazenadas neste tablet? Esta ação é irreversível!')) {
    localStorage.removeItem(STORAGE_KEYS.RESPONSES);
    updateSyncStatusBadge();
    updateSavedCountModal();
    alert('Dados locais limpos.');
  }
}
