const uploadSection = document.getElementById('uploadSection');
const pdfFile = document.getElementById('pdfFile');
const loadPdfBtn = document.getElementById('loadPdfBtn');
const uploadError = document.getElementById('uploadError');
const editorContainer = document.getElementById('editorContainer');

const pdfCanvas = document.getElementById('pdfCanvas');
const annotationCanvas = document.getElementById('annotationCanvas');
const pdfPageWrapper = document.getElementById('pdfPageWrapper');

const pdfCtx = pdfCanvas.getContext('2d');
const annotCtx = annotationCanvas.getContext('2d');

const toolSelect = document.getElementById('toolSelect');
const colorPicker = document.getElementById('colorPicker');
const brushSize = document.getElementById('brushSize');
const undoBtn = document.getElementById('undoBtn');
const clearCanvasBtn = document.getElementById('clearCanvasBtn');
const downloadPdfBtn = document.getElementById('downloadPdfBtn');

const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const pageInput = document.getElementById('pageInput');
const pageInfo = document.getElementById('pageInfo');
const rotateLeftBtn = document.getElementById('rotateLeftBtn');
const rotateRightBtn = document.getElementById('rotateRightBtn');

const annotationsList = document.getElementById('annotationsList');
const annotationsListContainer = document.getElementById('annotationsListContainer');
const extractTextBtn = document.getElementById('extractTextBtn');
const extractedText = document.getElementById('extractedText');
const textContent = document.getElementById('textContent');
const copyTextBtn = document.getElementById('copyTextBtn');
const statusMessage = document.getElementById('statusMessage');

let pdfDoc = null;
let currentPage = 1;
let rotations = {};
let drawingHistory = [];
let isDrawing = false;
let startX, startY;
let annotations = {};
let currentTool = 'select';
let canvasStates = {};

loadPdfBtn.addEventListener('click', loadPdf);
toolSelect.addEventListener('change', (e) => { currentTool = e.target.value; });
clearCanvasBtn.addEventListener('click', clearAnnotations);
undoBtn.addEventListener('click', undo);
downloadPdfBtn.addEventListener('click', downloadPdf);

prevPageBtn.addEventListener('click', () => goToPage(currentPage - 1));
nextPageBtn.addEventListener('click', () => goToPage(currentPage + 1));
pageInput.addEventListener('change', () => goToPage(parseInt(pageInput.value)));

rotateLeftBtn.addEventListener('click', () => rotatePage(-90));
rotateRightBtn.addEventListener('click', () => rotatePage(90));

extractTextBtn.addEventListener('click', extractText);
copyTextBtn.addEventListener('click', copyText);

annotationCanvas.addEventListener('mousedown', startDrawing);
annotationCanvas.addEventListener('mousemove', draw);
annotationCanvas.addEventListener('mouseup', stopDrawing);
annotationCanvas.addEventListener('mouseout', stopDrawing);

async function loadPdf() {
  uploadError.textContent = '';
  if (!pdfFile.files.length) {
    uploadError.textContent = 'Selecciona un PDF.';
    return;
  }

  const file = pdfFile.files[0];
  const reader = new FileReader();

  reader.onload = async (event) => {
    try {
      pdfDoc = await pdfjsLib.getDocument({ data: event.target.result }).promise;
      currentPage = 1;
      rotations = {};
      annotations = {};
      canvasStates = {};

      uploadSection.style.display = 'none';
      editorContainer.style.display = 'flex';

      await renderPage(currentPage);
      updatePageInfo();
      statusMessage.textContent = `PDF: ${file.name}`;
    } catch (err) {
      uploadError.textContent = `Error: ${err.message}`;
    }
  };

  reader.readAsArrayBuffer(file);
}

