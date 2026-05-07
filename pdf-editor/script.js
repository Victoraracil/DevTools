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
const fontSizeSlider = document.getElementById('fontSizeSlider');
const fontSizeDisplay = document.getElementById('fontSizeDisplay');
const undoBtn = document.getElementById('undoBtn');
const clearCanvasBtn = document.getElementById('clearCanvasBtn');
const downloadPdfBtn = document.getElementById('downloadPdfBtn');
const addTextFieldBtn = document.getElementById('addTextFieldBtn');
const addCheckboxBtn = document.getElementById('addCheckboxBtn');

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

// Elementos de la barra de herramientas de formato de texto
const textFormatToolbar = document.getElementById('textFormatToolbar');
const boldBtn = document.getElementById('boldBtn');
const italicBtn = document.getElementById('italicBtn');
const underlineBtn = document.getElementById('underlineBtn');
const textColorPicker = document.getElementById('textColorPicker');

let pdfDoc = null;
let originalPdfBlob = null;
let currentPage = 1;
let rotations = {};
let drawingHistory = [];
let isDrawing = false;
let startX, startY;
let annotations = {};
let textFields = {}; // Almacena campos de texto editables: {pageNum: [{x, y, width, height, value, bold, italic, underline, color}, ...]}
let checkboxes = {}; // Almacena checkboxes: {pageNum: [{x, y, size, checked}, ...]}
let drawnTexts = {}; // Almacena textos dibujados: {pageNum: [{x, y, text, bold, italic, underline, color, fontSize}, ...]}
let fills = {}; // Almacena rellenos: {pageNum: [{x, y, width, height, color}, ...]}
let currentTool = 'select';
let canvasStates = {};
let isAddingTextField = false;
let isAddingCheckbox = false;
let canvasScale = 1.5; // Escala del canvas para mostrar el PDF
let fontSize = 12; // Tamaño de fuente para campos de texto
let selectedTextIndex = null; // Índice del texto seleccionado para editar/mover
let isDraggingText = false;
let isMovingText = false; // Control para el modo mover texto
let ignoreNextClick = false; // Para ignorar el click que abrió el menú
let moveTextHandler = null; // Para guardar la referencia del handler

// Variables para los estilos de texto actual
let textBold = false;
let textItalic = false;
let textUnderline = false;
let textColor = '#1e293b';

loadPdfBtn.addEventListener('click', loadPdf);
toolSelect.addEventListener('change', (e) => {
  currentTool = e.target.value;
  addTextFieldBtn.style.display = currentTool === 'textfield' ? 'inline-block' : 'none';
  addCheckboxBtn.style.display = currentTool === 'checkbox' ? 'inline-block' : 'none';
  
  // Mostrar barra de formato solo para texto (imagen)
  if (currentTool === 'text') {
    textFormatToolbar.classList.add('active');
    statusMessage.textContent = 'Selecciona formato y haz clic para agregar texto';
  } else {
    textFormatToolbar.classList.remove('active');
  }
  
  annotationCanvas.style.cursor = (currentTool === 'textfield' || currentTool === 'checkbox') ? 'crosshair' : 'default';
});

addTextFieldBtn.addEventListener('click', () => {
  isAddingTextField = true;
  annotationCanvas.style.cursor = 'crosshair';
  statusMessage.textContent = 'Haz clic y arrastra para crear un cuadro de texto';
});

addCheckboxBtn.addEventListener('click', () => {
  isAddingCheckbox = true;
  annotationCanvas.style.cursor = 'crosshair';
  statusMessage.textContent = 'Haz clic y arrastra para crear un checkbox';
});

// Event listeners para botones de formato de texto
boldBtn.addEventListener('click', () => {
  textBold = !textBold;
  boldBtn.classList.toggle('active');
});

italicBtn.addEventListener('click', () => {
  textItalic = !textItalic;
  italicBtn.classList.toggle('active');
});

underlineBtn.addEventListener('click', () => {
  textUnderline = !textUnderline;
  underlineBtn.classList.toggle('active');
});

textColorPicker.addEventListener('change', (e) => {
  textColor = e.target.value;
});

