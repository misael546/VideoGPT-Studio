const form = document.querySelector('#chatForm');
const input = document.querySelector('#message');
const sendBtn = document.querySelector('#sendBtn');
const welcome = document.querySelector('#welcome');
const workspace = document.querySelector('#workspace');
const gallery = document.querySelector('#gallery');
const galleryGrid = document.querySelector('#galleryGrid');
const galleryCount = document.querySelector('#videoCount');
const composerWrap = document.querySelector('#composerWrap');
const conversation = document.querySelector('#conversation');
const title = document.querySelector('#projectTitle');
const status = document.querySelector('#projectStatus');
const generateBtn = document.querySelector('#generateVideo');
const generationNote = document.querySelector('#generationNote');
const resultVideo = document.querySelector('#resultVideo');
const resultLink = document.querySelector('#resultLink');
const ACTIONS_URL = 'https://github.com/misael546/VideoGPT-Studio/actions/workflows/generate-free-video.yml';
let currentPrompt = '';

function showSection(section) {
  welcome.classList.toggle('hidden', section !== 'welcome');
  workspace.classList.toggle('hidden', section !== 'create');
  gallery.classList.toggle('hidden', section !== 'gallery');
  composerWrap.classList.toggle('hidden', section === 'gallery');
  document.querySelector('#navCreate').classList.toggle('active', section === 'create' || section === 'welcome');
  document.querySelector('#navGallery').classList.toggle('active', section === 'gallery');
}
function beginProject(prompt = '') {
  showSection('welcome');
  if (prompt) input.value = prompt;
  input.focus();
}
function openChatGPTForEditing() {
  window.open('https://chatgpt.com/', '_blank', 'noopener,noreferrer');
}
function resetVideo() {
  resultVideo.pause();
  resultVideo.classList.add('hidden');
  resultVideo.removeAttribute('src');
  resultLink.classList.add('hidden');
  resultLink.removeAttribute('href');
  generateBtn.disabled = false;
  generateBtn.textContent = 'Generar corto gratis en GitHub';
  generationNote.textContent = 'El corto gratuito actual es predefinido; todavía no se adapta automáticamente a tu descripción.';
}
document.querySelector('#navCreate').addEventListener('click', () => showSection('welcome'));
document.querySelector('#navGallery').addEventListener('click', () => {
  showSection('gallery');
  loadGallery();
});
for (const id of ['sidebarStart', 'topCreate', 'heroCreate', 'galleryCreate']) {
  document.querySelector('#' + id).addEventListener('click', () => beginProject());
}
document.querySelector('#sidebarStart').addEventListener('click', openChatGPTForEditing);
document.querySelector('#heroCreate').addEventListener('click', openChatGPTForEditing);
document.querySelector('#topCreate').addEventListener('click', openChatGPTForEditing);
document.querySelector('#galleryCreate').addEventListener('click', openChatGPTForEditing);

function openVideoDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('VideoGPTStudioLibrary', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('videos')) request.result.createObjectStore('videos', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readLocalVideos() {
  try {
    const db = await openVideoDB();
    const items = await new Promise((resolve, reject) => {
      const request = db.transaction('videos', 'readonly').objectStore('videos').getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return items.sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)));
  } catch {
    return [];
  }
}

