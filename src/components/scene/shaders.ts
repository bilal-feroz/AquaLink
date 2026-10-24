/**
 * GLSL building blocks and materials for water, glass, marine life and flow.
 * Custom shaders include three's tone-mapping and colour-space chunks so they
 * match standard materials both on screen and through the post-processing chain.
 */
import * as THREE from "three";

export const CAUSTIC_GLSL = /* glsl */ `
float causticPattern(vec2 uv, float time) {
  vec2 p = mod(uv * 6.28318, 6.28318) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float t = time * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.0);
}
`;

const TONE = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

// ---------------------------------------------------------------------------
// Water: interior back wall (opaque) — depth gradient, light shafts, caustics.

export function waterBackMaterial(shallow: string, deep: string, radius: number, height: number) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(shallow) },
      uDeep: { value: new THREE.Color(deep) },
      uRadius: { value: radius },
      uHeight: { value: height },
      uDim: { value: 0 },
      uAlert: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uShallow; uniform vec3 uDeep;
      uniform float uRadius; uniform float uHeight; uniform float uDim; uniform float uAlert;
      varying vec3 vLocal;
      ${CAUSTIC_GLSL}
      void main() {
        float h = clamp(vLocal.y / uHeight + 0.5, 0.0, 1.0);
        float ang = atan(vLocal.z, vLocal.x);
        float u = ang / 6.28318 + 0.5;
        vec3 col = mix(uDeep, uShallow, pow(h, 1.35));
        // Soft light shafts from the surface.
        float shafts = smoothstep(0.35, 1.0, sin(u * 6.28318 * 9.0 + sin(u * 6.28318 * 4.0 + uTime * 0.12) * 1.8 + uTime * 0.05));
        shafts *= smoothstep(0.05, 0.95, h) * 0.32;
        // Caustics, tiled seamlessly around the circumference.
        float reps = max(2.0, floor(uRadius * 1.2));
        float c = causticPattern(vec2(u * reps, vLocal.y * 0.22 - uTime * 0.01), uTime * 0.35);
        col += uShallow * (shafts + c * 0.35 * smoothstep(0.1, 1.0, h));
        col *= 0.62 + 0.38 * h;
        // Alerts tint slightly red without hiding the habitat.
        col = mix(col, col * vec3(1.25, 0.55, 0.55), uAlert * 0.35);
        col = mix(col, col * 0.35 + vec3(0.02, 0.05, 0.09), uDim);
        gl_FragColor = vec4(col, 1.0);
        ${TONE}
      }
    `,
  });
}

// ---------------------------------------------------------------------------
// Water: front volume (transparent) — Beer–Lambert haze from the analytic chord
// length of the view ray through the cylinder.

export function waterFrontMaterial(shallow: string, deep: string, radius: number, height: number, density: number) {
  return new THREE.ShaderMaterial({
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(shallow) },
      uDeep: { value: new THREE.Color(deep) },
      uRadius: { value: radius },
      uHeight: { value: height },
      uDensity: { value: density },
      uCamLocal: { value: new THREE.Vector3() },
      uOpacity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uShallow; uniform vec3 uDeep;
      uniform float uRadius; uniform float uHeight; uniform float uDensity; uniform vec3 uCamLocal; uniform float uOpacity;
      varying vec3 vLocal;
      ${CAUSTIC_GLSL}
      void main() {
        vec3 rd = normalize(vLocal - uCamLocal);
        vec3 ro = vLocal;
        // Exit distance from this entry point through the cylinder x²+z²=R².
        float a = dot(rd.xz, rd.xz);
        float b = 2.0 * dot(ro.xz, rd.xz);
        float c = dot(ro.xz, ro.xz) - uRadius * uRadius;
        float disc = max(b * b - 4.0 * a * c, 0.0);
        float tExit = a > 1e-5 ? (-b + sqrt(disc)) / (2.0 * a) : 0.0;
        // Clip by the top and bottom of the water column.
        float yTop = uHeight * 0.5; float yBot = -uHeight * 0.5;
        if (rd.y > 1e-4) tExit = min(tExit, (yTop - ro.y) / rd.y);
        if (rd.y < -1e-4) tExit = min(tExit, (yBot - ro.y) / rd.y);
        float thickness = max(tExit, 0.0);
        float h = clamp(vLocal.y / uHeight + 0.5, 0.0, 1.0);
        float alpha = 1.0 - exp(-thickness * uDensity);
        vec3 col = mix(uDeep, uShallow, pow(h, 1.2));
        float ang = atan(vLocal.z, vLocal.x);
        float caus = causticPattern(vec2(ang * 0.6, vLocal.y * 0.25), uTime * 0.3);
        col += uShallow * caus * 0.12 * h;
        // Brighter edge where the view grazes the curved surface.
        float edge = 1.0 - clamp(thickness / (2.0 * uRadius), 0.0, 1.0);
        col += vec3(0.25, 0.45, 0.5) * pow(edge, 3.0) * 0.5;
        gl_FragColor = vec4(col, clamp(alpha * 0.72 + pow(edge, 4.0) * 0.12, 0.0, 0.8) * uOpacity);
        ${TONE}
      }
    `,
  });
}

