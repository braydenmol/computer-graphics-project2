// =====================================================================
//  A grid of cubes with random colors and random heights, in WebGL
// =====================================================================
//
// THE BIG PICTURE
// ---------------
// WebGL can only draw points, lines and triangles. To draw a cube we
// describe it as 12 triangles (2 per face × 6 faces), hand those
// triangles to the GPU, and then ask the GPU to draw that cube once for
// every cube in our list, each time with a different position, height
// and color.
//
// Every frame of WebGL drawing follows the same basic steps:
//
//   1. SHADERS  - small programs that run on the GPU. The *vertex shader*
//                 decides where each corner (vertex) of a triangle lands
//                 on the screen. The *fragment shader* decides the color
//                 of each pixel inside the triangle.
//   2. BUFFERS  - we copy our vertex data (the corners of the cube) into
//                 GPU memory once, at startup.
//   3. UNIFORMS - values that stay the same for a whole draw call, like
//                 "this cube is red" or "this cube is 3 units tall".
//                 We change them before drawing each cube.
//   4. DRAW     - we tell the GPU "draw 36 vertices as triangles".
//
// The sections below follow that same order.


// ---------------------------------------------------------------------
// 0. Get a WebGL "context" from the <canvas> element in index.html.
//    The context (gl) is the object we use to issue every WebGL command.
// ---------------------------------------------------------------------
'use strict';
const canvas = document.getElementById('c');
const gl = canvas.getContext('webgl');

if (!gl) { document.getElementById('error').textContent='WebGL not supported'; 
  throw Error('WebGL unavailable'); }

// ---------------------------------------------------------------------
// 1. SHADERS
//    Shaders are written in GLSL, a C-like language. We store the source
//    code in JavaScript strings, then compile them for the GPU.
//
//    Three kinds of shader variables:
//      attribute - a different value for every vertex (e.g. its position)
//      uniform   - one value shared by every vertex in a draw call
//      varying   - passed from the vertex shader to the fragment shader
// ---------------------------------------------------------------------
const vertexShaderSource = `
  attribute vec3 aPosition;
  attribute vec3 aNormal;
  attribute vec3 aShade;

  uniform mat4 uModel;
  uniform mat4 uView;
  uniform mat4 uProjection;

  varying vec3 vNormal;
  varying vec3 vShade;

  void main() {
    gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
    vNormal = normalize(mat3(uModel) * aNormal);
    vShade = aShade;
}`;
const fragmentShaderSource = `
  precision mediump float;

  uniform vec3 uColor;        // this cube's color (red, green, blue: 0..1)
  uniform float uLighting;

  varying vec3 vNormal;
  varying vec3 vShade;

  void main() {
    // Simple lighting so we can tell the faces of a cube apart.
    // A face pointing toward the light is bright; one facing away is dim.
    vec3 lightDirection = normalize(vec3(0.5, 1.0, 0.3));
    float brightness = max(dot(normalize(vNormal), lightDirection), 0.0);

    // Keep 30% "ambient" light so faces in shadow aren't pure black.
    float light = 0.3 + 0.7 * brightness;

    gl_FragColor = vec4(uColor * vShade * mix(1.0, light, uLighting), 1.0);
  }
  `;

// Compile one shader and report any GLSL errors.
function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw Error(gl.getShaderInfoLog(shader));
  } 
  return shader;
}

// A "program" is a vertex shader + a fragment shader linked together.
const program = gl.createProgram();
gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexShaderSource));
gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource));
gl.linkProgram(program);

// Throw error if fails
if (!gl.getProgramParameter(program, gl.LINK_STATUS))
  throw Error(gl.getProgramInfoLog(program));

gl.useProgram(program);

