// Does this OpenSCAD code render, and does the object fit the shop's printer?
// Renders with OpenSCAD's WebAssembly build, reads the STL's corners, compares with the bed.
import { createOpenSCAD } from 'openscad-wasm-prebuilt'
import fs from 'node:fs'
export const BED = { x: 250, y: 210, z: 220 } // mm: the shop's 3D printer
export async function check(code) {
  const errors = []
  const scad = await createOpenSCAD({ noInitialRun: true, print: () => {}, printErr: (t) => errors.push(t) })
  const inst = scad.getInstance()
  inst.FS.writeFile('/in.scad', code)
  let stl = ''
  try {
    inst.callMain(['/in.scad', '--enable=manifold', '-o', '/out.stl'])
    stl = inst.FS.readFile('/out.stl', { encoding: 'utf8' })
  } catch { /* no output */ }
  const v = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => m.slice(1).map(Number))
  if (!v.length) return { renders: false, fits: false, problems: [errors.filter((e) => /ERROR|WARNING/.test(e)).slice(0, 2).join(' ') || 'nothing rendered'] }
  const min = [0, 1, 2].map((i) => Math.min(...v.map((p) => p[i]))), max = [0, 1, 2].map((i) => Math.max(...v.map((p) => p[i])))
  const size = max.map((m, i) => Math.round((m - min[i]) * 10) / 10)
  const fits = size[0] <= BED.x && size[1] <= BED.y && size[2] <= BED.z
  return { renders: true, fits, size, triangles: v.length / 3, problems: fits ? [] : [`${size.join(' x ')} mm is bigger than the bed`] }
}
if (process.argv[1]?.endsWith('check-design.mjs') && process.argv[2]) check(fs.readFileSync(process.argv[2], 'utf8')).then((r) => console.log(JSON.stringify(r)))