async function renderPage(pageNum) {
  if (!pdfDoc || pageNum < 1 || pageNum > pdfDoc.numPages) return;

  const page = await pdfDoc.getPage(pageNum);
  const scale = 1.5;
  const viewport = page.getViewport({ scale });

  const rotation = rotations[pageNum] || 0;
  const finalWidth = rotation % 180 !== 0 ? viewport.height : viewport.width;
  const finalHeight = rotation % 180 !== 0 ? viewport.width : viewport.height;

  pdfCanvas.width = finalWidth;
  pdfCanvas.height = finalHeight;
  annotationCanvas.width = finalWidth;
  annotationCanvas.height = finalHeight;

  pdfCtx.save();
  pdfCtx.translate(finalWidth / 2, finalHeight / 2);
  pdfCtx.rotate((rotation * Math.PI) / 180);
  pdfCtx.translate(-viewport.width / 2, -viewport.height / 2);
  await page.render({ canvasContext: pdfCtx, viewport }).promise;
  pdfCtx.restore();

  annotCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
  if (canvasStates[pageNum]) {
    annotCtx.putImageData(canvasStates[pageNum], 0, 0);
  }

  updateAnnotationsPanel();
}

function startDrawing(e) {
  if (currentTool === 'select') return;

  isDrawing = true;
  const rect = annotationCanvas.getBoundingClientRect();
  startX = e.clientX - rect.left;
  startY = e.clientY - rect.top;

  if (currentTool === 'text') {
    const text = prompt('Ingresa el texto:');
    if (text) {
      annotCtx.font = '14px Arial';
      annotCtx.fillStyle = colorPicker.value;
      annotCtx.textBaseline = 'middle';
      annotCtx.textAlign = 'center';
      annotCtx.fillText(text, startX, startY);
      saveCanvasState();
      addAnnotation('Texto', text);
    }
    isDrawing = false;
  }
}

function draw(e) {
  if (!isDrawing || currentTool === 'select' || currentTool === 'text') return;

  const rect = annotationCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  annotCtx.strokeStyle = colorPicker.value;
  annotCtx.lineWidth = brushSize.value;
  annotCtx.lineCap = 'round';
  annotCtx.lineJoin = 'round';

  if (currentTool === 'pen' || currentTool === 'highlight') {
    annotCtx.globalAlpha = currentTool === 'highlight' ? 0.4 : 1;
    annotCtx.beginPath();
    annotCtx.moveTo(startX, startY);
    annotCtx.lineTo(x, y);
    annotCtx.stroke();
    annotCtx.globalAlpha = 1;
  } else {
    redrawCanvasState();

    if (currentTool === 'line') {
      annotCtx.beginPath();
      annotCtx.moveTo(startX, startY);
      annotCtx.lineTo(x, y);
      annotCtx.stroke();
    } else if (currentTool === 'rectangle') {
      annotCtx.strokeRect(startX, startY, x - startX, y - startY);
    } else if (currentTool === 'circle') {
      const radius = Math.sqrt(Math.pow(x - startX, 2) + Math.pow(y - startY, 2));
      annotCtx.beginPath();
      annotCtx.arc(startX, startY, radius, 0, 2 * Math.PI);
      annotCtx.stroke();
    }
  }

  startX = x;
  startY = y;
}

function stopDrawing() {
  if (isDrawing && (currentTool === 'pen' || currentTool === 'highlight' ||
    currentTool === 'line' || currentTool === 'rectangle' || currentTool === 'circle')) {
    saveCanvasState();
    addAnnotation(currentTool, '');
  }
  isDrawing = false;
}

function saveCanvasState() {
  canvasStates[currentPage] = annotCtx.getImageData(0, 0, annotationCanvas.width, annotationCanvas.height);
  drawingHistory.push(currentPage);
}

function redrawCanvasState() {
  annotCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
  if (canvasStates[currentPage]) {
    annotCtx.putImageData(canvasStates[currentPage], 0, 0);
  }
}

function undo() {
  if (drawingHistory.length === 0) return;
  const pageNum = drawingHistory.pop();
  delete canvasStates[pageNum];
  if (pageNum === currentPage) {
    renderPage(currentPage);
  }
}

function clearAnnotations() {
  if (confirm('¿Limpiar anotaciones de esta página?')) {
    delete canvasStates[currentPage];
    delete annotations[currentPage];
    drawingHistory = drawingHistory.filter(p => p !== currentPage);
    annotCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
    updateAnnotationsPanel();
  }
}

