// components/loading/3d-view.js

/**
 * Открывает отдельное окно с 3D-визуализацией загрузки грузовиков.
 * @param {object} loadingResult - результат расчёта загрузки (из calculateLoading)
 * @param {number} truckIndex - индекс грузовика для отображения (по умолчанию 0)
 */
export function open3DView(loadingResult, truckIndex = 0) {
  if (!loadingResult || !loadingResult.trucks || loadingResult.trucks.length === 0) {
    alert('Нет данных для 3D-отображения');
    return;
  }

  // Создаём HTML-страницу для нового окна
  const htmlContent = generate3DPage(loadingResult, truckIndex);
  const win = window.open('', '_blank', 'width=1200,height=800,scrollbars=yes');
  if (!win) {
    alert('Не удалось открыть окно. Разрешите всплывающие окна для этого сайта.');
    return;
  }
  win.document.write(htmlContent);
  win.document.close();
  win.focus();
}

/**
 * Генерирует полный HTML для 3D-страницы.
 */
function generate3DPage(loadingResult, initialTruckIndex) {
  const trucks = loadingResult.trucks;
  const totalTrucks = trucks.length;

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>3D Схема загрузки</title>
  <style>
    body { margin: 0; overflow: hidden; font-family: 'Segoe UI', sans-serif; background: #1a1a1a; color: #fff; }
    #info {
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.75);
      padding: 12px 24px;
      border-radius: 8px;
      display: flex;
      gap: 30px;
      align-items: center;
      pointer-events: none;
      z-index: 10;
      font-size: 14px;
      backdrop-filter: blur(4px);
      border: 1px solid #444;
    }
    #info span { white-space: nowrap; }
    #controls {
      position: absolute;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 10px;
      align-items: center;
      z-index: 10;
      background: rgba(0,0,0,0.5);
      padding: 8px 16px;
      border-radius: 8px;
      backdrop-filter: blur(4px);
      border: 1px solid #444;
      pointer-events: auto;
    }
    #controls button {
      background: #4a7a5a;
      border: none;
      color: white;
      padding: 6px 14px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-weight: bold;
    }
    #controls button:hover { background: #5a8a6a; }
    #controls button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    #controls .truck-name {
      font-weight: 600;
      font-size: 16px;
      min-width: 120px;
      text-align: center;
    }
    #stats {
      position: absolute;
      top: 20px;
      right: 20px;
      background: rgba(0,0,0,0.7);
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 13px;
      border: 1px solid #444;
      backdrop-filter: blur(4px);
      pointer-events: none;
      z-index: 10;
      line-height: 1.6;
    }
    #stats .label { color: #aaa; }
    #stats .value { color: #fff; font-weight: 600; }
    .tooltip {
      position: absolute;
      background: rgba(0,0,0,0.85);
      color: #fff;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 12px;
      pointer-events: none;
      display: none;
      z-index: 20;
      border: 1px solid #666;
      max-width: 200px;
      white-space: nowrap;
    }
  </style>
