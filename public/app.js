const form = document.querySelector('#chatForm');
const input = document.querySelector('#message');
const sendBtn = document.querySelector('#sendBtn');
const welcome = document.querySelector('#welcome');
const workspace = document.querySelector('#workspace');
const conversation = document.querySelector('#conversation');
const title = document.querySelector('#projectTitle');
const status = document.querySelector('#projectStatus');

function beginProject(prompt = '') {
  welcome.classList.add('hidden');
  workspace.classList.remove('hidden');
  if (prompt) input.value = prompt;
  input.focus();
}
document.querySelector('#newProject').addEventListener('click', () => {
  input.value = '';
  conversation.replaceChildren();
  title.textContent = 'Nuevo proyecto';
  status.textContent = 'Borrador';
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
form.addEventListener('submit', async event => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  beginProject();
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
  } catch (error) {
    loading.remove();
    addBubble('error', error.message || 'Error de conexión. Inténtalo de nuevo.');
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
});
fetch('/api/health').catch(() => {});