// ---------------------------------------------------------------------
// 2. CUBE GEOMETRY → BUFFER
//    One cube, 1 unit wide, with its bottom at y = 0 (so it sits on the
//    ground). Every cube in the scene reuses this same data; uModel is
//    what makes each one different.
//
//    Each face = 2 triangles = 6 vertices. Each vertex has 6 numbers:
//         x,    y,    z,      nx, ny, nz   (position, then normal)
// ---------------------------------------------------------------------
const cubeVertices = new Float32Array([
  // Front face (normal points toward +z)
  -0.5, 0, 0.5,   0, 0, 1,
   0.5, 0, 0.5,   0, 0, 1,
   0.5, 1, 0.5,   0, 0, 1,
  -0.5, 0, 0.5,   0, 0, 1,
   0.5, 1, 0.5,   0, 0, 1,
  -0.5, 1, 0.5,   0, 0, 1,

  // Back face (-z)
  -0.5, 0, -0.5,  0, 0, -1,
   0.5, 1, -0.5,  0, 0, -1,
   0.5, 0, -0.5,  0, 0, -1,
  -0.5, 0, -0.5,  0, 0, -1,
  -0.5, 1, -0.5,  0, 0, -1,
   0.5, 1, -0.5,  0, 0, -1,

  // Top face (+y)
  -0.5, 1, -0.5,  0, 1, 0,
  -0.5, 1,  0.5,  0, 1, 0,
   0.5, 1,  0.5,  0, 1, 0,
  -0.5, 1, -0.5,  0, 1, 0,
   0.5, 1,  0.5,  0, 1, 0,
   0.5, 1, -0.5,  0, 1, 0,

  // Bottom face (-y)
  -0.5, 0, -0.5,  0, -1, 0,
   0.5, 0,  0.5,  0, -1, 0,
  -0.5, 0,  0.5,  0, -1, 0,
  -0.5, 0, -0.5,  0, -1, 0,
   0.5, 0, -0.5,  0, -1, 0,
   0.5, 0,  0.5,  0, -1, 0,

  // Right face (+x)
   0.5, 0, -0.5,  1, 0, 0,
   0.5, 1, -0.5,  1, 0, 0,
   0.5, 1,  0.5,  1, 0, 0,
   0.5, 0, -0.5,  1, 0, 0,
   0.5, 1,  0.5,  1, 0, 0,
   0.5, 0,  0.5,  1, 0, 0,

  // Left face (-x)
  -0.5, 0, -0.5, -1, 0, 0,
  -0.5, 1,  0.5, -1, 0, 0,
  -0.5, 1, -0.5, -1, 0, 0,
  -0.5, 0, -0.5, -1, 0, 0,
  -0.5, 0,  0.5, -1, 0, 0,
  -0.5, 1,  0.5, -1, 0, 0,
]);
const VERTEX_COUNT = 36;

// Copy the vertex data into GPU memory.
const buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
gl.bufferData(gl.ARRAY_BUFFER, cubeVertices, gl.STATIC_DRAW);

// Tell the GPU how to read the buffer: which numbers are the position
// and which are the normal.
//   stride = bytes from one vertex to the next = 6 floats × 4 bytes = 24
//   offset = where in each vertex this attribute starts
const BYTES_PER_FLOAT = 4;
const stride = 6 * BYTES_PER_FLOAT;

const aPosition = gl.getAttribLocation(program, 'aPosition');
gl.enableVertexAttribArray(aPosition);
gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, stride, 0);

const aNormal = gl.getAttribLocation(program, 'aNormal');
gl.enableVertexAttribArray(aNormal);
gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, stride, 3 * BYTES_PER_FLOAT);

// Look up where each uniform lives so we can set it later.
const uModel = gl.getUniformLocation(program, 'uModel');
const uView = gl.getUniformLocation(program, 'uView');
const uProjection = gl.getUniformLocation(program, 'uProjection');
const uColor = gl.getUniformLocation(program, 'uColor');

// Create a grayscale shade value for each vertex
const shadeData = [];
for (let i = 0; i < VERTEX_COUNT; i++) {
  const y = cubeVertices[i * 6 + 1];
  const shade = 0.88 + 0.12 * y;
  shadeData.push(shade, shade, shade);
}

// Upload shade values
// Connect shade values to shader's aShade attribute
const shadeBuffer = gl.createBuffer();

gl.bindBuffer(gl.ARRAY_BUFFER, shadeBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(shadeData), gl.STATIC_DRAW);

const aShade = gl.getAttribLocation(program, 'aShade');

gl.enableVertexAttribArray(aShade);
gl.vertexAttribPointer(aShade, 3, gl.FLOAT, false, 0, 0);

// Restore the cube position/normal buffer after configuring the shade attribute.
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

const uLighting = gl.getUniformLocation(program, 'uLighting');

// ---------------------------------------------------------------------
// 3. THE SCENE: a plain JavaScript list of cubes
//    This part has nothing to do with WebGL - it's just data.
//    The cubes are laid out in a resolution x resolution grid on the
//    ground plane (y = 0), centered on the origin.
// ---------------------------------------------------------------------

// Level 0 is a 2x2x2 cube. Other levels build a grid of these same cube models.
let level = 4;
let resolution = 20;
let cubes = [];
let angle = 0;
let paused = false;
let colorPixels = null;
let heightPixels = null;

const titles = [
  'Level 0: Single cube',
  'Level 1: Procedural landscape',
  'Level 2: Image-based landscape',
  'Level 3: Moving clouds',
  'Level 4: Lighting experiment'
];
const descriptions = [
  'One cube with dimensions 2 × 2 × 2.',
  'A grid of cubes with heights and vertex colors.',
  'Cube heights and colors come from the two PNG images.',
  'The same terrain with clouds made from cubes moving along Bézier curves.',
  'Level 3 + the simple directional lighting.'
];

