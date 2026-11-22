let nodes = [];
let edges = [];
let nextId = 2;
let selectedNodeId = null;

let history = [];
let historyIndex = -1;

let panX = 0, panY = 0, scale = 1;
let isPanning = false, panStartX = 0, panStartY = 0;

let connectingFromId = null;
let connectingBranch = null;
let tempLine = null;
let hoveredNodeId = null;

let rightPanelTimer = null;

const canvas = document.getElementById('canvas');
const viewport = document.getElementById('viewport');
const svg = document.getElementById('connections');
const settingsPanel = document.getElementById('settings-panel');
const zoomBadge = document.getElementById('zoom-badge');
const sidebarLeft = document.getElementById('sidebar-left');
const sidebarRight = document.getElementById('sidebar-right');
const btnToggleLeft = document.getElementById('btn-toggle-left');

function initRootRepo() {
  nodes = [{
    id: 1,
    type: 'projecttype',
    subtype: 'repo',
    title: 'Репозиторий',
    x: 340,
    y: 220,
    data: 'https://github.com/user/repo',
    regex: '',
    hasRegex: false
  }];
  edges = [];
  nextId = 2;
  selectedNodeId = null;
}

function showError(msg) {
  const toast = document.getElementById('toast-error');
  toast.innerText = msg;
  toast.style.display = 'block';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 4200);
}

// --- Управление левой и правой панелями ---
function toggleLeftSidebar() {
  const isCollapsed = sidebarLeft.classList.toggle('collapsed');
  if (btnToggleLeft) {
    btnToggleLeft.classList.toggle('active', !isCollapsed);
  }
}

function openRightSidebarWithAnimation(nodeId) {
  clearTimeout(rightPanelTimer);
  const isAlreadyOpen = !sidebarRight.classList.contains('collapsed');

  if (isAlreadyOpen && selectedNodeId !== nodeId) {
    // Быстрое закрытие и повторное открытие при переключении на другую ноду
    sidebarRight.classList.add('collapsed');
    rightPanelTimer = setTimeout(() => {
      selectedNodeId = nodeId;
      highlightSelectedNode();
      renderSettings();
      sidebarRight.classList.remove('collapsed');
    }, 190);
  } else {
    selectedNodeId = nodeId;
    highlightSelectedNode();
    renderSettings();
    sidebarRight.classList.remove('collapsed');
  }
}

function closeRightSidebar() {
  clearTimeout(rightPanelTimer);
  sidebarRight.classList.add('collapsed');
  selectedNodeId = null;
  highlightSelectedNode();
}

function highlightSelectedNode() {
  viewport.querySelectorAll('.node').forEach(n => {
    n.classList.toggle('selected', Number(n.dataset.id) === selectedNodeId);
  });
}

// --- История действий (Undo / Redo) с поддержкой RU/EN раскладки ---
function saveState() {
  const snapshot = JSON.stringify({ nodes, edges, nextId });
  if (historyIndex >= 0 && history[historyIndex] === snapshot) return;
  history = history.slice(0, historyIndex + 1);
  history.push(snapshot);
  historyIndex++;
  updateUndoRedoButtons();
}

function undo() {
  if (historyIndex <= 0) return;
  historyIndex--;
  restoreState(history[historyIndex]);
}

function redo() {
  if (historyIndex >= history.length - 1) return;
  historyIndex++;
  restoreState(history[historyIndex]);
}

function restoreState(snapshot) {
  const parsed = JSON.parse(snapshot);
  nodes = parsed.nodes;
  edges = parsed.edges;
  nextId = parsed.nextId;

  if (!nodes.find(n => n.id === selectedNodeId)) {
    selectedNodeId = null;
    sidebarRight.classList.add('collapsed');
  }

  updateUndoRedoButtons();
  renderNodes();
  renderSettings();
}

function updateUndoRedoButtons() {
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  if (btnUndo) btnUndo.disabled = historyIndex <= 0;
  if (btnRedo) btnRedo.disabled = historyIndex >= history.length - 1;
}