</head>
<body>

  <div id="stats">
    <div><span class="label">Грузовик: </span><span class="value" id="truckNameDisplay">—</span></div>
    <div><span class="label">Предметов: </span><span class="value" id="itemCountDisplay">0</span></div>
    <div><span class="label">Вес: </span><span class="value" id="weightDisplay">0 кг</span></div>
    <div><span class="label">Объём: </span><span class="value" id="volumeDisplay">0 м³</span></div>
  </div>

  <div id="controls">
    <button id="prevTruck" ${totalTrucks <= 1 ? 'disabled' : ''}>◀</button>
    <span class="truck-name" id="truckIndexDisplay">${initialTruckIndex + 1} / ${totalTrucks}</span>
    <button id="nextTruck" ${totalTrucks <= 1 ? 'disabled' : ''}>▶</button>
  </div>

  <div id="info">
    <span>🖱 Перетаскивание — вращение</span>
    <span>🔄 Колёсико — масштаб</span>
    <span>📦 Клик на блок — информация</span>
  </div>

  <div class="tooltip" id="tooltip"></div>

  <!-- Подключаем Three.js и OrbitControls -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"><\/script>

  <script>
    // Передаём данные в глобальную переменную для доступа из скрипта
    const LOADING_DATA = ${JSON.stringify(loadingResult)};
    let currentTruckIndex = ${initialTruckIndex};
    const trucks = LOADING_DATA.trucks;
    let scene, camera, renderer, controls;
    let truckGroup; // группа для объектов текущего грузовика
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const tooltip = document.getElementById('tooltip');

    // Инициализация сцены
    function initScene() {
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1a1a1a);

      // Камера
      const containerWidth = window.innerWidth;
      const containerHeight = window.innerHeight;
      camera = new THREE.PerspectiveCamera(45, containerWidth / containerHeight, 0.1, 1000);
      camera.position.set(6, 4, 8);
      camera.lookAt(0, 0, 0);

      // Рендерер
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(containerWidth, containerHeight);
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      document.body.appendChild(renderer.domElement);

      // Орбит контрол
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.1;
      controls.autoRotate = false;
      controls.target.set(0, 0, 0);
      controls.update();

      // Освещение
      const ambientLight = new THREE.AmbientLight(0x404060);
      scene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
      dirLight.position.set(5, 10, 7);
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.width = 1024;
      dirLight.shadow.mapSize.height = 1024;
      scene.add(dirLight);

      const fillLight = new THREE.DirectionalLight(0x88aaff, 0.5);
      fillLight.position.set(-5, 0, 5);
      scene.add(fillLight);

      // Добавляем сетку для пола (опционально)
      const gridHelper = new THREE.GridHelper(10, 10, 0x888888, 0x444444);
      gridHelper.position.y = -0.01;
      scene.add(gridHelper);

      // Обработчики событий
      renderer.domElement.addEventListener('click', onCanvasClick);
      renderer.domElement.addEventListener('mousemove', onCanvasMouseMove);
      window.addEventListener('resize', onWindowResize);
    }

    // Построение грузовика и предметов
    function buildTruck(truckIndex) {
      // Удаляем старую группу, если есть
      if (truckGroup) {
        scene.remove(truckGroup);
        truckGroup = null;
      }

      const truckData = trucks[truckIndex];
      if (!truckData) return;

      truckGroup = new THREE.Group();

      // --- 1. Полупрозрачный параллелепипед грузовика ---
      // Вычисляем габариты грузовика из первого предмета? У нас нет прямой информации о размерах кузова.
      // Используем приближение: берём максимальные размеры по всем предметам и добавляем запас.
      let maxW = 0, maxH = 0, maxD = 0;
      if (truckData.items && truckData.items.length > 0) {
        truckData.items.forEach(item => {
          const w = item.w || 0;
          const h = item.h || 0;
          const d = item.d || 0;
          const maxCoord = Math.max(w, h, d);
          if (w > maxW) maxW = w;
          if (h > maxH) maxH = h;
          if (d > maxD) maxD = d;
        });
      }
      // Добавляем поля: используем максимальные координаты из упаковки плюс 0.3м запаса
      const truckW = maxW + 0.6;
      const truckH = maxH + 0.6;
      const truckD = maxD + 0.6;

      // Материал полупрозрачный
      const boxMat = new THREE.MeshPhongMaterial({
        color: 0x3a5a8a,
        transparent: true,
        opacity: 0.15,
        wireframe: false,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const wireframeMat = new THREE.LineBasicMaterial({ color: 0x88aaff });

      const boxGeo = new THREE.BoxGeometry(truckW, truckH, truckD);
      const boxMesh = new THREE.Mesh(boxGeo, boxMat);
      // Центрируем грузовик так, чтобы дно было на уровне y=0
      boxMesh.position.set(0, truckH/2, 0);
      truckGroup.add(boxMesh);

      // Рёбра грузовика
      const edges = new THREE.EdgesGeometry(boxGeo);
      const line = new THREE.LineSegments(edges, wireframeMat);
      line.position.copy(boxMesh.position);
      truckGroup.add(line);

      // --- 2. Предметы ---
      const items = truckData.items || [];
      const colors = [0xff6b6b, 0x4ecdc4, 0x45b7d1, 0xf9a825, 0xab47bc, 0x66bb6a, 0xffa726, 0x42a5f5, 0xef5350, 0x26a69a];
      let colorIdx = 0;

      items.forEach((item, idx) => {
        const w = item.w || 0.5;
        const h = item.h || 0.5;
        const d = item.d || 0.5;
        // Координаты центра предмета: item.x, item.y, item.z уже дают нижний-левый-задний угол?
        // В функции packItems мы сохраняли x,y,z как координаты левого нижнего заднего угла.
        // Центр будет: x + w/2, y + h/2, z + d/2
        const cx = (item.x || 0) + w/2;
        const cy = (item.y || 0) + h/2;
        const cz = (item.z || 0) + d/2;

        // Выбираем цвет
        const color = colors[colorIdx % colors.length];
        colorIdx++;

        // Создаём блок
        const mat = new THREE.MeshPhongMaterial({ color: color, emissive: 0x000000, shininess: 30 });
        const geo = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(cx, cy, cz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { itemIndex: idx, name: item.name || 'Предмет' };
        truckGroup.add(mesh);

        // Добавляем тонкую рамку вокруг блока для чёткости
        const edgeGeo = new THREE.EdgesGeometry(geo);
        const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 });
        const edgeLine = new THREE.LineSegments(edgeGeo, edgeMat);
        edgeLine.position.copy(mesh.position);
        truckGroup.add(edgeLine);

        // Подпись (Sprite с текстом) — сделаем позже, чтобы не перегружать.
        // Добавим текстовую метку как спрайт (CanvasTexture)
        const label = createTextSprite(item.name || '');
        label.position.set(cx, cy + h/2 + 0.15, cz);
        truckGroup.add(label);
      });

      // Центрируем всю группу грузовика по центру сцены
      // Сдвигаем группу так, чтобы центр грузовика был в (0, truckH/2, 0) ?
      // Мы уже разместили объекты относительно координат из упаковки, которые начинаются с (0,0,0).
      // Оставляем как есть.

      scene.add(truckGroup);

      // Обновляем информацию
      updateInfo(truckIndex);
    }

    // Создание текстового спрайта
    function createTextSprite(text) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = 'bold 28px Arial';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Обрезаем длинные имена
      let displayText = text;
      if (displayText.length > 20) displayText = displayText.substring(0, 18) + '…';
      ctx.fillText(displayText, canvas.width/2, canvas.height/2);

      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(0.6, 0.3, 1);
      return sprite;
    }

    // Обновление информационной панели
    function updateInfo(index) {
      const truck = trucks[index];
      if (!truck) return;
      document.getElementById('truckNameDisplay').textContent = truck.truckName || 'Грузовик';
      document.getElementById('itemCountDisplay').textContent = truck.items ? truck.items.length : 0;
      document.getElementById('weightDisplay').textContent = (truck.totalWeight || 0).toFixed(1) + ' кг';
      document.getElementById('volumeDisplay').textContent = (truck.totalVolume || 0).toFixed(3) + ' м³';
      document.getElementById('truckIndexDisplay').textContent = (index + 1) + ' / ' + trucks.length;
      document.getElementById('prevTruck').disabled = (index === 0);
      document.getElementById('nextTruck').disabled = (index === trucks.length - 1);
    }

    // Обработка клика по блоку
    function onCanvasClick(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(truckGroup.children, true);
      if (intersects.length > 0) {
        const hit = intersects[0].object;
        if (hit.userData && hit.userData.name) {
          alert('Предмет: ' + hit.userData.name + '\nРазмеры: ' + 
            (hit.geometry.parameters ? 
              hit.geometry.parameters.width.toFixed(1) + '×' + 
              hit.geometry.parameters.height.toFixed(1) + '×' + 
              hit.geometry.parameters.depth.toFixed(1) + ' м' : ''));
        }
      }
    }

    // Обработка наведения для тултипа
    function onCanvasMouseMove(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(truckGroup.children, true);
      let found = false;
      if (intersects.length > 0) {
        const hit = intersects[0].object;
        if (hit.userData && hit.userData.name) {
          tooltip.textContent = hit.userData.name;
          tooltip.style.display = 'block';
          tooltip.style.left = (event.clientX + 10) + 'px';
          tooltip.style.top = (event.clientY - 10) + 'px';
          found = true;
        }
      }
      if (!found) {
        tooltip.style.display = 'none';
      }
    }

    function onWindowResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // Анимационный цикл
    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }

    // Переключение грузовика
    function switchTruck(index) {
      if (index < 0 || index >= trucks.length) return;
      currentTruckIndex = index;
      buildTruck(currentTruckIndex);
    }

    // Инициализация после загрузки
    window.onload = function() {
      initScene();
      buildTruck(currentTruckIndex);
      animate();

      // Обработчики кнопок
      document.getElementById('prevTruck').addEventListener('click', function() {
        if (currentTruckIndex > 0) switchTruck(currentTruckIndex - 1);
      });
      document.getElementById('nextTruck').addEventListener('click', function() {
        if (currentTruckIndex < trucks.length - 1) switchTruck(currentTruckIndex + 1);
      });

      // Клавиатура
      document.addEventListener('keydown', function(e) {
        if (e.key === 'ArrowLeft' && currentTruckIndex > 0) switchTruck(currentTruckIndex - 1);
        if (e.key === 'ArrowRight' && currentTruckIndex < trucks.length - 1) switchTruck(currentTruckIndex + 1);
      });
    };
  <\/script>
</body>
</html>`;
}