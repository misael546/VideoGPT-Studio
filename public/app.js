const form = document.querySelector('#chatForm');
const input = document.querySelector('#message');
const sendBtn = document.querySelector('#sendBtn');
const welcome = document.querySelector('#welcome');
const workspace = document.querySelector('#workspace');
const conversation = document.querySelector('#conversation');
const title = document.querySelector('#projectTitle');
const status = document.querySelector('#projectStatus');
const generateBtn = document.querySelector('#generateVideo');
const generationNote = document.querySelector('#generationNote');
const resultVideo = document.querySelector('#resultVideo');
const resultLink = document.querySelector('#resultLink');
let currentPrompt = '';
let generationAvailable = false;
let activeTask = false;

function beginProject(prompt = '') {
  welcome.classList.add('hidden');
  workspace.classList.remove('hidden');
  if (prompt) input.value = prompt;
  input.focus();
}
function resetVideo() {
  resultVideo.classList.add('hidden');
  resultVideo.removeAttribute('src');
  resultLink.classList.add('hidden');
  resultLink.removeAttribute('href');
  generateBtn.disabled = !generationAvailable || !currentPrompt || activeTask;
  generateBtn.textContent = generationAvailable ? 'Generar video' : 'Configurar proveedor para generar';
}
document.querySelector('#newProject').addEventListener('click', () => {
  input.value = '';
  conversation.replaceChildren();
  title.textContent = 'Nuevo proyecto';
  status.textContent = 'Borrador';
  currentPrompt = '';
  activeTask = false;
  resetVideo();
  welcome.classList.remove('hidden');
  workspace.classList.add('hidden');
  input.focus();
});
document.querySelectorAll('[data-prompt]').forEach(button => {
  button.addEventListener('click', () => {
    beginProject(button.dataset.prompt);
    input.focus();
  });
});
function addBubble(kind, text) {
  const node = document.createElement('div');
  node.className = `bubble ${kind}`;
  node.textContent = text;
  conversation.append(node);
  node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  return node;
}
async function refreshVideoTask(taskId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10 * 60 * 1000) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const response = await fetch(`/api/video/tasks/${encodeURIComponent(taskId)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo consultar la tarea.');
    if (data.status === 'SUCCEEDED' && data.outputUrl) {
      resultVideo.src = data.outputUrl;
      resultVideo.classList.remove('hidden');
      resultLink.href = data.outputUrl;
      resultLink.classList.remove('hidden');
      status.textContent = 'Video generado';
      addBubble('assistant', 'El video se generó correctamente. Abre el enlace para verlo o guardarlo; los enlaces del proveedor pueden caducar, así que descarga tu copia.');
      return;
    }
    if (['FAILED', 'CANCELED'].includes(data.status)) throw new Error(data.failure || `La generación terminó con estado ${data.status}.`);
    status.textContent = 'Generando…';
    generationNote.textContent = `Estado del proveedor: ${data.status}. La generación sigue en proceso.`;
  }
  throw new Error('La generación está tardando más de lo esperado. Puedes volver a intentarlo más tarde.');
}
generateBtn.addEventListener('click', async () => {
  if (!currentPrompt || activeTask) return;
  const confirmed = window.confirm('La generación de video se enviará a Runway y puede consumir créditos de pago. ¿Quieres continuar?');
  if (!confirmed) return;
  activeTask = true;
  generateBtn.disabled = true;
  generateBtn.textContent = 'Iniciando generación…';
  status.textContent = 'En cola';
  generationNote.textContent = 'Enviando la solicitud al proveedor…';
  try {
    const response = await fetch('/api/video/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: currentPrompt,
        ratio: document.querySelector('#ratio').value,
        duration: Number(document.querySelector('#duration').value)
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo iniciar la generación.');
    addBubble('assistant', `Tarea de video creada (${data.taskId}). Runway puede tardar varios minutos en completarla.`);
    generateBtn.textContent = 'Generando video…';
    await refreshVideoTask(data.taskId);
  } catch (error) {
    status.textContent = 'No completado';
    generationNote.textContent = error.message || 'No se pudo generar el video.';
    addBubble('error', generationNote.textContent);
  } finally {
    activeTask = false;
    generateBtn.disabled = !generationAvailable || !currentPrompt;
    generateBtn.textContent = 'Volver a generar';
  }
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  beginProject();
  currentPrompt = message;
  resetVideo();
  resultVideo.pause();
  title.textContent = message.length > 42 ? `${message.slice(0, 42)}…` : message;
  addBubble('user', message);
  input.value = '';
  sendBtn.disabled = true;
  const loading = addBubble('assistant loading', 'Preparando tu proyecto…');
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    const data = await response.json();
    loading.remove();
    if (!response.ok) throw new Error(data.error || 'No se pudo procesar la solicitud.');
    addBubble('assistant', data.reply);
    status.textContent = data.project?.status || 'Borrador';
    generationAvailable = Boolean(data.canGenerate);
    generateBtn.disabled = !generationAvailable;
    generateBtn.textContent = generationAvailable ? 'Generar video' : 'Configurar proveedor para generar';
    generationNote.textContent = generationAvailable
      ? 'Runway está configurado. Al pulsar Generar video, se enviará la solicitud y podrían consumirse créditos.'
      : 'La conexión con Runway y su clave privada aún deben configurarse en el servidor.';
  } catch (error) {
    loading.remove();
    addBubble('error', error.message || 'Error de conexión. Inténtalo de nuevo.');
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
});
fetch('/api/health')
  .then(response => response.json())
  .then(data => {
    generationAvailable = Boolean(data.videoConfigured);
    if (generationAvailable) generationNote.textContent = 'Proveedor de video conectado en el servidor.';
  })
  .catch(() => {});