// ---------------------------------------------------------------------------
// Water surface seen from above.

export function waterSurfaceMaterial(shallow: string) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(shallow) }, uOpacity: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vWorld;
      void main() { vUv = uv; vWorld = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor; uniform float uOpacity;
      varying vec2 vUv; varying vec3 vWorld;
      ${CAUSTIC_GLSL}
      void main() {
        float c = causticPattern(vWorld.xz * 0.18, uTime * 0.45);
        vec3 col = uColor * 0.55 + vec3(0.6, 0.85, 0.95) * c * 0.6;
        gl_FragColor = vec4(col, 0.55 * uOpacity);
        ${TONE}
      }
    `,
  });
}

// ---------------------------------------------------------------------------
// Suspended particles drifting slowly upward inside the water column.

export function particleMaterial(color: string, height: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uHeight: { value: height }, uOpacity: { value: 1 }, uScale: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime; uniform float uHeight; uniform float uScale;
      varying float vFade;
      void main() {
        vec3 p = position;
        p.y = mod(p.y + uTime * (0.05 + aSeed * 0.08), uHeight);
        p.x += sin(uTime * 0.3 + aSeed * 40.0) * 0.08;
        p.z += cos(uTime * 0.27 + aSeed * 31.0) * 0.08;
        vFade = smoothstep(0.0, 0.6, p.y) * (1.0 - smoothstep(uHeight - 0.6, uHeight, p.y));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (1.2 + aSeed * 2.2) * uScale * (60.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity;
      varying float vFade;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * 0.35 * vFade * uOpacity;
        gl_FragColor = vec4(uColor * a, a);
      }
    `,
  });
}

// ---------------------------------------------------------------------------
// Caustic light pool cast on the floor around a habitat.

