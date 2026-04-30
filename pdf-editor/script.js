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
const addTextFieldBtn = document.getElementById('addTextFieldBtn');

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
let originalPdfBlob = null;
let currentPage = 1;
let rotations = {};
let drawingHistory = [];
let isDrawing = false;
let startX, startY;
let annotations = {};
let textFields = {}; // Almacena campos de texto editables: {pageNum: [{x, y, width, height, value}, ...]}
let currentTool = 'select';
let canvasStates = {};
let isAddingTextField = false;
let canvasScale = 1.5; // Escala del canvas para mostrar el PDF

loadPdfBtn.addEventListener('click', loadPdf);
toolSelect.addEventListener('change', (e) => {
  currentTool = e.target.value;
  addTextFieldBtn.style.display = currentTool === 'textfield' ? 'inline-block' : 'none';
  annotationCanvas.style.cursor = currentTool === 'textfield' ? 'crosshair' : 'default';
});

addTextFieldBtn.addEventListener('click', () => {
  isAddingTextField = true;
  annotationCanvas.style.cursor = 'crosshair';
  statusMessage.textContent = 'Haz clic y arrastra para crear un cuadro de texto';
});

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
  
  // Guardar el blob original directamente
  originalPdfBlob = file;
  
  const reader = new FileReader();

  reader.onload = async (event) => {
    try {
      const arrayBuffer = event.target.result;
      
      // Para pdfjsLib, usar los datos del FileReader
      pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      currentPage = 1;
      rotations = {};
      annotations = {};
      textFields = {};
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

  // Dibujar campos de texto editables
  drawTextFields(pageNum);
  updateAnnotationsPanel();
}

function drawTextFields(pageNum) {
  if (!textFields[pageNum]) return;

  textFields[pageNum].forEach((field) => {
    // Dibujar rectángulo del campo
    annotCtx.strokeStyle = '#0f766e';
    annotCtx.lineWidth = 2;
    annotCtx.setLineDash([5, 5]);
    annotCtx.strokeRect(field.x, field.y, field.width, field.height);
    annotCtx.setLineDash([]);

    // Dibujar texto dentro del campo
    annotCtx.fillStyle = '#1e293b';
    annotCtx.font = '12px Arial';
    annotCtx.textBaseline = 'top';
    const textX = field.x + 5;
    const textY = field.y + 5;
    const maxWidth = field.width - 10;
    
    // Truncar texto si es muy largo
    let displayText = field.value;
    const metrics = annotCtx.measureText(displayText);
    if (metrics.width > maxWidth) {
      while (displayText.length > 0 && annotCtx.measureText(displayText + '...').width > maxWidth) {
        displayText = displayText.slice(0, -1);
      }
      displayText += '...';
    }
    annotCtx.fillText(displayText, textX, textY);
  });
}

function startDrawing(e) {
  if (currentTool === 'select') return;

  const rect = annotationCanvas.getBoundingClientRect();
  startX = e.clientX - rect.left;
  startY = e.clientY - rect.top;

  if (currentTool === 'textfield' && isAddingTextField) {
    isDrawing = true;
  } else if (currentTool === 'text') {
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
  } else if (currentTool !== 'textfield') {
    isDrawing = true;
  }
}

function draw(e) {
  if (!isDrawing) return;

  const rect = annotationCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (currentTool === 'textfield') {
    // Mostrar previsualización del cuadro mientras se arrastra
    redrawCanvasState();
    drawTextFields(currentPage);
    
    // Dibujar rectángulo de previsualización
    annotCtx.strokeStyle = '#0f766e';
    annotCtx.lineWidth = 2;
    annotCtx.setLineDash([5, 5]);
    annotCtx.strokeRect(startX, startY, x - startX, y - startY);
    annotCtx.setLineDash([]);
    return;
  }

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

function stopDrawing(e) {
  if (!isDrawing) return;

  if (currentTool === 'textfield' && isAddingTextField) {
    const rect = annotationCanvas.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;

    const x = Math.min(startX, endX);
    const y = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);

    if (width > 20 && height > 20) {
      if (!textFields[currentPage]) textFields[currentPage] = [];
      
      const fieldValue = prompt('Valor inicial del cuadro (opcional):') || '';
      textFields[currentPage].push({ x, y, width, height, value: fieldValue });
      
      renderPage(currentPage);
      addAnnotation('Campo de Texto', fieldValue || '(vacío)');
      isAddingTextField = false;
      statusMessage.textContent = 'Cuadro de texto añadido';
    }
  } else if (currentTool === 'pen' || currentTool === 'highlight' ||
    currentTool === 'line' || currentTool === 'rectangle' || currentTool === 'circle') {
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
    delete textFields[currentPage];
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
  if (!pdfDoc || !originalPdfBlob) return;

  try {
    statusMessage.textContent = 'Procesando PDF...';
    
    // Leer el blob cada vez que lo necesitemos
    const arrayBuffer = await originalPdfBlob.arrayBuffer();
    
    // Acceder a pdf-lib
    const PDFDocument = window.PDFLib.PDFDocument;
    
    // Cargar el PDF con pdf-lib
    const pdfDocLib = await PDFDocument.load(arrayBuffer);
    
    console.log('Campos de texto a agregar:', textFields);
    
    // Procesar cada página
    for (let i = 1; i <= pdfDocLib.getPageCount(); i++) {
      const page = pdfDocLib.getPage(i - 1);
      const { width, height } = page.getSize();
      
      console.log(`Página ${i}: ancho=${width}, alto=${height}`);

      // Agregar campos de texto si existen
      if (textFields[i] && textFields[i].length > 0) {
        console.log(`Agregando ${textFields[i].length} campos a la página ${i}`);
        const form = pdfDocLib.getForm();
        
        textFields[i].forEach((field, index) => {
          const fieldName = `TextField_P${i}_F${index}`;
          
          // Convertir coordenadas del canvas a coordenadas del PDF proporcionalmente
          // Las coordenadas está en píxeles del canvas que tiene las dimensiones con scale
          const scaleX = width / annotationCanvas.width;
          const scaleY = height / annotationCanvas.height;
          
          const x = field.x * scaleX;
          const y_from_top = field.y * scaleY;
          const fieldWidth = field.width * scaleX;
          const fieldHeight = field.height * scaleY;
          
          // Invertir Y: en PDF y=0 está en la PARTE INFERIOR, en canvas y=0 está ARRIBA
          const y = height - y_from_top - fieldHeight;
          
          console.log(`  Campo ${index}: canvas(${field.x},${field.y},${field.width},${field.height}) -> pdf(${x.toFixed(2)},${y.toFixed(2)},${fieldWidth.toFixed(2)},${fieldHeight.toFixed(2)})`);
          
          try {
            // Crear campo de texto
            const textField = form.createTextField(fieldName);
            textField.setText(field.value);
            textField.setAlignment('Left');
            textField.addToPage(page, { x, y, width: fieldWidth, height: fieldHeight });
            textField.setFontSize(12);
            console.log(`  ✓ Campo ${index} agregado exitosamente`);
          } catch (fieldErr) {
            console.warn(`  ✗ Error al agregar campo ${index}:`, fieldErr);
          }
        });
      }

      // Agregar anotaciones de canvas (como imágenes)
      if (canvasStates[i]) {
        try {
          // Crear un canvas temporal para renderizar las anotaciones
          const annotCanvasTemp = document.createElement('canvas');
          annotCanvasTemp.width = canvasStates[i].width;
          annotCanvasTemp.height = canvasStates[i].height;
          const annotCtxTemp = annotCanvasTemp.getContext('2d');
          annotCtxTemp.putImageData(canvasStates[i], 0, 0);
          
          const imgData = annotCanvasTemp.toDataURL('image/png');
          const blob = await (await fetch(imgData)).blob();
          const imgBytes = await blob.arrayBuffer();
          
          const image = await pdfDocLib.embedPng(imgBytes);
          page.drawImage(image, {
            x: 0,
            y: 0,
            width: width,
            height: height
          });
        } catch (imgErr) {
          console.warn('Error al agregar anotaciones:', imgErr);
        }
      }
    }

    // Guardar el PDF
    const modifiedPdfBytes = await pdfDocLib.save();
    const blob = new Blob([modifiedPdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'documento_editado.pdf';
    link.click();
    URL.revokeObjectURL(url);
    
    statusMessage.textContent = 'PDF descargado correctamente';
  } catch (err) {
    statusMessage.textContent = `Error al descargar: ${err.message}`;
    console.error('Error completo:', err);
  }
}