window.addEventListener('keydown', e => {
  const activeTag = document.activeElement ? document.activeElement.tagName : '';
  if (['INPUT', 'TEXTAREA'].includes(activeTag)) return;

  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
    e.preventDefault();
    if (e.shiftKey) {
      redo();
    } else {
      undo();
    }
  } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
    e.preventDefault();
    redo();
  }
});

// --- Навигация и масштабирование холста ---
function updateViewportTransform() {
  viewport.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  zoomBadge.innerText = `${Math.round(scale * 100)}%`;
}

function resetZoom() {
  panX = 0;
  panY = 0;
  scale = 1;
  updateViewportTransform();
}

canvas.addEventListener('mousedown', e => {
  if (e.target === canvas || e.target === viewport || e.target === svg) {
    isPanning = true;
    panStartX = e.clientX - panX;
    panStartY = e.clientY - panY;
  }
});

window.addEventListener('mousemove', e => {
  if (isPanning) {
    panX = e.clientX - panStartX;
    panY = e.clientY - panStartY;
    updateViewportTransform();
  }
  if (connectingFromId !== null && tempLine) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - panX) / scale;
    const mouseY = (e.clientY - rect.top - panY) / scale;
    const x1 = Number(tempLine.dataset.x1);
    const y1 = Number(tempLine.dataset.y1);
    const dx = Math.abs(mouseX - x1) * 0.5;
    tempLine.setAttribute('d', `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${mouseX - dx} ${mouseY}, ${mouseX} ${mouseY}`);
  }
});

window.addEventListener('mouseup', () => {
  isPanning = false;
  if (connectingFromId !== null) {
    if (hoveredNodeId && hoveredNodeId !== connectingFromId) {
      completeConnection(hoveredNodeId);
    }
    resetConnectionState();
  }
});

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
  const newScale = Math.min(Math.max(0.3, scale * zoomFactor), 2.5);

  panX = mouseX - (mouseX - panX) * (newScale / scale);
  panY = mouseY - (mouseY - panY) * (newScale / scale);
  scale = newScale;
  updateViewportTransform();
}, { passive: false });

// --- Drag & Drop из левой панели ---
function isRegexTargetNode(node) {
  return node.type === 'projecttype' || node.type === 'check';
}

function setRegexHighlight(active) {
  document.querySelectorAll('.node').forEach(el => {
    const n = nodes.find(item => item.id === Number(el.dataset.id));
    if (n && isRegexTargetNode(n)) {
      el.classList.toggle('regex-target-highlight', active);
    }
  });
}

document.querySelectorAll('.palette-item[draggable="true"]').forEach(item => {
  item.addEventListener('dragstart', e => {
    e.dataTransfer.setData('type', item.dataset.type);
    e.dataTransfer.setData('subtype', item.dataset.subtype);
    e.dataTransfer.setData('title', item.dataset.title);
    if (item.dataset.type === 'embedded_regex') {
      setRegexHighlight(true);
    }
  });
  item.addEventListener('dragend', () => setRegexHighlight(false));
});

canvas.addEventListener('dragover', e => e.preventDefault());
canvas.addEventListener('drop', e => {
  e.preventDefault();
  setRegexHighlight(false);
  const type = e.dataTransfer.getData('type');
  if (!type) return;

  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left - panX) / scale - 115;
  const y = (e.clientY - rect.top - panY) / scale - 35;

  if (type === 'embedded_regex') {
    const targetNodeEl = e.target.closest('.node');
    const targetNode = targetNodeEl ? nodes.find(n => n.id === Number(targetNodeEl.dataset.id)) : null;

    if (!targetNode || !isRegexTargetNode(targetNode)) {
      showError('Перетащите регулярное выражение прямо внутрь Репозитория или одной из трёх проверок безопасности!');
      return;
    }

    targetNode.hasRegex = true;
    if (!targetNode.regex) targetNode.regex = '^[A-Za-z0-9_-]{20,}$';
    saveState();
    renderNodes();
    openRightSidebarWithAnimation(targetNode.id);
    return;
  }

  createNode(type, e.dataTransfer.getData('subtype'), e.dataTransfer.getData('title'), x, y);
});