function addAnnotation(type, text) {
  if (!annotations[currentPage]) annotations[currentPage] = [];
  annotations[currentPage].push({ type, text, time: new Date().toLocaleTimeString() });
  updateAnnotationsPanel();
}

function updateAnnotationsPanel() {
  const pageAnnotations = annotations[currentPage] || [];
  annotationsListContainer.innerHTML = '';

  if (pageAnnotations.length === 0) {
    annotationsList.classList.remove('active');
  } else {
    annotationsList.classList.add('active');
    pageAnnotations.forEach((ann) => {
      const div = document.createElement('div');
      div.className = 'annotation-item';
      div.innerHTML = `<strong>${ann.type}</strong>: ${ann.text} <small>${ann.time}</small>`;
      annotationsListContainer.appendChild(div);
    });
  }
}

async function extractText() {
  if (!pdfDoc) return;
  const page = await pdfDoc.getPage(currentPage);
  const content = await page.getTextContent();
  const text = content.items.map(item => item.str).join(' ');

  textContent.textContent = text || 'No se encontró texto';
  extractedText.classList.add('active');
}

function copyText() {
  navigator.clipboard.writeText(textContent.textContent);
  const oldText = copyTextBtn.textContent;
  copyTextBtn.textContent = '✓';
  setTimeout(() => { copyTextBtn.textContent = oldText; }, 1000);
}

function goToPage(pageNum) {
  if (pageNum >= 1 && pageNum <= pdfDoc.numPages) {
    currentPage = pageNum;
    pageInput.value = pageNum;
    updatePageInfo();
    renderPage(currentPage);
    extractedText.classList.remove('active');
  }
}

function rotatePage(angle) {
  rotations[currentPage] = (rotations[currentPage] || 0) + angle;
  renderPage(currentPage);
}

function updatePageInfo() {
  pageInfo.textContent = `de ${pdfDoc.numPages}`;
  prevPageBtn.disabled = currentPage === 1;
  nextPageBtn.disabled = currentPage === pdfDoc.numPages;
}

async function downloadPdf() {
  if (!pdfDoc) return;

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  let isFirst = true;

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    if (!isFirst) pdf.addPage();
    isFirst = false;

    const page = await pdfDoc.getPage(i);
    const scale = 2;
    const viewport = page.getViewport({ scale });
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = viewport.width;
    tempCanvas.height = viewport.height;
    const tempCtx = tempCanvas.getContext('2d');

    await page.render({ canvasContext: tempCtx, viewport }).promise;

    if (rotations[i]) {
      const rotCanvas = document.createElement('canvas');
      const rotCtx = rotCanvas.getContext('2d');
      const angle = rotations[i];
      rotCanvas.width = angle % 180 !== 0 ? tempCanvas.height : tempCanvas.width;
      rotCanvas.height = angle % 180 !== 0 ? tempCanvas.width : tempCanvas.height;
      rotCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
      rotCtx.rotate((angle * Math.PI) / 180);
      rotCtx.drawImage(tempCanvas, -tempCanvas.width / 2, -tempCanvas.height / 2);
      tempCanvas.width = rotCanvas.width;
      tempCanvas.height = rotCanvas.height;
      tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
      tempCtx.drawImage(rotCanvas, 0, 0);
    }

    if (canvasStates[i]) {
      const annotCanvasTemp = document.createElement('canvas');
      annotCanvasTemp.width = canvasStates[i].width;
      annotCanvasTemp.height = canvasStates[i].height;
      const annotCtxTemp = annotCanvasTemp.getContext('2d');
      annotCtxTemp.putImageData(canvasStates[i], 0, 0);

      tempCtx.drawImage(annotCanvasTemp, 0, 0, annotCanvasTemp.width, annotCanvasTemp.height,
        0, 0, tempCanvas.width, tempCanvas.height);
    }

    const imgData = tempCanvas.toDataURL('image/png');
    pdf.addImage(imgData, 'PNG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
  }

  pdf.save('documento_editado.pdf');
  statusMessage.textContent = 'PDF descargado';
}