export function floorCausticMaterial(color: string, inner: number, outer: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uInner: { value: inner }, uOuter: { value: outer }, uOpacity: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vLocal;
      void main() { vLocal = position; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor; uniform float uInner; uniform float uOuter; uniform float uOpacity;
      varying vec3 vWorld; varying vec3 vLocal;
      ${CAUSTIC_GLSL}
      void main() {
        float r = length(vLocal.xy);
        float fall = smoothstep(uOuter, uInner, r);
        float c = causticPattern(vWorld.xz * 0.22, uTime * 0.35);
        float a = (0.06 + c * 0.55) * fall * fall * uOpacity;
        gl_FragColor = vec4(uColor * a, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

// ---------------------------------------------------------------------------
// Glass: Fresnel reflections of a procedural interior environment.

export function glassMaterial(tint = "#9fd8ff") {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    uniforms: {
      uTint: { value: new THREE.Color(tint) },
      uRim: { value: new THREE.Color("#7cc4ff") },
      uRimStrength: { value: 0 },
      uOpacity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTint; uniform vec3 uRim; uniform float uRimStrength; uniform float uOpacity;
      varying vec3 vN; varying vec3 vWorld;
      void main() {
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 N = normalize(vN);
        float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
        float fres = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
        vec3 R = reflect(-V, N);
        // Procedural interior: dark lower hall, warm lit galleries, cool skylight.
        vec3 env = mix(vec3(0.03, 0.04, 0.06), vec3(0.95, 0.72, 0.45), smoothstep(-0.05, 0.25, R.y) * 0.55);
        env = mix(env, vec3(0.65, 0.8, 1.0), smoothstep(0.6, 0.95, R.y) * 0.6);
        // Vertical window/light-strip reflections.
        float strips = smoothstep(0.92, 1.0, sin(atan(R.z, R.x) * 9.0)) * smoothstep(-0.1, 0.4, R.y);
        env += vec3(1.0, 0.85, 0.65) * strips * 0.9;
        vec3 col = env * fres + uTint * 0.02;
        float alpha = clamp(fres * 0.85 + 0.035 + strips * 0.08, 0.0, 0.9);
        // Status rim (selection / alert) along grazing edges.
        float rim = pow(1.0 - ndv, 2.5) * uRimStrength;
        col += uRim * rim;
        alpha = max(alpha, rim * 0.8);
        gl_FragColor = vec4(col, alpha * uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

// ---------------------------------------------------------------------------
// Marine life: instanced, orbit + undulation computed on the GPU.

export type SwimStyle = 0 | 1 | 2 | 3; // 0 fish, 1 shark, 2 ray, 3 seahorse

export function marineMaterial(water: string, style: SwimStyle) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uMotion: { value: 1 },
      uWater: { value: new THREE.Color(water) },
      uDim: { value: 0 },
      uStyle: { value: style },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aOrbit;   // radius, height, angular speed, phase
      attribute vec4 aWobble;  // vertical amp, vertical freq, radial amp, size
      attribute vec3 aOffset;  // school offset in body frame
      attribute vec3 aColA;
      attribute vec3 aColB;
      attribute float aPattern;
      attribute float aPart;
      uniform float uTime; uniform float uMotion; uniform float uStyle;
      varying vec3 vN; varying vec3 vLocal; varying vec3 vColA; varying vec3 vColB; varying float vPattern; varying float vPart; varying vec3 vWorld; varying float vDepth;
      void main() {
        float t = uTime * uMotion;
        float ang = aOrbit.w + aOrbit.z * t;
        float r = aOrbit.x + aWobble.z * sin(t * 0.21 + aOrbit.w * 3.0);
        float y = aOrbit.y + aWobble.x * sin(t * aWobble.y + aOrbit.w * 5.0);
        vec3 center = vec3(cos(ang) * r, y, sin(ang) * r);
        float dir = aOrbit.z >= 0.0 ? 1.0 : -1.0;
        vec3 fwd = normalize(vec3(-sin(ang), 0.0, cos(ang)) * dir + vec3(0.0, aWobble.x * aWobble.y * cos(t * aWobble.y + aOrbit.w * 5.0) * 0.35, 0.0));
        vec3 side = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
        vec3 up = cross(side, fwd);
        vec3 p = position;
        float size = aWobble.w;
        float speed = abs(aOrbit.z) * max(r, 0.5);
        if (uStyle < 1.5) {
          // Body undulation, strongest at the tail.
          float tail = clamp(-p.x * 1.7 + 0.15, 0.0, 1.0);
          float freq = uStyle > 0.5 ? 3.0 : 7.0 + speed * 6.0;
          p.z += sin(t * freq + p.x * 5.5 + aOrbit.w * 10.0) * (uStyle > 0.5 ? 0.06 : 0.11) * tail * uMotion;
        } else if (uStyle < 2.5) {
          // Ray wing flap travelling from body to tip.
          float span = abs(p.z);
          p.y += sin(t * 1.7 + aOrbit.w * 7.0 - span * 2.2) * 0.22 * pow(span, 1.4) * uMotion;
        } else {
          // Seahorse gentle sway.
          p.x += sin(t * 1.3 + aOrbit.w * 4.0 + p.y * 3.0) * 0.015 * uMotion;
        }
        p *= size;
        vec3 local = center + fwd * (p.x + aOffset.x) + up * (p.y + aOffset.y) + side * (p.z + aOffset.z);
        vec3 n = fwd * normal.x + up * normal.y + side * normal.z;
        vec4 world = modelMatrix * instanceMatrix * vec4(local, 1.0);
        vWorld = world.xyz;
        vN = normalize(mat3(modelMatrix) * n);
        vLocal = position;
        vColA = aColA; vColB = aColB; vPattern = aPattern; vPart = aPart;
        vDepth = local.y;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uWater; uniform float uDim;
      varying vec3 vN; varying vec3 vLocal; varying vec3 vColA; varying vec3 vColB; varying float vPattern; varying float vPart; varying vec3 vWorld; varying float vDepth;
      ${CAUSTIC_GLSL}
      void main() {
        vec3 base = vColA;
        if (vPattern < 0.5) {
          base = mix(vColB, vColA, smoothstep(-0.12, 0.08, vLocal.y));          // countershaded
        } else if (vPattern < 1.5) {
          float band = step(0.72, sin(vLocal.x * 17.0 + 1.2));                 // clownfish bands
          base = mix(vColA, vColB, band);
        } else if (vPattern < 2.5) {
          base = mix(vColA, vColB, step(0.0, vLocal.x - 0.12));               // two-tone tang
        } else if (vPattern < 3.5) {
          float s = step(0.55, sin(vLocal.y * 60.0));                          // stripes
          base = mix(vColA, vColB, s * 0.8);
        } else {
          float sp = step(0.88, sin(vLocal.x * 31.0) * sin(vLocal.z * 27.0));  // spotted ray
          base = mix(vColA, vColB, sp);
        }
        if (vPart > 0.5) base = mix(base, vColB, 0.35) * 0.85;
        vec3 N = normalize(vN);
        vec3 V = normalize(cameraPosition - vWorld);
        if (dot(N, V) < 0.0) N = -N;
        vec3 L = normalize(vec3(0.25, 1.0, 0.35));
        float diff = max(dot(N, L), 0.0);
        float spec = pow(max(dot(reflect(-L, N), V), 0.0), 28.0);
        float caus = causticPattern(vWorld.xz * 0.35, uTime * 0.4) * max(N.y, 0.0);
        vec3 col = base * (0.32 + 0.85 * diff) + vec3(0.9, 0.95, 1.0) * spec * 0.35 + uWater * caus * 0.35;
        // Underwater absorption: distance + depth tint towards the water colour.
        float dist = length(cameraPosition - vWorld);
        float fogK = clamp(dist / 70.0, 0.0, 0.55) + clamp(-vDepth * 0.02, 0.0, 0.15);
        col = mix(col, uWater * 0.55, fogK);
        col = mix(col, col * 0.3 + vec3(0.02, 0.04, 0.07), uDim);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

// ---------------------------------------------------------------------------
// Underwater standard material: caustics + depth tint on rocks, sand and coral.

export interface UnderwaterUniforms {
  uTime: { value: number };
  uWater: { value: THREE.Color };
  uTop: { value: number };
  uDepthRange: { value: number };
  uDim: { value: number };
}

export function underwaterMaterial(opts: THREE.MeshStandardMaterialParameters, water: string, top: number, depthRange: number) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...opts });
  const uniforms: UnderwaterUniforms = {
    uTime: { value: 0 },
    uWater: { value: new THREE.Color(water) },
    uTop: { value: top },
    uDepthRange: { value: depthRange },
    uDim: { value: 0 },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vUWWorld;\nvarying vec3 vUWNormal;")
      .replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>
        vec4 uwWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          uwWorld = instanceMatrix * uwWorld;
        #endif
        uwWorld = modelMatrix * uwWorld;
        vUWWorld = uwWorld.xyz;
        vUWNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uTime; uniform vec3 uWater; uniform float uTop; uniform float uDepthRange; uniform float uDim;
        varying vec3 vUWWorld; varying vec3 vUWNormal;
        ${CAUSTIC_GLSL}`,
      )
      .replace(
        "#include <opaque_fragment>",
        `#include <opaque_fragment>
        float uwDepth = clamp((uTop - vUWWorld.y) / uDepthRange, 0.0, 1.0);
        float uwC = causticPattern(vUWWorld.xz * 0.32, uTime * 0.4) * clamp(vUWNormal.y * 0.8 + 0.4, 0.0, 1.0);
        gl_FragColor.rgb += vec3(0.55, 0.85, 1.0) * uwC * 0.38 * (1.0 - uwDepth * 0.5);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uWater * 0.45, uwDepth * 0.38);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * 0.3 + vec3(0.02, 0.04, 0.07), uDim);`,
      );
  };
  m.customProgramCacheKey = () => "aqualink-underwater";
  return { material: m, uniforms };
}

// ---------------------------------------------------------------------------
// Flow overlay on pipes: travelling pulses along the tube's arc length.

export function flowMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    clipping: true,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color("#2f8cff") },
      uLength: { value: 10 },
      uSpeed: { value: 1 },
      uPhase: { value: 0 },
      uMode: { value: 0 }, // 0 flowing, 1 interrupted (static, pulsing), 2 idle
      uIntensity: { value: 1 },
      uHighlight: { value: 0 },
      // Fault / heal propagation front (distances in metres along the network).
      uWaveOn: { value: 0 },
      uWaveStart: { value: 0 },
      uWaveFront: { value: 0 },
      uWaveAge: { value: 0 },
      uWaveColor: { value: new THREE.Color("#ff3b3b") },
    },
    vertexShader: /* glsl */ `
      #include <clipping_planes_pars_vertex>
      varying vec2 vUv; varying vec3 vN; varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <clipping_planes_pars_fragment>
      uniform float uTime; uniform vec3 uColor; uniform float uLength; uniform float uSpeed; uniform float uPhase;
      uniform float uMode; uniform float uIntensity; uniform float uHighlight;
      uniform float uWaveOn; uniform float uWaveStart; uniform float uWaveFront; uniform float uWaveAge; uniform vec3 uWaveColor;
      varying vec2 vUv; varying vec3 vN; varying vec3 vWorld;
      void main() {
        #include <clipping_planes_fragment>
        vec3 V = normalize(cameraPosition - vWorld);
        float rim = pow(1.0 - abs(dot(normalize(vN), V)), 1.5);
        float s = vUv.x * uLength;
        float a;
        if (uMode < 0.5) {
          float spacing = 1.1;
          float d = fract((s - uTime * uSpeed + uPhase) / spacing);
          float pulse = smoothstep(0.0, 0.08, d) * (1.0 - smoothstep(0.08, 0.42, d));
          a = 0.16 + pulse * 0.85;
        } else if (uMode < 1.5) {
          float dash = step(0.5, fract(s / 0.9));
          a = (0.22 + 0.5 * dash) * (0.65 + 0.35 * sin(uTime * 4.0));
        } else {
          a = 0.0;
        }
        a = (a * (0.45 + 0.55 * rim) + uHighlight * 0.35) * uIntensity;
        vec3 col = uColor * a * 1.6;
        // Propagation front: a bright band travelling outward from the root,
        // leaving a fading wake behind it.
        float g = uWaveStart + s;
        float front = exp(-pow((g - uWaveFront) / 1.6, 2.0));
        float wake = step(g, uWaveFront) * exp(-uWaveAge * 0.6) * 0.55;
        float w = (front * 2.2 + wake) * uWaveOn;
        col += uWaveColor * w * 1.8;
        a = max(a, w);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

// ---------------------------------------------------------------------------
// Visitors: instanced people, lit by warm interior light and aquarium glow.

export function visitorMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMotion: { value: 1 },
      uOpacity: { value: 1 },
      uGlowPos: { value: Array.from({ length: 6 }, () => new THREE.Vector3()) },
      uGlowCol: { value: Array.from({ length: 6 }, () => new THREE.Color()) },
    },
    transparent: false,
    vertexShader: /* glsl */ `
      attribute float aPart;
      attribute vec3 aCloth;
      attribute vec3 aSkin;
      attribute float aPhase;
      attribute vec3 aWalk; // gait phase, moving (0/1), photo pose (0..1)
      uniform float uTime; uniform float uMotion;
      varying vec3 vN; varying vec3 vWorld; varying float vPart; varying vec3 vCloth; varying vec3 vSkin; varying float vH;
      void main() {
        vec3 p = position;
        float swing = sin(aWalk.x) * 0.5 * aWalk.y;
        if (aPart < 0.5) {
          // Legs swing about the hip, alternating sides.
          float side = p.x < 0.0 ? 1.0 : -1.0;
          float h = max(0.0, 0.88 - p.y);
          p.z += sin(swing * side) * h;
          p.y += (1.0 - cos(swing * side)) * h;
        } else if (aPart < 1.5 && abs(p.x) > 0.19 && p.y < 1.45) {
          // Arms swing opposite the legs; the right arm lifts a phone for photos.
          float side = p.x < 0.0 ? -1.0 : 1.0;
          float h = max(0.0, 1.42 - p.y);
          float s = -swing * side * 0.8 + (p.x > 0.0 ? aWalk.z * 1.35 : 0.0);
          p.z += sin(s) * h;
          p.y += (1.0 - cos(s)) * h;
        }
        p.y += abs(sin(aWalk.x)) * 0.035 * aWalk.y;
        // Subtle idle sway while standing.
        float sway = sin(uTime * 0.8 + aPhase * 6.28) * 0.025 * uMotion * smoothstep(0.6, 1.8, p.y) * (1.0 - aWalk.y);
        p.x += sway;
        vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
        vWorld = w.xyz;
        vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        vPart = aPart; vCloth = aCloth; vSkin = aSkin; vH = position.y;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uGlowPos[6]; uniform vec3 uGlowCol[6]; uniform float uOpacity;
      varying vec3 vN; varying vec3 vWorld; varying float vPart; varying vec3 vCloth; varying vec3 vSkin; varying float vH;
      void main() {
        vec3 base = vPart < 0.5 ? vCloth * 0.35 + vec3(0.03) : vPart < 1.5 ? vCloth : vPart < 2.5 ? vSkin : vSkin * 0.25;
        vec3 N = normalize(vN);
        float hemi = 0.5 + 0.5 * N.y;
        vec3 light = mix(vec3(0.10, 0.10, 0.13), vec3(0.62, 0.52, 0.42), hemi);
        for (int i = 0; i < 6; i++) {
          vec3 d = uGlowPos[i] - vWorld;
          float dist = length(d);
          float ndl = max(dot(N, d / dist), 0.0);
          light += uGlowCol[i] * ndl * 7.0 / (1.0 + dist * dist * 0.35);
        }
        vec3 col = base * light;
        gl_FragColor = vec4(col, uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}
