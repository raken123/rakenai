// Turntable preview for Wavefront OBJ meshes, drawn with flat shading on a 2D canvas.

function parseObj(text) {
  const verts = [];
  const faces = [];
  for (const line of text.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === 'v') verts.push(parts.slice(1, 4).map(Number));
    if (parts[0] === 'f') {
      const idx = parts.slice(1).map((p) => {
        const i = parseInt(p, 10);
        return i < 0 ? verts.length + i : i - 1;
      });
      for (let k = 1; k + 1 < idx.length; k++) faces.push([idx[0], idx[k], idx[k + 1]]);
    }
  }
  return { verts, faces: faces.filter((f) => f.every((i) => verts[i])) };
}

export function meshPreview(objText, size = 480) {
  const { verts, faces } = parseObj(objText);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  if (!verts.length) return canvas;

  const min = [0, 1, 2].map((a) => Math.min(...verts.map((v) => v[a])));
  const max = [0, 1, 2].map((a) => Math.max(...verts.map((v) => v[a])));
  const center = min.map((m, a) => (m + max[a]) / 2);
  const scale = (size * 0.38) / Math.max(...max.map((m, a) => m - min[a]), 1e-6) * 2;
  const ctx = canvas.getContext('2d');
  let angle = 0.6;

  function draw() {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const tilt = 0.35;
    const p = verts.map(([x, y, z]) => {
      x -= center[0]; y -= center[1]; z -= center[2];
      const rx = x * cos + z * sin;
      const rz = -x * sin + z * cos;
      const ry = y * Math.cos(tilt) - rz * Math.sin(tilt);
      const rz2 = y * Math.sin(tilt) + rz * Math.cos(tilt);
      return [rx, ry, rz2];
    });
    const tris = faces.map((f) => {
      const [a, b, c] = f.map((i) => p[i]);
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const len = Math.hypot(...n) || 1;
      const light = Math.abs((n[0] * 0.4 + n[1] * 0.7 + n[2] * 0.6) / len);
      return { pts: [a, b, c], depth: a[2] + b[2] + c[2], light };
    });
    tris.sort((m, n) => m.depth - n.depth);

    ctx.fillStyle = '#10131a';
    ctx.fillRect(0, 0, size, size);
    for (const t of tris) {
      const shade = Math.round(60 + 170 * t.light);
      ctx.fillStyle = `rgb(${shade * 0.75}, ${shade * 0.7}, ${shade})`;
      ctx.beginPath();
      t.pts.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](size / 2 + x * scale, size / 2 - y * scale));
      ctx.closePath();
      ctx.fill();
    }
    angle += 0.01;
    if (canvas.isConnected || angle < 0.62) requestAnimationFrame(draw);
  }
  draw();
  return canvas;
}