async function loadGallery() {
  galleryGrid.replaceChildren();
  let shown = 0;
  const localItems = await readLocalVideos();
  for (const item of localItems) {
    if (!item?.blob || typeof item.name !== 'string') continue;
    shown += 1;
    const card = document.createElement('article');
    card.className = 'video-card';
    const video = document.createElement('video');
    video.src = URL.createObjectURL(item.blob);
    video.controls = true;
    video.preload = 'metadata';
    video.playsInline = true;
    video.setAttribute('aria-label', item.name);
    const details = document.createElement('div');
    details.className = 'video-card-details';
    const meta = document.createElement('div');
    meta.className = 'video-card-meta';
    const category = document.createElement('span');
    category.className = 'video-category';
    category.textContent = 'TU VIDEO';
    const index = document.createElement('span');
    index.className = 'video-index';
    index.textContent = 'GUARDADO LOCALMENTE';
    meta.append(category, index);
    const heading = document.createElement('h3');
    heading.textContent = item.name;
    const description = document.createElement('p');
    const mb = (Number(item.size || item.blob.size || 0) / (1024 * 1024)).toFixed(1);
    description.textContent = mb + ' MB · Disponible solo en este navegador y dispositivo.';
    const editLink = document.createElement('a');
    editLink.className = 'outline-cta';
    editLink.href = './editor.html?videoId=' + encodeURIComponent(item.id);
    editLink.textContent = 'Editar este video';
    details.append(meta, heading, description, editLink);
    card.append(video, details);
    galleryGrid.append(card);
  }

  try {
    const response = await fetch('./videos/gallery.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo cargar el catálogo.');
    const items = await response.json();
    if (Array.isArray(items)) {
      for (const item of items) {
        if (!item || typeof item.title !== 'string' || typeof item.src !== 'string') continue;
        shown += 1;
        const card = document.createElement('article');
        card.className = 'video-card';
        const video = document.createElement('video');
        video.src = item.src;
        video.controls = true;
        video.preload = 'metadata';
        video.playsInline = true;
        video.setAttribute('aria-label', item.title);
        const details = document.createElement('div');
        details.className = 'video-card-details';
        const meta = document.createElement('div');
        meta.className = 'video-card-meta';
        const category = document.createElement('span');
        category.className = 'video-category';
        category.textContent = typeof item.category === 'string' && item.category.trim() ? item.category : 'VIDEO';
        const index = document.createElement('span');
        index.className = 'video-index';
        index.textContent = 'VIDEO ' + String(shown).padStart(2, '0');
        meta.append(category, index);
        const heading = document.createElement('h3');
        heading.textContent = item.title;
        const description = document.createElement('p');
        description.textContent = item.description || 'Video guardado en VideoGPT Studio.';
        details.append(meta, heading, description);
        card.append(video, details);
        galleryGrid.append(card);
      }
    }
  } catch {
    if (shown === 0) {
      const message = document.createElement('p');
      message.className = 'gallery-empty';
      message.textContent = 'No se pudo cargar la galería. Actualiza la página e inténtalo de nuevo.';
      galleryGrid.append(message);
    }
  }
  galleryCount.textContent = String(shown);
  if (shown === 0) {
    const empty = document.createElement('p');
    empty.className = 'gallery-empty';
    empty.textContent = 'Todavía no hay videos en la galería. Sube uno desde “Editar video”.';
    galleryGrid.append(empty);
  }
}

document.querySelector('#newProject').addEventListener('click', () => {
  input.value = '';
  conversation.replaceChildren();
  title.textContent = 'Nuevo proyecto';
  status.textContent = 'Borrador';
  currentPrompt = '';
  resetVideo();
  showSection('welcome');
  input.focus();
});
document.querySelectorAll('[data-prompt]').forEach(button => {
  button.addEventListener('click', () => beginProject(button.dataset.prompt));
});
function addBubble(kind, text) {
  const node = document.createElement('div');
  node.className = 'bubble ' + kind;
  node.textContent = text;
  conversation.append(node);
  node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  return node;
}
function makePlan(prompt) {
  return [
    'Plan inicial preparado en esta página (sin API de pago):',
    '',
    '1. Concepto: ' + prompt,
    '2. Escenas: apertura que establece el lugar; desarrollo con la acción principal; cierre con una imagen memorable.',
    '3. Movimiento: paneos lentos, acercamientos suaves y transiciones entre escenas.',
    '4. Audio: narración en español y efectos sonoros sintetizados si están disponibles en el generador.',
    '',
    'Importante: el generador gratuito actual crea un corto ilustrado predefinido. Todavía no convierte esta descripción en escenas personalizadas.'
  ].join('\n');
}
form.addEventListener('submit', event => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  conversation.replaceChildren();
  addBubble('assistant', 'Esta página no tiene una IA conectada y no puede recibir tu archivo en este chat. Abre ChatGPT, adjunta tu video y pega estas instrucciones: ' + message);
  addBubble('assistant', 'Cuando compartas el video directamente en ChatGPT, podré evaluar qué cambios se pueden ejecutar con las herramientas disponibles y preparar un archivo de salida si el entorno lo permite.');
  showSection('create');
  title.textContent = 'Preparar edición en ChatGPT';
  status.textContent = 'Pendiente de archivo';
  currentPrompt = message;
  resetVideo();
  input.value = '';
});
generateBtn.addEventListener('click', () => {
  if (!currentPrompt) {
    generationNote.textContent = 'Primero describe tu idea para preparar el proyecto. El generador gratuito produce el corto de prueba actual, no un video personalizado basado en el texto.';
    return;
  }
  window.open(ACTIONS_URL, '_blank', 'noopener,noreferrer');
});
loadGallery();