// Load image and return its pixel data 
function loadPixels(filename) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {

      const offscreen = document.createElement('canvas');
      offscreen.width = image.width;
      offscreen.height = image.height;

      const ctx = offscreen.getContext('2d');
      ctx.drawImage(image, 0, 0);
      resolve(ctx.getImageData(0, 0, image.width, image.height));
    };

    image.onerror = () => reject(Error('Could not load ' + filename));
    image.src = filename;
  });
}

// Map normalized coordinates (u, v) to a pixel in the image
// Return that pixel's RGB color values
function pixel(image, u, v) {
  const x = Math.min(image.width - 1, Math.floor(u * image.width));
  const y = Math.min(image.height - 1, Math.floor(v * image.height));
  const i = (y * image.width + x) * 4;
  return [image.data[i], image.data[i+1], image.data[i+2]];
}

// Function to build landscape as a grid of cubes
function buildLandscape() {
  cubes = [];

  // When level = 0, add one green cube to cubes
  if (level === 0) {
    cubes.push({x:0,y:-1,z:0,sx:2,sy:2,sz:2,color:[0.4,0.7,0.4]});
    return;
  }

  // Generate a grid of cubes
  // Calculate each cube's height level and color 
  for (let row=0; row<resolution; row++) {
    for (let col=0; col<resolution; col++) {
      const u = (col + 0.5) / resolution;
      const v = (row + 0.5) / resolution;
      let height, color;

      if (level === 1) {
        // Two smooth hills, plus a small ripple, No random changes each frame
        // These two equations were AI generated to create the two hills
        // Each cube's height is determined by its position in the grid
        const a = Math.exp(-((u-.32)**2 + (v-.48)**2) / .035);
        const b = Math.exp(-((u-.72)**2 + (v-.62)**2) / .045);

        height = 0.7 + 6*a + 4*b + .35*Math.sin(u*18)*Math.cos(v*14);
        color = height > 4.7 ? [.58,.57,.52] : [.32,.58,.27];
      } else {
        const gray = pixel(heightPixels,u,v)[0];

        height = .5 + (gray / 255) * 8.5;
        color = pixel(colorPixels,u,v).map(c=>c/255);
      }
      cubes.push({
        x: (col - (resolution-1)/2), y:0,
        z: (row - (resolution-1)/2),
        sx:1.01, sy:Math.max(.2,height), sz:1.01, color
      });
    }
  }
}

// ---------------------------------------------------------------------
// 4. MATRIX HELPERS
//    A 4×4 matrix can move, scale, or rotate points. WebGL stores
//    matrices as 16 numbers in "column-major" order: the first 4 numbers
//    are the first COLUMN, not the first row. That's why the translation
//    (x, y, z) appears in the last 4 numbers below.
//
//    (Real projects usually use a library such as glMatrix for this.)
// ---------------------------------------------------------------------

// Move a point by (x, y, z).
function translation(x, y, z) {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1,
  ];
}

// Stretch a point by (sx, sy, sz).
function scaling(sx, sy, sz) {
  return [
    sx, 0,  0,  0,
    0,  sy, 0,  0,
    0,  0,  sz, 0,
    0,  0,  0,  1,
  ];
}

// Multiply two matrices: the result does b first, then a.
function multiply(a, b) {
  const result = new Array(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) {
        result[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
      }
    }
  }
  return result;
}

// Perspective projection: makes far-away objects look smaller.
//   fieldOfView - how wide the camera sees, in radians
//   aspect      - canvas width / height, so things aren't stretched
//   near, far   - nothing closer than near or farther than far is drawn
function perspective(fieldOfView, aspect, near, far) {
  const f = 1 / Math.tan(fieldOfView / 2);
  return [
    f / aspect, 0, 0,                               0,
    0,          f, 0,                               0,
    0,          0, (far + near) / (near - far),    -1,
    0,          0, (2 * far * near) / (near - far), 0,
  ];
}

// Camera matrix: place a camera at `eye`, looking at `target`.
// `up` says which way is "up" for the camera (normally +y).
function lookAt(eye, target, up) {
  const subtract = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const normalize = (a) => {
    const length = Math.hypot(a[0], a[1], a[2]);
    return [a[0] / length, a[1] / length, a[2] / length];
  };

  // Build the camera's own three axes:
  const zAxis = normalize(subtract(eye, target)); // points backward, away from what we look at
  const xAxis = normalize(cross(up, zAxis));      // points to the camera's right
  const yAxis = cross(zAxis, xAxis);              // points to the camera's up

  return [
    xAxis[0], yAxis[0], zAxis[0], 0,
    xAxis[1], yAxis[1], zAxis[1], 0,
    xAxis[2], yAxis[2], zAxis[2], 0,
    -dot(xAxis, eye), -dot(yAxis, eye), -dot(zAxis, eye), 1,
  ];
}

