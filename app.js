/*
  Supabase setup notes:
  1) Create tables: users(id uuid primary key references auth.users, full_name text, avatar_url text, created_at timestamptz default now())
     and saved_mixes(id uuid default gen_random_uuid() primary key, user_id uuid references auth.users, name text, mix jsonb, created_at timestamptz default now()).
  2) Enable Row Level Security. Policies: users can select/insert/update own users row; saved_mixes user_id = auth.uid().
  3) Add Google provider in Supabase Auth and set Vercel URL as an allowed redirect URL.
*/
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';
const supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const sounds = [
  { id: 'rain', name: 'Yağmur', icon: '☔', category: 'Doğa', color: '#9d4edd', type: 'noise', filter: 900, defaultVolume: 40 },
  { id: 'white', name: 'Beyaz Gürültü', icon: '◌', category: 'Noise', color: '#e0aaff', type: 'noise', filter: 3600, defaultVolume: 25 },
  { id: 'meditation', name: 'Meditasyon', icon: 'ॐ', category: 'Meditasyon', color: '#c77dff', type: 'tone', frequency: 174, defaultVolume: 30 },
  { id: 'forest', name: 'Orman', icon: '🌿', category: 'Doğa', color: '#80ffdb', type: 'tone', frequency: 396, defaultVolume: 24 },
  { id: 'fire', name: 'Kamp Ateşi', icon: '🔥', category: 'Ateş', color: '#ff9e64', type: 'noise', filter: 520, defaultVolume: 35 },
  { id: 'mix', name: 'Karma Aura', icon: '✦', category: 'Karma', color: '#7b2cbf', type: 'tone', frequency: 285, defaultVolume: 28 }
];

const state = { audio: null, masterGain: null, nodes: new Map(), active: new Set(), timer: null, timerEnd: null, user: null, onboarding: [] };
const $ = (selector) => document.querySelector(selector);

function initAudio() {
  if (state.audio) return;
  // Mobile optimization: create Web Audio only after user gesture; iOS/Safari keeps gesture permission for background audio better.
  state.audio = new (window.AudioContext || window.webkitAudioContext)();
  state.masterGain = state.audio.createGain();
  state.masterGain.gain.value = 0.85;
  state.masterGain.connect(state.audio.destination);
}

function createNoiseBuffer() {
  const buffer = state.audio.createBuffer(1, state.audio.sampleRate * 2, state.audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function startSound(sound) {
  initAudio();
  if (state.audio.state === 'suspended') state.audio.resume();
  if (state.nodes.has(sound.id)) return;
  const gain = state.audio.createGain();
  gain.gain.value = 0;
  let source;
  if (sound.type === 'noise') {
    source = state.audio.createBufferSource();
    source.buffer = createNoiseBuffer();
    source.loop = true;
    const filter = state.audio.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = sound.filter;
    source.connect(filter).connect(gain).connect(state.masterGain);
  } else {
    source = state.audio.createOscillator();
    source.type = sound.id === 'forest' ? 'triangle' : 'sine';
    source.frequency.value = sound.frequency;
    source.connect(gain).connect(state.masterGain);
  }
  source.start();
  const volume = Number($(`#volume-${sound.id}`).value) / 100;
  gain.gain.linearRampToValueAtTime(volume, state.audio.currentTime + 0.45);
  state.nodes.set(sound.id, { source, gain });
  state.active.add(sound.id);
  updateUi();
}

function stopSound(id, fade = 0.35) {
  const node = state.nodes.get(id);
  if (!node || !state.audio) return;
  node.gain.gain.cancelScheduledValues(state.audio.currentTime);
  node.gain.gain.linearRampToValueAtTime(0.0001, state.audio.currentTime + fade);
  setTimeout(() => { try { node.source.stop(); } catch {} state.nodes.delete(id); state.active.delete(id); updateUi(); }, fade * 1000 + 60);
}

function setVolume(id, value) {
  const node = state.nodes.get(id);
  if (node && state.audio) node.gain.gain.linearRampToValueAtTime(Number(value) / 100, state.audio.currentTime + 0.08);
}

function renderSounds() {
  $('#soundGrid').innerHTML = sounds.map((sound) => `
    <article id="card-${sound.id}" class="sound-card rounded-[1.5rem] p-3 transition duration-300">
      <button class="sound-toggle touch-target flex w-full flex-col items-start rounded-2xl p-2 text-left active:scale-95" data-id="${sound.id}">
        <span class="text-3xl">${sound.icon}</span>
        <span class="mt-3 font-semibold">${sound.name}</span>
        <span class="text-xs text-white/40">${sound.category}</span>
      </button>
      <input id="volume-${sound.id}" class="mt-2" type="range" min="0" max="100" value="${sound.defaultVolume}" aria-label="${sound.name} ses seviyesi" />
    </article>`).join('');
}

function updateUi() {
  sounds.forEach((sound) => $(`#card-${sound.id}`)?.classList.toggle('is-active', state.active.has(sound.id)));
  const names = sounds.filter((s) => state.active.has(s.id)).map((s) => s.name);
  $('#activeSummary').textContent = names.length ? names.join(' + ') : 'Henüz ses seçilmedi.';
  $('#masterToggle').textContent = names.length ? 'Duraklat' : 'Başlat';
}

function applyPreset(name) {
  const presets = { deep: { rain: 35, fire: 20, meditation: 28 }, focus: { white: 32, meditation: 22 }, nature: { rain: 30, forest: 30, fire: 18 } };
  stopAll(0.2);
  Object.entries(presets[name] || {}).forEach(([id, volume]) => { $(`#volume-${id}`).value = volume; startSound(sounds.find((s) => s.id === id)); });
}

function stopAll(fade = 1.2) { [...state.active].forEach((id) => stopSound(id, fade)); }

function startTimer(minutes) {
  clearInterval(state.timer);
  state.timerEnd = Date.now() + minutes * 60_000;
  state.timer = setInterval(() => {
    const left = Math.max(0, state.timerEnd - Date.now());
    $('#timerStatus').textContent = left ? `${Math.ceil(left / 60000)} dakika sonra yumuşak kapanış.` : 'Fade-out başladı.';
    if (!left) { clearInterval(state.timer); stopAll(8); }
  }, 1000);
}

async function signIn() {
  await supabaseClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin } });
}
async function loadSession() {
  if (!supabaseClient || SUPABASE_URL.includes('YOUR-PROJECT')) return;
  const { data } = await supabaseClient.auth.getUser();
  state.user = data.user;
  if (!state.user) return;
  $('#authButton').classList.add('hidden');
  $('#profileChip').classList.remove('hidden'); $('#profileChip').classList.add('flex');
  $('#profileAvatar').src = state.user.user_metadata.avatar_url || '';
  $('#profileName').textContent = state.user.user_metadata.full_name || 'Profil';
  await loadMixes();
}
async function saveMix() {
  if (!state.user) return alert('Önce Google ile giriş yapmalısın.');
  const mix = sounds.map((s) => ({ id: s.id, volume: Number($(`#volume-${s.id}`).value), active: state.active.has(s.id) }));
  await supabaseClient.from('saved_mixes').insert({ user_id: state.user.id, name: `Aura ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`, mix });
  await loadMixes();
}
async function loadMixes() {
  const { data } = await supabaseClient.from('saved_mixes').select('*').eq('user_id', state.user.id).order('created_at', { ascending: false }).limit(8);
  $('#savedMixes').innerHTML = (data || []).map((m) => `<button class="saved-mix touch-target shrink-0 rounded-full bg-white/10 px-4 text-sm" data-mix='${JSON.stringify(m.mix)}'>${m.name}</button>`).join('');
}
function restoreMix(mix) { stopAll(0.2); mix.forEach((item) => { $(`#volume-${item.id}`).value = item.volume; if (item.active) startSound(sounds.find((s) => s.id === item.id)); }); }

