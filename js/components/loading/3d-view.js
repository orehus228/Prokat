// components/loading/3d-view.js

export function open3DView(loadingResult, trucksData, truckIndex = 0) {
  console.log('[3D] open3DView', { loadingResult, trucksData, truckIndex });

  if (!loadingResult || !loadingResult.trucks || loadingResult.trucks.length === 0) {
    alert('Нет данных для 3D-отображения');
    return;
  }
  if (!trucksData || trucksData.length === 0) {
    alert('Нет данных о грузовиках');
    return;
  }

  const html = generate3DPage(loadingResult, trucksData, truckIndex);
  const win = window.open('', '_blank', 'width=1200,height=800,scrollbars=yes');
  if (!win) {
    alert('Не удалось открыть окно. Разрешите всплывающие окна.');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
}

function generate3DPage(loadingResult, trucksData, initialTruckIndex) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>3D Загрузка</title>
<style>
  body { margin:0; overflow:hidden; background:#1a1a1a; color:#fff; font-family: sans-serif; }
  #info { position:absolute; bottom:20px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.8); padding:12px 24px; border-radius:8px; display:flex; gap:20px; z-index:10; font-size:14px; border:1px solid #444; }
  #controls { position:absolute; bottom:80px; left:50%; transform:translateX(-50%); display:flex; gap:10px; background:rgba(0,0,0,0.6); padding:8px 16px; border-radius:8px; z-index:10; border:1px solid #444; }
  #controls button { background:#4a7a5a; border:none; color:#fff; padding:6px 14px; border-radius:4px; cursor:pointer; }
  #controls button:disabled { opacity:0.4; }
  #stats { position:absolute; top:20px; right:20px; background:rgba(0,0,0,0.7); padding:12px 16px; border-radius:8px; font-size:13px; border:1px solid #444; z-index:10; line-height:1.6; }
  .tooltip { position:absolute; background:rgba(0,0,0,0.85); color:#fff; padding:4px 10px; border-radius:4px; font-size:12px; display:none; z-index:20; border:1px solid #666; pointer-events:none; }
  #debug { position:absolute; bottom:150px; left:50%; transform:translateX(-50%); background:#222; padding:6px 12px; border-radius:4px; font-size:12px; color:#aaa; z-index:10; border:1px solid #555; cursor:pointer; }
  #debug:hover { background:#333; }
</style>
</head>
<body>
  <div id="stats"><div><span class="label">Грузовик: </span><span id="truckName">—</span></div>
    <div><span class="label">Предметов: </span><span id="itemCount">0</span></div>
    <div><span class="label">Вес: </span><span id="weight">0 кг</span></div>
    <div><span class="label">Объём: </span><span id="volume">0 м³</span></div>
  </div>
  <div id="controls">
    <button id="prev" disabled>◀</button>
    <span id="truckIndex">1/1</span>
    <button id="next" disabled>▶</button>
  </div>
  <div id="info"><span>🖱 Вращение</span><span>🔄 Масштаб</span><span>📦 Клик — инфо</span></div>
  <div id="debug">🔧 Отладка: показать тестовые кубы</div>
  <div class="tooltip" id="tooltip"></div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"><\/script>
  <script>
    // Данные
    const LOADING = ${JSON.stringify(loadingResult)};
    const TRUCKS = ${JSON.stringify(trucksData)};
    let currentIdx = ${initialTruckIndex};
    const trucks = LOADING.trucks;

    console.log('LOADING:', LOADING);
    console.log('TRUCKS:', TRUCKS);
    console.log('trucks:', trucks);

    let scene, camera, renderer, controls, truckGroup;

    function init() {
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1a1a1a);

      camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 1000);
      camera.position.set(5, 4, 8);
      camera.lookAt(0,0,0);

      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.shadowMap.enabled = true;
      document.body.appendChild(renderer.domElement);

      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.target.set(0,0,0);

      const ambient = new THREE.AmbientLight(0x404060);
      scene.add(ambient);
      const dir = new THREE.DirectionalLight(0xffffff, 1);
      dir.position.set(5,10,7);
      dir.castShadow = true;
      scene.add(dir);
      const fill = new THREE.DirectionalLight(0x88aaff, 0.5);
      fill.position.set(-5,0,5);
      scene.add(fill);

      const grid = new THREE.GridHelper(10,10,0x888888,0x444444);
      grid.position.y = -0.01;
      scene.add(grid);

      renderer.domElement.addEventListener('click', onCanvasClick);
      renderer.domElement.addEventListener('mousemove', onCanvasMove);
      window.addEventListener('resize', onResize);

      buildTruck(currentIdx);
      animate();

      document.getElementById('prev').addEventListener('click', () => { if(currentIdx>0) switchTruck(currentIdx-1); });
      document.getElementById('next').addEventListener('click', () => { if(currentIdx<trucks.length-1) switchTruck(currentIdx+1); });

      document.getElementById('debug').addEventListener('click', showDebugCubes);
    }

    function buildTruck(index) {
      if (truckGroup) { scene.remove(truckGroup); truckGroup = null; }
      const truckData = trucks[index];
      if (!truckData) { return; }

      const truckInfo = TRUCKS[index] || {};
      const w = (truckInfo.width || 200)/100;
      const h = (truckInfo.height || 200)/100;
      const d = (truckInfo.depth || 400)/100;
      console.log('Грузовик размер (м):', w,h,d);

      truckGroup = new THREE.Group();

      // Полупрозрачный куб грузовика
      const boxMat = new THREE.MeshPhongMaterial({ color:0x3a5a8a, transparent:true, opacity:0.15, side:THREE.DoubleSide });
      const box = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), boxMat);
      box.position.set(0, h/2, 0);
      truckGroup.add(box);

      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w,h,d)), new THREE.LineBasicMaterial({color:0x88aaff}));
      edges.position.set(0, h/2, 0);
      truckGroup.add(edges);

      // Предметы
      const items = truckData.items || [];
      console.log('Предметов для отрисовки:', items.length);
      const colors = [0xff6b6b,0x4ecdc4,0x45b7d1,0xf9a825,0xab47bc,0x66bb6a,0xffa726,0x42a5f5];
      let colorIdx = 0;

      if (items.length === 0) {
        // Если нет предметов, показываем тестовый куб внутри грузовика
        const testMat = new THREE.MeshPhongMaterial({ color:0xff0000, emissive:0x440000 });
        const testBox = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.5,0.5), testMat);
        testBox.position.set(0, h/2, 0);
        truckGroup.add(testBox);
        console.log('Добавлен тестовый красный куб, т.к. items пуст');
      } else {
        items.forEach((item, idx) => {
          let iw = (item.w || 0.01)/100;
          let ih = (item.h || 0.01)/100;
          let id = (item.d || 0.01)/100;
          if (iw < 0.05) iw = 0.05;
          if (ih < 0.05) ih = 0.05;
          if (id < 0.05) id = 0.05;

          const cx = ((item.x || 0) + iw/2);
          const cy = ((item.y || 0) + ih/2);
          const cz = ((item.z || 0) + id/2);
          console.log(`Предмет ${idx}: размер ${iw.toFixed(3)}x${ih.toFixed(3)}x${id.toFixed(3)}м, позиция (${cx.toFixed(3)},${cy.toFixed(3)},${cz.toFixed(3)})`);

          const color = colors[colorIdx % colors.length];
          colorIdx++;
          const mat = new THREE.MeshPhongMaterial({ color, emissive:0x000000 });
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(iw,ih,id), mat);
          mesh.position.set(cx, cy, cz);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData = { name: item.name || 'Предмет' };
          truckGroup.add(mesh);

          // Обводка
          const edgeMat = new THREE.LineBasicMaterial({ color:0xffffff, transparent:true, opacity:0.2 });
          const edgeLine = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(iw,ih,id)), edgeMat);
          edgeLine.position.copy(mesh.position);
          truckGroup.add(edgeLine);

          // Подпись
          const label = createTextSprite(item.name || '');
          label.position.set(cx, cy + ih/2 + 0.15, cz);
          truckGroup.add(label);
        });
      }

      scene.add(truckGroup);
      updateInfo(index);
    }

    function createTextSprite(text) {
      const canvas = document.createElement('canvas');
      canvas.width=256; canvas.height=128;
      const ctx=canvas.getContext('2d');
      ctx.fillStyle='rgba(0,0,0,0.6)';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.font='bold 28px Arial';
      ctx.fillStyle='#ffffff';
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      let display=text;
      if(display.length>20) display=display.substring(0,18)+'…';
      ctx.fillText(display, canvas.width/2, canvas.height/2);
      const tex=new THREE.CanvasTexture(canvas);
      const mat=new THREE.SpriteMaterial({map:tex, depthTest:false});
      const sprite=new THREE.Sprite(mat);
      sprite.scale.set(0.6,0.3,1);
      return sprite;
    }

    function updateInfo(index) {
      const truck = trucks[index];
      if (!truck) return;
      const info = TRUCKS[index] || {};
      document.getElementById('truckName').textContent = info.name || truck.truckName || 'Грузовик';
      document.getElementById('itemCount').textContent = truck.items ? truck.items.length : 0;
      document.getElementById('weight').textContent = (truck.totalWeight || 0).toFixed(1) + ' кг';
      document.getElementById('volume').textContent = (truck.totalVolume || 0).toFixed(3) + ' м³';
      document.getElementById('truckIndex').textContent = (index+1)+'/'+trucks.length;
      document.getElementById('prev').disabled = (index===0);
      document.getElementById('next').disabled = (index===trucks.length-1);
    }

    function switchTruck(index) {
      currentIdx = index;
      buildTruck(currentIdx);
    }

    function onCanvasClick(e) {
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(truckGroup.children, true);
      if (intersects.length > 0) {
        const hit = intersects[0].object;
        if (hit.userData && hit.userData.name) {
          alert('Предмет: ' + hit.userData.name);
        }
      }
    }

    function onCanvasMove(e) {
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(truckGroup.children, true);
      const tooltip = document.getElementById('tooltip');
      if (intersects.length > 0 && intersects[0].object.userData.name) {
        tooltip.textContent = intersects[0].object.userData.name;
        tooltip.style.display = 'block';
        tooltip.style.left = (e.clientX + 10) + 'px';
        tooltip.style.top = (e.clientY - 10) + 'px';
      } else {
        tooltip.style.display = 'none';
      }
    }

    function onResize() {
      camera.aspect = window.innerWidth/window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }

    function showDebugCubes() {
      if (!truckGroup) return;
      // Добавляем несколько цветных кубов в разных местах грузовика
      const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00];
      const positions = [
        [0.5, 0.5, 0.5],
        [-0.5, 0.5, -0.5],
        [0.5, 0.5, -0.5],
        [-0.5, 0.5, 0.5]
      ];
      positions.forEach((pos, i) => {
        const mat = new THREE.MeshPhongMaterial({ color: colors[i % colors.length], emissive:0x222222 });
        const cube = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), mat);
        cube.position.set(pos[0], pos[1], pos[2]);
        truckGroup.add(cube);
      });
      console.log('Добавлены тестовые кубы');
    }

    window.onload = init;
  <\/script>
</body>
</html>`;
}