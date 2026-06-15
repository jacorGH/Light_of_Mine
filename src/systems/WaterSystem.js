import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { events } from '../engine/EventBus.js';

/**
 * WaterSystem — Adds an ocean/water plane around the island using Three.js Water shader.
 * 
 * Features:
 * - Large reflective ocean plane at Y=0 (sea level)
 * - Animated waves via normal map
 * - Responds to day/night (sun direction updates)
 * - Player can't walk below water level (future: swimming)
 */
export class WaterSystem {
  constructor(engine) {
    this.engine = engine;
    this.scene = engine.scene;
    this.water = null;

    this.createOcean();
  }

  createOcean() {
    // Large water plane surrounding the island
    const waterGeometry = new THREE.PlaneGeometry(800, 800);

    this.water = new Water(waterGeometry, {
      textureWidth: 256,
      textureHeight: 256,
      waterNormals: new THREE.TextureLoader().load(
        'https://threejs.org/examples/textures/waternormals.jpg',
        (texture) => {
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        }
      ),
      sunDirection: new THREE.Vector3(-0.5, 0.8, -0.3).normalize(),
      sunColor: 0xffffff,
      waterColor: 0x001e33,
      distortionScale: 3.7,
      fog: this.scene.fog !== undefined,
    });

    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = -1.5; // Sea level slightly below terrain
    this.water.name = '__ocean';

    this.scene.add(this.water);

    // Listen for time changes to update sun direction
    events.on('world:time_changed', (data) => {
      this.updateSunDirection(data.timeOfDay);
    });
  }

  updateSunDirection(timeOfDay) {
    if (!this.water) return;
    const angle = timeOfDay * Math.PI * 2;
    const sunDir = new THREE.Vector3(
      Math.cos(angle),
      Math.sin(angle) * 0.8 + 0.2,
      -0.3
    ).normalize();
    this.water.material.uniforms['sunDirection'].value.copy(sunDir);
  }

  update(delta) {
    if (this.water) {
      this.water.material.uniforms['time'].value += delta * 0.5;
    }
  }
}
