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
      generationNote.textContent = 'Video listo. Descárgalo si quieres conservarlo; el enlace del proveedor puede caducar.';
      addBubble('assistant', 'Agnes AI confirmó que el video está listo. Puedes reproducirlo o abrir el enlace para guardarlo.');
      return;
    }
    if (['FAILED', 'CANCELED'].includes(data.status)) throw new Error(data.failure || `La generación terminó con estado ${data.status}.`);
    status.textContent = 'Generando…';
    const progress = Number.isFinite(data.progress) ? ` (${data.progress}%)` : '';
    generationNote.textContent = `Estado de Agnes AI: ${data.status}${progress}. La tarea sigue en proceso.`;
  }
  throw new Error('La generación está tardando más de lo esperado. Puedes consultar de nuevo más tarde.');
}
generateBtn.addEventListener('click', async () => {
  if (!currentPrompt || activeTask) return;
  const confirmed = window.confirm('Se enviará tu descripción a Agnes AI para generar un video. El acceso gratuito puede tener límites de uso. ¿Quieres continuar?');
  if (!confirmed) return;
  activeTask = true;
  generateBtn.disabled = true;
  generateBtn.textContent = 'Iniciando generación…';
  status.textContent = 'En cola';
  generationNote.textContent = 'Enviando la solicitud a Agnes AI…';
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
    addBubble('assistant', `Tarea de video creada (${data.taskId}). Agnes AI puede tardar varios minutos en completarla.`);
    generateBtn.textContent = 'Generando video…';
    await refreshVideoTask(data.taskId);
  } catch (error) {
    status.textContent = 'No completado';
    const providerMessage = error.message || 'No se pudo generar el video.';
    const queueFull = /video queue is full|queue is full|cola.{0,30}(llena|saturada)/i.test(providerMessage);
    const requestId = providerMessage.match(/request id:\s*([a-zA-Z0-9_-]+)/i)?.[1];
    generationNote.textContent = queueFull
      ? 'Agnes AI tiene la cola de videos llena. No se creó el video. Espera antes de volver a intentarlo.' + (requestId ? ' ID de solicitud: ' + requestId : '')
      : providerMessage;
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
      ? 'Agnes AI está conectado. La generación real puede estar sujeta a límites gratuitos de la cuenta.'
      : 'Configura AGNES_API_KEY en las variables de entorno del servidor.';
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
    if (generationAvailable) generationNote.textContent = 'Agnes AI está configurado en el servidor.';
  })
  .catch(() => {});