clearCanvasBtn.addEventListener('click', clearAnnotations);
undoBtn.addEventListener('click', undo);
downloadPdfBtn.addEventListener('click', downloadPdf);

fontSizeSlider.addEventListener('input', (e) => {
  fontSize = parseInt(e.target.value);
  fontSizeDisplay.textContent = fontSize;
  renderPage(currentPage); // Redibujar para mostrar cambios de tamaño
});

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
      checkboxes = {};
      drawnTexts = {};
      fills = {};
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
  
  // Dibujar rellenos primero (debajo)
  drawFills(pageNum);
  
  // Dibujar checkboxes
  drawCheckboxes(pageNum);
  
  // Dibujar textos dibujados (encima)
  drawTexts(pageNum);
  
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

    // Construir el estilo de fuente
    let fontStyle = '';
    if (field.italic) fontStyle += 'italic ';
    if (field.bold) fontStyle += 'bold ';
    fontStyle += `${fontSize}px Arial`;

    // Dibujar texto dentro del campo
    annotCtx.fillStyle = field.color || '#1e293b';
    annotCtx.font = fontStyle;
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

    // Dibujar subrayado si está activo
    if (field.underline) {
      const textWidth = annotCtx.measureText(displayText).width;
      const underlineY = textY + fontSize - 2;
      annotCtx.strokeStyle = field.color || '#1e293b';
      annotCtx.lineWidth = 1;
      annotCtx.beginPath();
      annotCtx.moveTo(textX, underlineY);
      annotCtx.lineTo(textX + textWidth, underlineY);
      annotCtx.stroke();
    }
  });
}

function drawCheckboxes(pageNum) {
  if (!checkboxes[pageNum]) return;

  checkboxes[pageNum].forEach((checkbox) => {
    // Dibujar cuadrado del checkbox
    annotCtx.fillStyle = checkbox.checked ? colorPicker.value : '#ffffff';
    annotCtx.strokeStyle = colorPicker.value;
    annotCtx.lineWidth = 2;
    annotCtx.fillRect(checkbox.x, checkbox.y, checkbox.size, checkbox.size);
    annotCtx.strokeRect(checkbox.x, checkbox.y, checkbox.size, checkbox.size);

    // Dibujar marca de verificación si está marcado
    if (checkbox.checked) {
      annotCtx.strokeStyle = '#ffffff';
      annotCtx.lineWidth = 2;
      annotCtx.beginPath();
      const checkSize = checkbox.size * 0.3;
      const checkX = checkbox.x + checkbox.size * 0.25;
      const checkY = checkbox.y + checkbox.size * 0.5;
      annotCtx.moveTo(checkX, checkY);
      annotCtx.lineTo(checkX + checkSize * 0.4, checkY + checkSize * 0.4);
      annotCtx.lineTo(checkX + checkSize, checkY - checkSize * 0.3);
      annotCtx.stroke();
    }
  });
}

function startDrawing(e) {
  // Si estamos en modo mover texto, manejar el click para mover
  if (isMovingText) {
    const rect = annotationCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (selectedTextIndex !== null && drawnTexts[currentPage] && drawnTexts[currentPage][selectedTextIndex]) {
      drawnTexts[currentPage][selectedTextIndex].x = x;
      drawnTexts[currentPage][selectedTextIndex].y = y;
      isMovingText = false;
      selectedTextIndex = null;
      renderPage(currentPage);
      statusMessage.textContent = 'Texto movido';
    }
    return;
  }
  
  if (currentTool === 'select') return;

  const rect = annotationCanvas.getBoundingClientRect();
  startX = e.clientX - rect.left;
  startY = e.clientY - rect.top;

  // Detectar clic en checkbox existente
  if (currentTool === 'checkbox' && !isAddingCheckbox && checkboxes[currentPage]) {
    for (let i = 0; i < checkboxes[currentPage].length; i++) {
      const cb = checkboxes[currentPage][i];
      if (startX >= cb.x && startX <= cb.x + cb.size &&
          startY >= cb.y && startY <= cb.y + cb.size) {
        cb.checked = !cb.checked;
        renderPage(currentPage);
        return;
      }
    }
  }

  // Detectar clic en texto existente para editar o mover
  if (currentTool === 'text' && drawnTexts[currentPage]) {
    const clickedTextIndex = findTextAtPosition(startX, startY);
    if (clickedTextIndex !== -1) {
      // Mostrar opciones de edición
      showTextEditOptions(clickedTextIndex);
      return;
    }
  }

  if (currentTool === 'textfield' && isAddingTextField) {
    isDrawing = true;
  } else if (currentTool === 'checkbox' && isAddingCheckbox) {
    isDrawing = true;
  } else if (currentTool === 'text') {
    addTextAtPosition(startX, startY);
  } else if (currentTool !== 'textfield' && currentTool !== 'checkbox') {
    isDrawing = true;
  }
}