// Cubic Bézier curve: four control points, t from 0 to 1.
function bezier(p0,p1,p2,p3,t) {
  const s=1-t;
  return s*s*s*p0 + 3*s*s*t*p1 + 3*s*t*t*p2 + t*t*t*p3;
}

// ---------------------------------------------------------------------
// 5. DRAW
// ---------------------------------------------------------------------
function drawCube(cube) {
  // model = translation * scaling
  // set uniforms, draw 36 triangle vertices
  const model = multiply(translation(cube.x,cube.y,cube.z),scaling(cube.sx,cube.sy,cube.sz));
  gl.uniformMatrix4fv(uModel,false,model);
  gl.uniform3fv(uColor,cube.color);
  gl.drawArrays(gl.TRIANGLES,0,VERTEX_COUNT);
}

// Animate clouds along curved paths and draw each one
function drawClouds(seconds) {
  const half = resolution/2;

  for (let cloud=0; cloud<3; cloud++) {
    // Offset each cloid
    const t = ((seconds*.045 + cloud/3) % 1);
    const x = bezier(-half-6,-half*.5,half*.5,half+6,t);
    const z = bezier(-half*.6,-half*.9,half*.6,half*.8,t);
    const y = bezier(12+cloud,14+cloud,13+cloud,12+cloud,t);
    const white = [.92,.93,.95];

    // Draw cloud's center and two side sections
    drawCube({x,y,z,sx:2.5,sy:.65,sz:1.4,color:white});
    drawCube({x:x-1.7,y:y-.2,z,sx:1.8,sy:.5,sz:1.2,color:white});
    drawCube({x:x+1.7,y:y-.2,z,sx:1.8,sy:.5,sz:1.2,color:white});
  }
}

// Render one animation frame then schedule next
function drawFrame(ms) {
  const seconds=ms/1000;

  // Rotate camera
  if (!paused) angle += Math.min(.04, (seconds - (drawFrame.previous || seconds))) * .22;
  drawFrame.previous = seconds;

  // Matyh the canvas drawing size to display size
  const width=canvas.clientWidth, height=canvas.clientHeight;
  if (canvas.width!==width || canvas.height!==height) {canvas.width=width;canvas.height=height;}

  // Set up view port, sky background and depth testing
  gl.viewport(0,0,canvas.width,canvas.height);
  gl.clearColor(.63,.79,.94,1);
  gl.enable(gl.DEPTH_TEST);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Position the camera and update projection
  const distance = level===0 ? 9 : resolution*1.65;
  const eye=[Math.sin(angle)*distance, level===0?5:distance*.62, Math.cos(angle)*distance];
  gl.uniformMatrix4fv(uProjection,false,perspective(Math.PI/4,canvas.width/canvas.height,.1,200));
  gl.uniformMatrix4fv(uView,false,lookAt(eye,[0,level===0?0:2,0],[0,1,0]));
  // Enable lighting 
  gl.uniform1f(uLighting,level===4?1:0);
  for (const cube of cubes) drawCube(cube);
  if (level>=3) drawClouds(seconds);

  requestAnimationFrame(drawFrame);
}

// User controlsm
// Update title and description
function updateUI() {
  document.getElementById('levelTitle').textContent=titles[level];
  document.getElementById('description').textContent=descriptions[level];

  // Display current level
  document.querySelectorAll('[data-level]').forEach(b=>b.classList.toggle('active',Number(b.dataset.level)===level)
  );
}

document.querySelectorAll('[data-level]').forEach(button=>
  button.addEventListener('click',()=>{
  level=Number(button.dataset.level);
  buildLandscape();
  updateUI();
}));

document.getElementById('resolution').addEventListener('change',e=>{
  resolution=Number(e.target.value);
  buildLandscape();
  updateUI();
});

document.getElementById('pause').addEventListener('click',e=>{
  paused=!paused;e.target.textContent =
  paused?'Resume orbit':'Pause orbit';
});

document.getElementById('reset').addEventListener('click',()=>{angle=0;});
Promise.all([loadPixels('assets/color-map.png'),loadPixels('assets/height-map.png')])
  .then(([c,h])=>{colorPixels=c;heightPixels=h;buildLandscape();updateUI();requestAnimationFrame(drawFrame);})
  .catch(err=>{document.getElementById('error').textContent=err.message+' — run using a local web server.';});
