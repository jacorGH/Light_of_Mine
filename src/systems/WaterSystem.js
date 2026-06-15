import * as THREE from 'three';
import { events } from '../engine/EventBus.js';

/**
 * WaterSystem — Ocean surrounding the island with animated shader.
 * 
 * Uses a custom simple water material that doesn't require external textures.
 * Provides reflective, animated ocean feel with vertex displacement for waves.
 */
export class WaterSystem {
  constructor(engine) {
    this.engine = engine;
    this.scene = engine.scene;
    this.waterMesh = null;
    this.time = 0;

    this.createOcean();
  }

  createOcean() {
    // Large ocean plane — 600x600 units, subdivided for wave vertices
    const geometry = new THREE.PlaneGeometry(600, 600, 80, 80);
    geometry.rotateX(-Math.PI / 2);

    // Custom shader material for ocean
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor1: { value: new THREE.Color('#003355') },
        uColor2: { value: new THREE.Color('#006688') },
        uFoamColor: { value: new THREE.Color('#88ccff') },
        uSunDirection: { value: new THREE.Vector3(-0.5, 0.8, -0.3).normalize() },
        uOpacity: { value: 0.85 },
        fogColor: { value: this.scene.fog ? this.scene.fog.color : new THREE.Color('#87ceeb') },
        fogNear: { value: this.scene.fog ? this.scene.fog.near : 80 },
        fogFar: { value: this.scene.fog ? this.scene.fog.far : 250 },
      },
      vertexShader: `
        uniform float uTime;
        varying vec3 vWorldPos;
        varying float vWaveHeight;
        varying vec3 vNormal;

        void main() {
          vec3 pos = position;

          // Multi-layered wave displacement
          float wave1 = sin(pos.x * 0.04 + uTime * 0.8) * cos(pos.z * 0.03 + uTime * 0.6) * 0.8;
          float wave2 = sin(pos.x * 0.08 + uTime * 1.2 + 1.0) * cos(pos.z * 0.06 + uTime * 0.9) * 0.4;
          float wave3 = sin(pos.x * 0.15 + uTime * 2.0 + 2.5) * cos(pos.z * 0.12 + uTime * 1.5) * 0.15;

          pos.y += wave1 + wave2 + wave3;
          vWaveHeight = wave1 + wave2 + wave3;

          // Compute approximate normal from neighboring wave heights
          float dx = cos(pos.x * 0.04 + uTime * 0.8) * 0.04 * 0.8 + cos(pos.x * 0.08 + uTime * 1.2 + 1.0) * 0.08 * 0.4;
          float dz = cos(pos.z * 0.03 + uTime * 0.6) * 0.03 * 0.8 + cos(pos.z * 0.06 + uTime * 0.9) * 0.06 * 0.4;
          vNormal = normalize(vec3(-dx, 1.0, -dz));

          vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform vec3 uFoamColor;
        uniform vec3 uSunDirection;
        uniform float uOpacity;
        uniform float uTime;
        uniform vec3 fogColor;
        uniform float fogNear;
        uniform float fogFar;

        varying vec3 vWorldPos;
        varying float vWaveHeight;
        varying vec3 vNormal;

        void main() {
          // Base color varies with wave height
          vec3 color = mix(uColor1, uColor2, vWaveHeight * 0.5 + 0.5);

          // Foam on wave peaks
          float foam = smoothstep(0.6, 1.0, vWaveHeight);
          color = mix(color, uFoamColor, foam * 0.3);

          // Simple specular highlight from sun
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          vec3 halfDir = normalize(uSunDirection + viewDir);
          float spec = pow(max(dot(vNormal, halfDir), 0.0), 64.0);
          color += vec3(1.0, 0.95, 0.8) * spec * 0.6;

          // Fresnel-like effect (edges more opaque/reflective)
          float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 3.0);
          float alpha = mix(uOpacity * 0.7, uOpacity, fresnel);

          // Distance fog
          float depth = gl_FragCoord.z / gl_FragCoord.w;
          float fogFactor = smoothstep(fogNear, fogFar, depth);
          color = mix(color, fogColor, fogFactor);

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.waterMesh = new THREE.Mesh(geometry, material);
    this.waterMesh.position.y = -1.5; // Sea level
    this.waterMesh.name = '__ocean';
    this.waterMesh.renderOrder = -1; // Render before opaque objects

    this.scene.add(this.waterMesh);

    // Listen for time/fog changes
    events.on('world:time_changed', (data) => {
      this.updateFromTime(data.timeOfDay);
    });
  }

  updateFromTime(timeOfDay) {
    if (!this.waterMesh) return;
    const uniforms = this.waterMesh.material.uniforms;

    // Shift water colors based on time of day
    const hour = timeOfDay * 24;
    if (hour >= 6 && hour < 18) {
      // Day: blue ocean
      uniforms.uColor1.value.set('#003355');
      uniforms.uColor2.value.set('#006688');
    } else if (hour >= 18 && hour < 20) {
      // Dusk: orange tint
      uniforms.uColor1.value.set('#1a2233');
      uniforms.uColor2.value.set('#334455');
    } else {
      // Night: dark ocean
      uniforms.uColor1.value.set('#0a0a1a');
      uniforms.uColor2.value.set('#111133');
    }

    // Update fog colors from scene
    if (this.scene.fog) {
      uniforms.fogColor.value.copy(this.scene.fog.color);
      uniforms.fogNear.value = this.scene.fog.near;
      uniforms.fogFar.value = this.scene.fog.far;
    }
  }

  update(delta) {
    if (!this.waterMesh) return;
    this.time += delta;
    this.waterMesh.material.uniforms.uTime.value = this.time;

    // Keep water centered on player (infinite ocean illusion)
    const px = this.engine.camera.position.x;
    const pz = this.engine.camera.position.z;
    this.waterMesh.position.x = Math.round(px / 50) * 50;
    this.waterMesh.position.z = Math.round(pz / 50) * 50;
  }
}