function draw(e) {
  // Si estamos en modo mover, mostrar preview
  if (isMovingText) {
    const rect = annotationCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    renderPage(currentPage);
    
    if (selectedTextIndex !== null && drawnTexts[currentPage] && drawnTexts[currentPage][selectedTextIndex]) {
      const txt = drawnTexts[currentPage][selectedTextIndex];
      
      // Dibujar el texto en la nueva posición con transparencia
      let fontStyle = '';
      if (txt.italic) fontStyle += 'italic ';
      if (txt.bold) fontStyle += 'bold ';
      fontStyle += `${txt.fontSize}px Arial`;
      
      annotCtx.globalAlpha = 0.5;
      annotCtx.font = fontStyle;
      annotCtx.fillStyle = txt.color || '#1e293b';
      annotCtx.textBaseline = 'middle';
      annotCtx.textAlign = 'center';
      annotCtx.fillText(txt.text, x, y);
      annotCtx.globalAlpha = 1;
    }
    return;
  }
  
  if (!isDrawing || isMovingText) return;

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

  if (currentTool === 'checkbox') {
    // Mostrar previsualización del checkbox mientras se arrastra
    redrawCanvasState();
    drawTextFields(currentPage);
    drawCheckboxes(currentPage);
    
    // Dibujar checkbox de previsualización
    const size = Math.max(Math.abs(x - startX), Math.abs(y - startY));
    annotCtx.strokeStyle = colorPicker.value;
    annotCtx.lineWidth = 2;
    annotCtx.setLineDash([5, 5]);
    annotCtx.strokeRect(startX, startY, size, size);
    annotCtx.setLineDash([]);
    return;
  }

  if (currentTool === 'fill') {
    // No mostrar previsualización, solo cursor simple
    // Mostrar dimensiones en el status
    const width = Math.abs(x - startX);
    const height = Math.abs(y - startY);
    statusMessage.textContent = `Rellenar: ${Math.round(width)}x${Math.round(height)}px`;
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

    if (width > 5 && height > 5) {
      if (!textFields[currentPage]) textFields[currentPage] = [];
      
      const fieldValue = prompt('Valor inicial del cuadro (opcional):') || '';
      textFields[currentPage].push({ 
        x, 
        y, 
        width, 
        height, 
        value: fieldValue,
        bold: textBold,
        italic: textItalic,
        underline: textUnderline,
        color: textColor
      });
      
      renderPage(currentPage);
      addAnnotation('Campo de Texto', fieldValue || '(vacío)');
      isAddingTextField = false;
      statusMessage.textContent = 'Cuadro de texto añadido';
    }
  } else if (currentTool === 'checkbox' && isAddingCheckbox) {
    const rect = annotationCanvas.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;

    const size = Math.max(Math.abs(endX - startX), Math.abs(endY - startY));

    if (size > 5) {
      if (!checkboxes[currentPage]) checkboxes[currentPage] = [];
      
      checkboxes[currentPage].push({ x: startX, y: startY, size, checked: false });
      
      renderPage(currentPage);
      addAnnotation('Checkbox', '(sin marcar)');
      isAddingCheckbox = false;
      statusMessage.textContent = 'Checkbox añadido';
    }
  } else if (currentTool === 'fill') {
    const rect = annotationCanvas.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;

    const x = Math.min(startX, endX);
    const y = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);

    if (width > 5 && height > 5) {
      // Guardar el relleno en la estructura fills
      if (!fills[currentPage]) fills[currentPage] = [];
      fills[currentPage].push({
        x, y, width, height,
        color: colorPicker.value
      });
      
      renderPage(currentPage);
      addAnnotation('Relleno', colorPicker.value);
      statusMessage.textContent = 'Área rellenada';
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
    delete checkboxes[currentPage];
    delete drawnTexts[currentPage];
    delete fills[currentPage];
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
            textField.setFontSize(fontSize);
            console.log(`  ✓ Campo ${index} agregado exitosamente`);
          } catch (fieldErr) {
            console.warn(`  ✗ Error al agregar campo ${index}:`, fieldErr);
          }
        });
      }

      // Agregar checkboxes si existen
      if (checkboxes[i] && checkboxes[i].length > 0) {
        console.log(`Agregando ${checkboxes[i].length} checkboxes a la página ${i}`);
        const form = pdfDocLib.getForm();
        
        checkboxes[i].forEach((checkbox, index) => {
          const checkboxName = `Checkbox_P${i}_C${index}`;
          
          // Convertir coordenadas del canvas a coordenadas del PDF proporcionalmente
          const scaleX = width / annotationCanvas.width;
          const scaleY = height / annotationCanvas.height;
          
          const x = checkbox.x * scaleX;
          const y_from_top = checkbox.y * scaleY;
          const checkboxSize = checkbox.size * scaleX;
          
          // Invertir Y: en PDF y=0 está en la PARTE INFERIOR, en canvas y=0 está ARRIBA
          const y = height - y_from_top - checkboxSize;
          
          console.log(`  Checkbox ${index}: canvas(${checkbox.x},${checkbox.y},${checkbox.size}) -> pdf(${x.toFixed(2)},${y.toFixed(2)},${checkboxSize.toFixed(2)})`);
          
          try {
            // Crear checkbox
            const checkboxField = form.createCheckBox(checkboxName);
            if (checkbox.checked) {
              checkboxField.check();
            }
            checkboxField.addToPage(page, { x, y, width: checkboxSize, height: checkboxSize });
            console.log(`  ✓ Checkbox ${index} agregado exitosamente`);
          } catch (checkboxErr) {
            console.warn(`  ✗ Error al agregar checkbox ${index}:`, checkboxErr);
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

      // Agregar rellenos primero (debajo del texto)
      if (fills[i] && fills[i].length > 0) {
        try {
          console.log(`Agregando ${fills[i].length} rellenos a la página ${i}`);
          
          fills[i].forEach((fill) => {
            // Convertir coordenadas del canvas a coordenadas del PDF
            const scaleX = width / annotationCanvas.width;
            const scaleY = height / annotationCanvas.height;
            
            const x = fill.x * scaleX;
            const y_from_top = fill.y * scaleY;
            const fillWidth = fill.width * scaleX;
            const fillHeight = fill.height * scaleY;
            
            // Invertir Y: en PDF y=0 está en la PARTE INFERIOR, en canvas y=0 está ARRIBA
            const y = height - y_from_top - fillHeight;
            
            // Convertir color hex a RGB (valores 0-1)
            const rgb = hexToRgb(fill.color);
            const r = rgb.r / 255;
            const g = rgb.g / 255;
            const b = rgb.b / 255;
            
            // Dibujar rectángulo relleno opaco (sin borde)
            page.drawRectangle({
              x: x,
              y: y,
              width: fillWidth,
              height: fillHeight,
              color: window.PDFLib.rgb(r, g, b),
              borderColor: window.PDFLib.rgb(r, g, b),
              borderWidth: 0
            });
            
            console.log(`  ✓ Relleno agregado: (${x.toFixed(2)}, ${y.toFixed(2)}, ${fillWidth.toFixed(2)}, ${fillHeight.toFixed(2)})`);
          });
        } catch (fillErr) {
          console.warn('Error al agregar rellenos:', fillErr);
        }
      }

      // Agregar textos dibujados después (encima del relleno)
      if (drawnTexts[i] && drawnTexts[i].length > 0) {
        try {
          console.log(`Agregando ${drawnTexts[i].length} textos dibujados a la página ${i}`);
          
          // Crear un canvas temporal para renderizar los textos
          const textCanvasTemp = document.createElement('canvas');
          textCanvasTemp.width = annotationCanvas.width;
          textCanvasTemp.height = annotationCanvas.height;
          const textCtxTemp = textCanvasTemp.getContext('2d');
          
          // Dibujar textos en el canvas temporal
          drawnTexts[i].forEach((txt) => {
            let fontStyle = '';
            if (txt.italic) fontStyle += 'italic ';
            if (txt.bold) fontStyle += 'bold ';
            fontStyle += `${txt.fontSize}px Arial`;
            
            textCtxTemp.font = fontStyle;
            textCtxTemp.fillStyle = txt.color || '#1e293b';
            textCtxTemp.textBaseline = 'middle';
            textCtxTemp.textAlign = 'center';
            textCtxTemp.fillText(txt.text, txt.x, txt.y);
            
            // Dibujar subrayado si está activo
            if (txt.underline) {
              const textWidth = textCtxTemp.measureText(txt.text).width;
              const underlineY = txt.y + 2;
              textCtxTemp.strokeStyle = txt.color || '#1e293b';
              textCtxTemp.lineWidth = 1;
              textCtxTemp.beginPath();
              textCtxTemp.moveTo(txt.x - textWidth / 2, underlineY);
              textCtxTemp.lineTo(txt.x + textWidth / 2, underlineY);
              textCtxTemp.stroke();
            }
          });
          
          const imgData = textCanvasTemp.toDataURL('image/png');
          const blob = await (await fetch(imgData)).blob();
          const imgBytes = await blob.arrayBuffer();
          
          const image = await pdfDocLib.embedPng(imgBytes);
          page.drawImage(image, {
            x: 0,
            y: 0,
            width: width,
            height: height
          });
          console.log(`  ✓ Textos dibujados agregados exitosamente`);
        } catch (textErr) {
          console.warn('Error al agregar textos dibujados:', textErr);
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

// Funciones para manejo de textos dibujados

function findTextAtPosition(x, y) {
  if (!drawnTexts[currentPage]) return -1;
  
  for (let i = 0; i < drawnTexts[currentPage].length; i++) {
    const txt = drawnTexts[currentPage][i];
    const textWidth = estimateTextWidth(txt.text, txt.fontSize, txt.bold);
    const textHeight = txt.fontSize;
    
    // Detectar área de clic alrededor del texto
    if (x >= txt.x - textWidth / 2 - 10 && x <= txt.x + textWidth / 2 + 10 &&
        y >= txt.y - textHeight / 2 - 10 && y <= txt.y + textHeight / 2 + 10) {
      return i;
    }
  }
  return -1;
}

function estimateTextWidth(text, fontSize, bold) {
  // Estimación aproximada del ancho del texto
  const charWidth = fontSize * 0.6;
  const baseWidth = text.length * charWidth;
  return bold ? baseWidth * 1.1 : baseWidth;
}

function addTextAtPosition(x, y) {
  const text = prompt('Ingresa el texto:');
  if (!text) return;
  
  if (!drawnTexts[currentPage]) {
    drawnTexts[currentPage] = [];
  }
  
  drawnTexts[currentPage].push({
    x,
    y,
    text,
    bold: textBold,
    italic: textItalic,
    underline: textUnderline,
    color: textColor,
    fontSize: fontSize
  });
  
  renderPage(currentPage);
  addAnnotation('Texto', text);
  statusMessage.textContent = 'Texto añadido. Haz doble clic para editar.';
}

function editText(index) {
  const txt = drawnTexts[currentPage][index];
  const newText = prompt('Edita el texto:', txt.text);
  
  if (newText !== null && newText !== '') {
    txt.text = newText;
    renderPage(currentPage);
    statusMessage.textContent = 'Texto actualizado';
  } else if (newText === '') {
    // Borrar texto
    drawnTexts[currentPage].splice(index, 1);
    renderPage(currentPage);
    statusMessage.textContent = 'Texto eliminado';
  }
}

function showTextEditOptions(index) {
  const txt = drawnTexts[currentPage][index];
  
  // Crear un diálogo personalizado con opciones
  const options = prompt(
    `Opciones:\n` +
    `1 - Editar texto\n` +
    `2 - Cambiar tamaño\n` +
    `3 - Mover\n` +
    `4 - Negrita: ${txt.bold ? 'Sí' : 'No'}\n` +
    `5 - Cursiva: ${txt.italic ? 'Sí' : 'No'}\n` +
    `6 - Subrayado: ${txt.underline ? 'Sí' : 'No'}\n` +
    `7 - Eliminar\n` +
    `Selecciona una opción (1-7):`,
    '1'
  );
  
  if (!options) return;
  
  switch(options.trim()) {
    case '1': // Editar texto
      const newText = prompt('Edita el texto:', txt.text);
      if (newText !== null && newText !== '') {
        txt.text = newText;
        renderPage(currentPage);
        statusMessage.textContent = 'Texto actualizado';
      } else if (newText === '') {
        drawnTexts[currentPage].splice(index, 1);
        renderPage(currentPage);
        statusMessage.textContent = 'Texto eliminado';
      }
      break;
      
    case '2': // Cambiar tamaño
      const newSize = prompt('Nuevo tamaño de fuente (px):', txt.fontSize);
      if (newSize && !isNaN(newSize)) {
        txt.fontSize = parseInt(newSize);
        renderPage(currentPage);
        statusMessage.textContent = 'Tamaño actualizado';
      }
      break;
      
    case '3': // Mover
      statusMessage.textContent = 'Haz clic en la nueva posición';
      selectedTextIndex = index;
      startMoveText();
      break;
      
    case '4': // Negrita
      txt.bold = !txt.bold;
      renderPage(currentPage);
      statusMessage.textContent = `Negrita: ${txt.bold ? 'Activada' : 'Desactivada'}`;
      break;
      
    case '5': // Cursiva
      txt.italic = !txt.italic;
      renderPage(currentPage);
      statusMessage.textContent = `Cursiva: ${txt.italic ? 'Activada' : 'Desactivada'}`;
      break;
      
    case '6': // Subrayado
      txt.underline = !txt.underline;
      renderPage(currentPage);
      statusMessage.textContent = `Subrayado: ${txt.underline ? 'Activado' : 'Desactivado'}`;
      break;
      
    case '7': // Eliminar
      drawnTexts[currentPage].splice(index, 1);
      renderPage(currentPage);
      statusMessage.textContent = 'Texto eliminado';
      break;
  }
}

function startMoveText() {
  isMovingText = true;
  statusMessage.textContent = 'Mueve el cursor y haz clic en la nueva posición';
}

function drawTexts(pageNum) {
  if (!drawnTexts[pageNum]) return;
  
  drawnTexts[pageNum].forEach((txt) => {
    // Construir el estilo de fuente
    let fontStyle = '';
    if (txt.italic) fontStyle += 'italic ';
    if (txt.bold) fontStyle += 'bold ';
    fontStyle += `${txt.fontSize}px Arial`;
    
    annotCtx.font = fontStyle;
    annotCtx.fillStyle = txt.color || '#1e293b';
    annotCtx.textBaseline = 'middle';
    annotCtx.textAlign = 'center';
    annotCtx.fillText(txt.text, txt.x, txt.y);
    
    // Dibujar subrayado si está activo
    if (txt.underline) {
      const textWidth = annotCtx.measureText(txt.text).width;
      const underlineY = txt.y + 2;
      annotCtx.strokeStyle = txt.color || '#1e293b';
      annotCtx.lineWidth = 1;
      annotCtx.beginPath();
      annotCtx.moveTo(txt.x - textWidth / 2, underlineY);
      annotCtx.lineTo(txt.x + textWidth / 2, underlineY);
      annotCtx.stroke();
    }
  });
}

function drawFills(pageNum) {
  if (!fills[pageNum]) return;
  
  fills[pageNum].forEach((fill) => {
    annotCtx.fillStyle = fill.color;
    annotCtx.fillRect(fill.x, fill.y, fill.width, fill.height);
  });
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
}