function initOnboarding() {
  if (localStorage.getItem('sleeply-onboarded')) return;
  $('#onboarding').classList.remove('hidden');
}
function nextOnboarding(answer) {
  state.onboarding.push(answer);
  const index = state.onboarding.length;
  if (index < 3) $('#onboardingSlides').style.transform = `translateX(-${index * 100}%)`;
  else {
    localStorage.setItem('sleeply-onboarded', '1');
    $('#onboarding').classList.add('hidden');
    document.documentElement.style.setProperty('--aura-shift', answer === 'blue' ? '#4361ee' : '#9d4edd');
    applyPreset(state.onboarding.includes('deep') ? 'deep' : 'nature');
  }
}

function initAuraCanvas() {
  const canvas = $('#auraCanvas'); const ctx = canvas.getContext('2d'); let t = 0;
  const resize = () => { canvas.width = innerWidth * devicePixelRatio; canvas.height = innerHeight * devicePixelRatio; };
  addEventListener('resize', resize, { passive: true }); resize();
  const draw = () => {
    t += 0.003; ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 3; i += 1) {
      const x = canvas.width * (0.25 + i * 0.25 + Math.sin(t + i) * 0.08);
      const y = canvas.height * (0.28 + Math.cos(t + i) * 0.12);
      const g = ctx.createRadialGradient(x, y, 0, x, y, canvas.width * 0.45);
      g.addColorStop(0, i === 1 ? 'rgba(157,78,221,.28)' : 'rgba(67,97,238,.16)'); g.addColorStop(1, 'transparent');
      ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    requestAnimationFrame(draw);
  }; draw();
}

document.addEventListener('click', (event) => {
  const toggle = event.target.closest('.sound-toggle'); if (toggle) { const id = toggle.dataset.id; state.active.has(id) ? stopSound(id) : startSound(sounds.find((s) => s.id === id)); }
  const timer = event.target.closest('.timer-btn'); if (timer) startTimer(Number(timer.dataset.minutes));
  const preset = event.target.closest('.preset-btn'); if (preset) applyPreset(preset.dataset.preset);
  const onboard = event.target.closest('.onboard-choice'); if (onboard) nextOnboarding(onboard.dataset.answer);
  const saved = event.target.closest('.saved-mix'); if (saved) restoreMix(JSON.parse(saved.dataset.mix));
});
document.addEventListener('input', (event) => { if (event.target.matches('input[type="range"]')) setVolume(event.target.id.replace('volume-', ''), event.target.value); }, { passive: true });
$('#masterToggle').addEventListener('click', () => state.active.size ? stopAll() : applyPreset('deep'));
$('#stopAllButton').addEventListener('click', () => stopAll());
$('#authButton').addEventListener('click', signIn);
$('#saveMixButton').addEventListener('click', saveMix);
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.audio?.state === 'suspended') state.audio.resume(); });

renderSounds(); initAuraCanvas(); initOnboarding(); loadSession();