function createNode(type, subtype, title, x, y) {
  const id = nextId++;
  let defaultData = '';
  if (type === 'triggers' && subtype === 'onschedual') defaultData = Math.floor(Date.now() / 1000).toString();
  if (type === 'message' && subtype === 'telegram') defaultData = '@username';
  if (type === 'message' && subtype === 'smtp') defaultData = 'dev@example.com';
  if (type === 'message' && subtype === 'webhook') defaultData = 'https://api.example.com/webhook';
  if (type === 'logic') defaultData = 'vulnerabilities > 0';

  const node = { id, type, subtype, title, x, y, data: defaultData };
  if (type === 'check') {
    node.regex = '';
    node.hasRegex = false;
  }

  nodes.push(node);
  saveState();
  renderNodes();
  openRightSidebarWithAnimation(id);
}

// --- Отрисовка нод ---
function renderNodes() {
  viewport.querySelectorAll('.node').forEach(el => el.remove());
  document.getElementById('node-counter').innerText = `Черновик · ${nodes.length} нод`;

  nodes.forEach(node => {
    const isRoot = node.type === 'projecttype';
    const el = document.createElement('div');
    el.className = 'node' + (isRoot ? ' root-node' : '') + (node.id === selectedNodeId ? ' selected' : '');
    el.style.setProperty('--nx', `${node.x}px`);
    el.style.setProperty('--ny', `${node.y}px`);
    el.style.transform = `translate(${node.x}px, ${node.y}px)`;
    el.dataset.id = node.id;

    let outPortsHTML = '';
    if (node.type === 'logic') {
      outPortsHTML = `
        <span class="port-label lbl-true">ДА</span>
        <div class="port out out-true" data-branch="true" title="Ветка ДА"></div>
        <span class="port-label lbl-false">НЕТ</span>
        <div class="port out out-false" data-branch="false" title="Ветка НЕТ"></div>
      `;
    } else if (node.type !== 'message') {
      outPortsHTML = `<div class="port out" title="Выход"></div>`;
    }

    let regexBadgeHTML = '';
    if (isRegexTargetNode(node) && node.hasRegex) {
      regexBadgeHTML = `
        <div class="embedded-regex" title="Вложенная регулярка">
          <span>/${node.regex || 'пусто'}/</span>
          <button onclick="removeEmbeddedRegex(event, ${node.id})" title="Убрать регулярку">✕</button>
        </div>
      `;
    }

    const subText = node.data || (needsTextData(node) ? '⚠ не заполнено' : node.subtype);
    const subClass = (needsTextData(node) && !String(node.data || '').trim()) ? 'node-sub empty-warn' : 'node-sub';

    el.innerHTML = `
      <div class="port in" title="Вход"></div>
      <div class="node-top">
        <div class="node-header">${node.type}</div>
        ${isRoot ? '<span class="node-badge-root">★ КОРНЕВОЙ</span>' : ''}
      </div>
      <div class="node-title">${node.title}</div>
      <div class="${subClass}">${subText}</div>
      ${regexBadgeHTML}
      ${outPortsHTML}
    `;

    el.addEventListener('mouseenter', () => {
      if (connectingFromId !== null && connectingFromId !== node.id) {
        hoveredNodeId = node.id;
        el.classList.add('drop-target');
      }
    });
    el.addEventListener('mouseleave', () => {
      if (hoveredNodeId === node.id) hoveredNodeId = null;
      el.classList.remove('drop-target');
    });

    el.addEventListener('mousedown', e => {
      if (e.target.classList.contains('port') || e.target.tagName === 'BUTTON') return;
      e.stopPropagation();

      // При одиночном клике принудительно открываем правую панель (с анимацией при смене ноды)
      if (selectedNodeId !== node.id || sidebarRight.classList.contains('collapsed')) {
        openRightSidebarWithAnimation(node.id);
      }

      let moved = false;
      const startMouseX = e.clientX;
      const startMouseY = e.clientY;
      const origX = node.x;
      const origY = node.y;

      function onMouseMove(ev) {
        if (Math.abs(ev.clientX - startMouseX) > 2 || Math.abs(ev.clientY - startMouseY) > 2) {
          moved = true;
        }
        node.x = origX + (ev.clientX - startMouseX) / scale;
        node.y = origY + (ev.clientY - startMouseY) / scale;
        el.style.setProperty('--nx', `${node.x}px`);
        el.style.setProperty('--ny', `${node.y}px`);
        el.style.transform = `translate(${node.x}px, ${node.y}px)`;
        renderEdges();
      }
      function onMouseUp() {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        if (moved) saveState();
      }
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    el.querySelectorAll('.port.out').forEach(outPort => {
      outPort.addEventListener('mousedown', e => {
        e.stopPropagation();
        const branch = outPort.dataset.branch || null;
        startConnection(node.id, branch, outPort);
      });
    });

    const inPort = el.querySelector('.port.in');
    if (inPort) {
      inPort.addEventListener('mouseup', e => {
        e.stopPropagation();
        if (connectingFromId !== null && connectingFromId !== node.id) {
          completeConnection(node.id);
        }
        resetConnectionState();
      });
    }

    viewport.appendChild(el);
  });
  renderEdges();
}

function removeEmbeddedRegex(e, nodeId) {
  e.stopPropagation();
  const targetNode = nodes.find(n => n.id === nodeId);
  if (targetNode) {
    targetNode.hasRegex = false;
    targetNode.regex = '';
    saveState();
    renderNodes();
    if (selectedNodeId === nodeId) renderSettings();
  }
}

// --- Соединения между нодами ---
function startConnection(fromId, branch, portEl) {
  connectingFromId = fromId;
  connectingBranch = branch;

  const nodeEl = portEl.closest('.node');
  const node = nodes.find(n => n.id === fromId);
  const x1 = node.x + nodeEl.offsetWidth;
  const y1 = node.y + portEl.offsetTop + portEl.offsetHeight / 2;

  tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  tempLine.setAttribute('class', 'wire-preview');
  tempLine.dataset.x1 = x1;
  tempLine.dataset.y1 = y1;
  svg.appendChild(tempLine);
}

function resetConnectionState() {
  connectingFromId = null;
  connectingBranch = null;
  hoveredNodeId = null;
  if (tempLine) {
    tempLine.remove();
    tempLine = null;
  }
  viewport.querySelectorAll('.node.drop-target').forEach(el => el.classList.remove('drop-target'));
}

function wouldCreateCycle(fromId, toId) {
  const visited = new Set();
  const stack = [toId];
  while (stack.length > 0) {
    const curr = stack.pop();
    if (curr === fromId) return true;
    if (!visited.has(curr)) {
      visited.add(curr);
      edges.filter(e => e.from === curr).forEach(e => stack.push(e.to));
    }
  }
  return false;
}

function completeConnection(toId) {
  if (!connectingFromId || connectingFromId === toId) return;
  if (wouldCreateCycle(connectingFromId, toId)) {
    showError('Нельзя замкнуть цепочку в цикл.');
    return;
  }

  const fromNode = nodes.find(n => n.id === connectingFromId);
  if (fromNode && fromNode.type === 'triggers') {
    edges = edges.filter(edge => edge.from !== connectingFromId);
  }

  edges = edges.filter(edge => !(edge.from === connectingFromId && edge.to === toId && edge.branch === connectingBranch));
  edges.push({ from: connectingFromId, to: toId, branch: connectingBranch });
  saveState();
  renderEdges();
}

function renderEdges() {
  svg.querySelectorAll('path.wire').forEach(p => p.remove());

  edges.forEach((edge, idx) => {
    const fromNode = nodes.find(n => n.id === edge.from);
    const toNode = nodes.find(n => n.id === edge.to);
    const fromEl = viewport.querySelector(`.node[data-id="${edge.from}"]`);
    const toEl = viewport.querySelector(`.node[data-id="${edge.to}"]`);
    if (!fromNode || !toNode || !fromEl || !toEl) return;

    const x1 = fromNode.x + fromEl.offsetWidth;
    let y1 = fromNode.y + fromEl.offsetHeight / 2;
    if (edge.branch === 'true') y1 = fromNode.y + fromEl.offsetHeight * 0.32;
    if (edge.branch === 'false') y1 = fromNode.y + fromEl.offsetHeight * 0.72;

    const x2 = toNode.x;
    const y2 = toNode.y + toEl.offsetHeight / 2;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const dx = Math.abs(x2 - x1) * 0.5;
    path.setAttribute('d', `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`);
    path.setAttribute('class', 'wire' + (edge.branch === 'true' ? ' true-wire' : edge.branch === 'false' ? ' false-wire' : ''));
    path.addEventListener('click', e => {
      e.stopPropagation();
      edges.splice(idx, 1);
      saveState();
      renderEdges();
    });
    svg.appendChild(path);
  });
}

// --- Правая панель настроек ---
function renderSettings() {
  const node = nodes.find(n => n.id === selectedNodeId);
  if (!node) {
    settingsPanel.innerHTML = '<p class="settings-empty">Выберите ноду на холсте, чтобы изменить её параметры.</p>';
    return;
  }

  let inputHTML = '';
  if (node.type === 'triggers' && node.subtype === 'onschedual') {
    inputHTML = `<div class="form-group"><label>Timestamp (Unix) *</label><input type="text" id="node-data-input" value="${node.data}"></div>`;
  } else if (node.type === 'message' && node.subtype === 'telegram') {
    inputHTML = `<div class="form-group"><label>Ник в Telegram *</label><input type="text" id="node-data-input" value="${node.data}"></div>`;
  } else if (node.type === 'message' && node.subtype === 'smtp') {
    inputHTML = `<div class="form-group"><label>Email адрес *</label><input type="email" id="node-data-input" value="${node.data}"></div>`;
  } else if (node.type === 'message' && node.subtype === 'webhook') {
    inputHTML = `<div class="form-group"><label>URL Webhook *</label><input type="text" id="node-data-input" value="${node.data}"></div>`;
  } else if (node.type === 'projecttype') {
    inputHTML = `<div class="form-group"><label>Ссылка на репозиторий *</label><input type="text" id="node-data-input" value="${node.data}"></div>`;
  } else if (node.type === 'logic') {
    inputHTML = `<div class="form-group"><label>Условие ветвления *</label><input type="text" id="node-data-input" value="${node.data}"></div>`;
  }

  if (isRegexTargetNode(node) && node.hasRegex) {
    inputHTML += `
      <div class="form-group">
        <label>Вложенное регулярное выражение (regex) *</label>
        <input type="text" id="node-regex-input" placeholder="Например: ^[A-Za-z0-9_-]{20,}$" value="${node.regex || ''}">
      </div>
    `;
  }

  const deleteBtnHTML = node.type === 'projecttype'
    ? `<p class="settings-empty" style="margin-top:8px; font-size:11px;">Корневой узел репозитория нельзя удалить.</p>`
    : `<button class="btn-delete" onclick="deleteSelectedNode()">Удалить ноду</button>`;

  settingsPanel.innerHTML = `
    <div class="form-group">
      <label>Тип ноды (JSON type: ${node.type})</label>
      <input type="text" value="${node.title}" disabled>
    </div>
    ${inputHTML || `<p class="settings-empty">Параметры заданы. Подтип: <b>${node.subtype}</b></p>`}
    ${deleteBtnHTML}
  `;

  const dataInput = document.getElementById('node-data-input');
  if (dataInput) {
    dataInput.addEventListener('input', e => {
      node.data = e.target.value;
      elClearInvalid(node.id);
      renderNodes();
    });
    dataInput.addEventListener('change', () => saveState());
  }

  const regexInput = document.getElementById('node-regex-input');
  if (regexInput) {
    regexInput.addEventListener('input', e => {
      node.regex = e.target.value;
      elClearInvalid(node.id);
      renderNodes();
    });
    regexInput.addEventListener('change', () => saveState());
  }
}

function elClearInvalid(nodeId) {
  const el = viewport.querySelector(`.node[data-id="${nodeId}"]`);
  if (el) el.classList.remove('invalid-node');
}

function deleteSelectedNode() {
  const node = nodes.find(n => n.id === selectedNodeId);
  if (!node || node.type === 'projecttype') return;
  nodes = nodes.filter(n => n.id !== selectedNodeId);
  edges = edges.filter(e => e.from !== selectedNodeId && e.to !== selectedNodeId);
  closeRightSidebar();
  saveState();
  renderNodes();
}

function clearCanvas() {
  initRootRepo();
  closeRightSidebar();
  saveState();
  renderNodes();
}

// --- Валидация ---
function needsTextData(node) {
  if (node.type === 'projecttype') return true;
  if (node.type === 'triggers' && node.subtype === 'onschedual') return true;
  if (node.type === 'message') return true;
  if (node.type === 'logic') return true;
  return false;
}

function isNodeFieldsValid(node) {
  if (needsTextData(node) && !String(node.data || '').trim()) return false;
  if (isRegexTargetNode(node) && node.hasRegex && !String(node.regex || '').trim()) return false;
  return true;
}

function highlightInvalidNodes(invalidIds) {
  invalidIds.forEach(id => {
    const el = viewport.querySelector(`.node[data-id="${id}"]`);
    if (el) {
      el.classList.remove('invalid-node');
      void el.offsetWidth;
      el.classList.add('invalid-node');
    }
  });
}

function hasUnconditionalPathToRepo(triggerId, repoId) {
  const visited = new Set();
  const queue = [triggerId];

  while (queue.length > 0) {
    const curr = queue.shift();
    if (curr === repoId) return true;
    if (visited.has(curr)) continue;
    visited.add(curr);

    const currNode = nodes.find(n => n.id === curr);
    if (!currNode) continue;
    if (currNode.type === 'logic' && curr !== triggerId) continue;

    edges.forEach(edge => {
      if (edge.from === curr && !edge.branch) queue.push(edge.to);
      if (edge.to === curr && !edge.branch) queue.push(edge.from);
    });
  }
  return false;
}

function isNodeConnectedToGraph(nodeId) {
  return edges.some(e => e.from === nodeId || e.to === nodeId);
}

function validateWorkflow() {
  const invalidNodeIds = nodes.filter(n => !isNodeFieldsValid(n)).map(n => n.id);
  if (invalidNodeIds.length > 0) {
    highlightInvalidNodes(invalidNodeIds);
    showError('Заполните все обязательные поля в подсвеченных нодах!');
    return false;
  }

  const repoNode = nodes.find(n => n.type === 'projecttype');
  const triggerNodes = nodes.filter(n => n.type === 'triggers');
  const checkNodes = nodes.filter(n => n.type === 'check');
  const messageNodes = nodes.filter(n => n.type === 'message');

  if (!repoNode) { showError('Ошибка: отсутствует корневой узел Репозитория.'); return false; }
  if (triggerNodes.length === 0) { showError('Ошибка: добавьте хотя бы один Триггер запуска.'); return false; }
  if (checkNodes.length === 0) { showError('Ошибка: добавьте хотя бы одну Проверку безопасности.'); return false; }
  if (messageNodes.length === 0) { showError('Ошибка: добавьте хотя бы одно Уведомление.'); return false; }

  const activeTrigger = triggerNodes.find(t => hasUnconditionalPathToRepo(t.id, repoNode.id));
  if (!activeTrigger) {
    highlightInvalidNodes(triggerNodes.map(t => t.id));
    showError('Ошибка: триггер должен быть напрямую связан с Репозиторием (вне условных веток if/else).');
    return false;
  }

  if (!checkNodes.some(c => isNodeConnectedToGraph(c.id))) {
    highlightInvalidNodes(checkNodes.map(c => c.id));
    showError('Ошибка: подключите хотя бы одну Проверку безопасности к схеме.');
    return false;
  }
  if (!messageNodes.some(m => isNodeConnectedToGraph(m.id))) {
    highlightInvalidNodes(messageNodes.map(m => m.id));
    showError('Ошибка: подключите хотя бы одно Уведомление к схеме.');
    return false;
  }

  return true;
}

function handleVerifyClick() {
  if (!validateWorkflow()) return;

  const messageNodes = nodes.filter(n => n.type === 'message');
  const hasConnectedTelegram = messageNodes.some(
    m => m.subtype === 'telegram' && isNodeConnectedToGraph(m.id)
  );

  if (hasConnectedTelegram) {
    document.getElementById('tg-modal').style.display = 'flex';
  } else {
    exportAndDownloadJSON();
  }
}

// --- Модальное окно Telegram ---
function copyBotUsername() {
  const botTag = document.getElementById('bot-tag');
  const tooltip = document.getElementById('copy-tooltip');
  navigator.clipboard.writeText('@secure_message_bot').catch(() => {});

  botTag.classList.add('copied');
  tooltip.classList.add('visible');

  clearTimeout(botTag._timer);
  botTag._timer = setTimeout(() => {
    botTag.classList.remove('copied');
    tooltip.classList.remove('visible');
  }, 1500);
}

function closeTgModal() {
  document.getElementById('tg-modal').style.display = 'none';
}

function confirmTgAndDownload() {
  closeTgModal();
  exportAndDownloadJSON();
}

// --- Экспорт JSON ---
function exportAndDownloadJSON() {
  const workflow = buildWorkflowJSON();

  // Скачиваем JSON локально (как и раньше)
  downloadJSON(workflow, 'workflow_config.json');

  // Отправляем на бэкенд
  startBackendScan(workflow);
}

// Собираем итоговый массив узлов для бэкенда (без побочных эффектов)
function buildWorkflowJSON() {
  const result = [];

  nodes.forEach(node => {
    const parentEdges = edges.filter(e => e.to === node.id);
    const parentid = parentEdges.length > 0 ? parentEdges.map(e => e.from) : [-1];

    const info = { type: node.subtype };

    if (node.type === 'triggers' && node.subtype === 'onschedual') {
      info.data = Number(node.data) || node.data;
    } else if (node.type === 'message' || node.type === 'projecttype' || node.type === 'logic') {
      info.data = node.data;
    }

    if (isRegexTargetNode(node) && node.hasRegex && node.regex) {
      info.regex = node.regex;
    }

    const branches = parentEdges.map(e => e.branch).filter(Boolean);
    if (branches.length > 0) {
      info.branch = branches;
    }

    result.push({
      id: node.id,
      parentid: parentid,
      type: node.type,
      info: info
    });
  });

  const isLocalLLM = document.getElementById('local-llm-checkbox').checked;
  const maxId = nodes.length > 0 ? Math.max(...nodes.map(n => n.id)) : 0;

  result.push({
    id: maxId + 1,
    parentid: [-1],
    type: "llmtype",
    info: { type: isLocalLLM ? "local" : "cloud" }
  });

  return result;
}

function downloadJSON(data, filename) {
  const jsonString = JSON.stringify(data, null, 2);
  console.log("JSON для бэкенда:\n", jsonString);

  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const BACKEND_URL = 'http://127.0.0.1:8000'; // например: 'http://127.0.0.1:8000' — оставьте пустым, если проксируется

let pollTimer = null;
let currentSessionId = null;

async function startBackendScan(workflow) {
  // Сбрасываем предыдущий опрос, если он был
  stopPolling();
  currentSessionId = null;
  showScanProgress('Отправка workflow на сервер...');

  try {
    const resp = await fetch(`${BACKEND_URL}/api/scan/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflow })
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status} ${resp.statusText}${text ? ': ' + text : ''}`);
    }

    const data = await resp.json();
    if (data.status !== 'Ok' || !data.session_id) {
      throw new Error(data.text || 'Сервер не вернул session_id');
    }

    currentSessionId = data.session_id;
    console.log('[scan] session_id =', currentSessionId, '—', data.text);

    showScanProgress(data.text || 'Сканирование запущено...');
    startPolling();
  } catch (err) {
    console.error('[scan] start error:', err);
    showScanProgress(`Ошибка запуска: ${err.message}`, true);
    showError(`Не удалось запустить сканирование: ${err.message}`);
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(pollScanStatus, 1000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function pollScanStatus() {
  if (!currentSessionId) return;

  try {
    const resp = await fetch(
      `${BACKEND_URL}/api/scan/status?session_id=${encodeURIComponent(currentSessionId)}`
    );

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status}${text ? ': ' + text : ''}`);
    }

    const data = await resp.json();
    const status = data.status;
    const text = data.text || '';

    // Пишем статус в UI
    showScanProgress(text);

    if (status === 'Error') {
      stopPolling();
      showScanProgress(`Ошибка: ${text}`, true);
      showError(text || 'Сканирование завершилось с ошибкой');
      // Можно добавить кнопку "Очистить" или сохранить сессию
      console.log(data);
      return;
    }

    if (status === 'End') {
      stopPolling();

      if (data.data) {
        showScanProgress('Сканирование завершено. Сохраняю отчёт...', false);
        downloadJSON(data.data, `scan_report_${currentSessionId}.json`);
      } else {
        showScanProgress('Сканирование завершено (без отчёта).', false);
      }

      // Очищаем сессию
      currentSessionId = null;
      return;
    }

    // status === 'Ok' — продолжаем опрос
    // Если пришли данные с Ok (например, промежуточный message-узел),
    // можем их куда-то сохранять, если нужно.
    if (data.data) {
      console.log('[scan] intermediate data:', data.data);
    }
  } catch (err) {
    // Сетевые ошибки — не прерываем сессию, просто логируем и продолжаем
    console.warn('[scan] poll error:', err);
    // Если ошибка 404 — значит сессия потеряна, останавливаемся
    if (err.message && err.message.includes('404')) {
      stopPolling();
      showScanProgress(`Сессия не найдена на сервере`, true);
    }
  }
}

// --- Простой прогресс-индикатор ---
function showScanProgress(text, isError = false) {
  let el = document.getElementById('scan-progress');
  if (!el) {
    el = document.createElement('div');
    el.id = 'scan-progress';
    el.style.cssText = `
      position: fixed; bottom: 16px; right: 16px;
      background: #1e293b; color: #e2e8f0;
      padding: 10px 16px; border-radius: 8px;
      font-size: 13px; max-width: 420px;
      box-shadow: 0 4px 16px rgba(0,0,0,.3);
      z-index: 10000; transition: opacity .2s;
    `;
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.background = isError ? '#7f1d1d' : '#1e293b';

  if (!isError) {
    clearTimeout(el._timer);
    el._timer = setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 300);
    }, 8000);
    el.style.opacity = '1';
  } else {
    el.style.opacity = '1';
  }
}

// --- Симуляция ---
function runSimulation() {
  if (!validateWorkflow()) return;

  const simPanel = document.getElementById('sim-panel');
  const simLogs = document.getElementById('sim-logs');
  simPanel.style.display = 'flex';
  simLogs.innerHTML = '';

  viewport.querySelectorAll('.node').forEach(el => el.classList.remove('sim-running', 'sim-done'));

  const ordered = [...nodes].sort((a, b) => a.x - b.x);
  let step = 0;

  function nextStep() {
    if (step >= ordered.length) {
      const aiDiv = document.createElement('div');
      aiDiv.className = 'sim-log-ai';
      aiDiv.innerText = 'AI-анализ завершён: критических уязвимостей не обнаружено, отчёт передан по подключённым каналам.';
      simLogs.appendChild(aiDiv);
      simLogs.scrollTop = simLogs.scrollHeight;
      return;
    }

    const current = ordered[step];
    const el = viewport.querySelector(`.node[data-id="${current.id}"]`);
    if (el) el.classList.add('sim-running');

    const line = document.createElement('div');
    line.innerText = `▶ Выполнение: ${current.title} (${current.subtype})...`;
    simLogs.appendChild(line);
    simLogs.scrollTop = simLogs.scrollHeight;

    setTimeout(() => {
      if (el) {
        el.classList.remove('sim-running');
        el.classList.add('sim-done');
      }
      line.innerText = `✓ Готово: ${current.title}`;
      step++;
      nextStep();
    }, 650);
  }

  nextStep();
}

// Инициализация при запуске
initRootRepo();
saveState();
renderNodes();
if (btnToggleLeft) btnToggleLeft.classList.add('active');
