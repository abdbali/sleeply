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

const AUDIO_BASE = 'https://cdn.jsdelivr.net/gh/bradtraversy/ambient-sound-mixer@main/audio';
const BABY_AUDIO_BASE = 'https://raw.githubusercontent.com/brarcher/baby-sleep-sounds/master/app/src/main/res/raw';

const sounds = [
  { id: 'rain', name: 'Yağmur', category: 'Doğa', image: 'linear-gradient(145deg, rgba(57,44,101,.95), rgba(11,13,28,.72)), radial-gradient(circle at 30% 20%, rgba(199,125,255,.85), transparent 34%)', src: `${AUDIO_BASE}/rain.mp3`, defaultVolume: 42 },
  { id: 'ocean', name: 'Okyanus', category: 'Su', image: 'linear-gradient(145deg, rgba(19,62,93,.92), rgba(4,8,20,.82)), radial-gradient(circle at 78% 16%, rgba(72,191,227,.82), transparent 33%)', src: `${AUDIO_BASE}/ocean.mp3`, defaultVolume: 34 },
  { id: 'forest', name: 'Orman', category: 'Doğa', image: 'linear-gradient(145deg, rgba(23,70,55,.9), rgba(5,12,16,.84)), radial-gradient(circle at 26% 24%, rgba(128,255,219,.62), transparent 31%)', src: `${AUDIO_BASE}/birds.mp3`, defaultVolume: 26 },
  { id: 'fireplace', name: 'Kamp Ateşi', category: 'Ateş', image: 'linear-gradient(145deg, rgba(114,43,21,.9), rgba(12,7,10,.86)), radial-gradient(circle at 30% 18%, rgba(255,158,100,.9), transparent 34%)', src: `${AUDIO_BASE}/fireplace.mp3`, defaultVolume: 32 },
  { id: 'thunder', name: 'Uzak Fırtına', category: 'Yağmur', image: 'linear-gradient(145deg, rgba(54,47,89,.92), rgba(5,5,16,.86)), radial-gradient(circle at 72% 20%, rgba(224,170,255,.6), transparent 28%)', src: `${AUDIO_BASE}/thunder.mp3`, defaultVolume: 18 },
  { id: 'wind', name: 'Rüzgar', category: 'Hava', image: 'linear-gradient(145deg, rgba(60,73,95,.88), rgba(8,10,20,.86)), radial-gradient(circle at 20% 18%, rgba(180,205,255,.55), transparent 33%)', src: `${AUDIO_BASE}/wind.mp3`, defaultVolume: 24 },
  { id: 'night', name: 'Gece Bahçesi', category: 'Gece', image: 'linear-gradient(145deg, rgba(31,30,77,.92), rgba(0,0,8,.9)), radial-gradient(circle at 75% 18%, rgba(157,78,221,.7), transparent 30%)', src: `${AUDIO_BASE}/night.mp3`, defaultVolume: 22 },
  { id: 'cafe', name: 'Loş Kafe', category: 'Ambiyans', image: 'linear-gradient(145deg, rgba(89,54,33,.9), rgba(9,7,10,.88)), radial-gradient(circle at 25% 22%, rgba(255,214,165,.64), transparent 31%)', src: `${AUDIO_BASE}/cafe.mp3`, defaultVolume: 18 },
  { id: 'stream', name: 'Dere Akışı', category: 'Su', image: 'linear-gradient(145deg, rgba(16,79,91,.92), rgba(4,12,18,.88)), radial-gradient(circle at 70% 15%, rgba(72,219,251,.66), transparent 34%)', src: `${BABY_AUDIO_BASE}/stream.mp3`, defaultVolume: 30 },
  { id: 'fan', name: 'Yumuşak Fan', category: 'Beyaz Gürültü', image: 'linear-gradient(145deg, rgba(80,84,104,.9), rgba(7,8,16,.88)), radial-gradient(circle at 24% 18%, rgba(238,242,255,.52), transparent 30%)', src: `${BABY_AUDIO_BASE}/fan.mp3`, defaultVolume: 28 }
];

const state = { audio: new Map(), active: new Set(), timer: null, timerEnd: null, user: null, onboarding: [] };
const $ = (selector) => document.querySelector(selector);

function createAudio(sound) {
  if (state.audio.has(sound.id)) return state.audio.get(sound.id);
  const audio = new Audio(sound.src);
  audio.loop = true;
  audio.preload = 'metadata';
  audio.crossOrigin = 'anonymous';
  audio.volume = 0;
  audio.playsInline = true;
  // Mobile optimization: HTML5 Audio is created lazily and started by a user gesture for iOS/Android autoplay rules.
  state.audio.set(sound.id, audio);
  return audio;
}

function fadeVolume(audio, target, duration = 450, onDone) {
  const start = audio.volume;
  const startAt = performance.now();
  const step = (now) => {
    const progress = Math.min(1, (now - startAt) / duration);
    audio.volume = start + (target - start) * progress;
    if (progress < 1) requestAnimationFrame(step);
    else onDone?.();
  };
  requestAnimationFrame(step);
}

async function startSound(sound) {
  const audio = createAudio(sound);
  if (state.active.has(sound.id)) return;
  audio.currentTime = audio.currentTime || 0;
  try { await audio.play(); } catch (error) { console.warn(`Audio could not start: ${sound.name}`, error); return; }
  const volume = Number($(`#volume-${sound.id}`).value) / 100;
  fadeVolume(audio, volume, 520);
  state.active.add(sound.id);
  updateUi();
}

function stopSound(id, fade = 0.35) {
  const audio = state.audio.get(id);
  if (!audio) return;
  fadeVolume(audio, 0, fade * 1000, () => { audio.pause(); state.active.delete(id); updateUi(); });
}

function setVolume(id, value) {
  const audio = state.audio.get(id);
  if (audio) audio.volume = Number(value) / 100;
}

function renderSounds() {
  $('#soundGrid').innerHTML = sounds.map((sound) => `
    <article id="card-${sound.id}" class="sound-card rounded-[1.5rem] p-3 transition duration-300">
      <button class="sound-toggle touch-target flex w-full flex-col items-start rounded-2xl p-2 text-left active:scale-95" data-id="${sound.id}">
        <span class="premium-art mb-3" style="--art:${sound.image}"><span></span></span>
        <span class="font-semibold">${sound.name}</span>
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
  const presets = {
    deep: { rain: 36, fireplace: 18, night: 22, fan: 18 },
    focus: { fan: 34, cafe: 16, wind: 18 },
    nature: { rain: 26, forest: 28, stream: 28, thunder: 12 }
  };
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
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  state.active.forEach((id) => state.audio.get(id)?.play().catch(() => {}));
});

renderSounds(); initAuraCanvas(); initOnboarding(); loadSession();
