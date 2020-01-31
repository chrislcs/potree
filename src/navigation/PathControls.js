/**
 * @author chrislcs / Geodan
 *
 * adopted from Potree.FirstPersonControls by
 *
 * @author mschuetz / http://mschuetz.at
 *
 * adapted from THREE.OrbitControls by
 *
 * @author qiao / https://github.com/qiao
 * @author mrdoob / http://mrdoob.com
 * @author alteredq / http://alteredqualia.com/
 * @author WestLangley / http://github.com/WestLangley
 * @author erich666 / http://erichaines.com
 *
 *
 *
 */

import { MOUSE } from '../defines.js';
import { EventDispatcher } from '../EventDispatcher.js';

export class PathControls extends EventDispatcher {
  constructor(viewer) {
    super();

    this.viewer = viewer;
    this.renderer = viewer.renderer;

    this.scene = null;
    this.sceneControls = new THREE.Scene();

    this.position = 0;
    this.path = null;

    this.rotationSpeed = 200;
    this.moveSpeed = 10;
    this.loop = true;
    this.userInputCancels = true;
    this.lockViewToPath = 'never'; // options: 'never', 'moving', 'always'
    this.lockPosition = false;

    this.viewTarget = null;

    this.keys = {
      FORWARD: ['W'.charCodeAt(0), 38],
      BACKWARD: ['S'.charCodeAt(0), 40]
    };

    this.fadeFactor = 50;
    this.yawDelta = 0;
    this.pitchDelta = 0;
    this.translationDelta = new THREE.Vector3(0, 0, 0);

    this.tweens = [];

    let drag = e => {
      if (e.drag.object !== null) {
        return;
      }

      if (e.drag.startHandled === undefined) {
        e.drag.startHandled = true;

        this.dispatchEvent({ type: 'start' });
      }

      let moveSpeed = this.viewer.getMoveSpeed();

      let ndrag = {
        x: e.drag.lastDrag.x / this.renderer.domElement.clientWidth,
        y: e.drag.lastDrag.y / this.renderer.domElement.clientHeight
      };

      if (e.drag.mouse === MOUSE.LEFT) {
        this.yawDelta += ndrag.x * this.rotationSpeed;
        this.pitchDelta += ndrag.y * this.rotationSpeed;
      } else if (e.drag.mouse === MOUSE.RIGHT) {
        this.translationDelta.x -= ndrag.x * moveSpeed * 100;
        this.translationDelta.z += ndrag.y * moveSpeed * 100;
      }
    };

    let drop = e => {
      this.dispatchEvent({ type: 'end' });
    };

    let scroll = e => {
      let speed = this.viewer.getMoveSpeed();

      if (e.delta < 0) {
        speed = speed * 0.9;
      } else if (e.delta > 0) {
        speed = speed / 0.9;
      }

      speed = Math.max(speed, 0.1);

      this.viewer.setMoveSpeed(speed);
    };

    this.addEventListener('drag', drag);
    this.addEventListener('drop', drop);
    this.addEventListener('mousewheel', scroll);
  }

  setScene(scene) {
    this.scene = scene;
  }

  setPath(path) {
    this.path = path;
    this.pathLength = path.getLength();
  }

  stop() {
    this.yawDelta = 0;
    this.pitchDelta = 0;
    this.translationDelta.set(0, 0, 0);
  }

  lockViewTo(target) {
    this.viewTarget = target;
    this.lockViewToPath = 'never';
  }

  unlockView() {
    this.viewTarget = null;
    this.lockViewToPath = 'never';
  }

  moveTo(position, animationDuration, callback) {
    const value = { x: this.position };

    const tween = new TWEEN.Tween(value).to({ x: position }, animationDuration);
    tween.easing(TWEEN.Easing.Cubic.Out);

    this.tweens.push(tween);

    tween.onUpdate(() => {
      this.position = value.x;
      const point = this.path.getPointAt(this.position);
      this.scene.view.position.set(point.x, point.y, point.z);
    });

    tween.onComplete(() => {
      this.tweens = this.tweens.filter(e => e !== tween);
      if (callback) {
        callback();
      }
    });

    tween.start();
  }

  update(delta) {
    let view = this.scene.view;

    if (this.userInputCancels) {
      // cancel move animations on user input
      let changes = [this.yawDelta, this.pitchDelta, this.translationDelta.length()];
      let changeHappens = changes.some(e => Math.abs(e) > 0.001);
      if (changeHappens && this.tweens.length > 0) {
        this.tweens.forEach(e => e.stop());
        this.tweens = [];
      }
    }

    {
      // accelerate while input is given
      let ih = this.viewer.inputHandler;

      let moveForward = this.keys.FORWARD.some(e => ih.pressedKeys[e]);
      let moveBackward = this.keys.BACKWARD.some(e => ih.pressedKeys[e]);

      if (this.userInputCancels) {
        // cancel move animations on user input
        if (moveForward || moveBackward) {
          this.tweens.forEach(e => e.stop());
          this.tweens = [];
        }
      }

      if (moveForward && moveBackward) {
        this.translationDelta.y = 0;
      } else if (moveForward) {
        this.translationDelta.y = this.viewer.getMoveSpeed();
      } else if (moveBackward) {
        this.translationDelta.y = -this.viewer.getMoveSpeed();
      }

      if (!this.lockPosition && this.lockViewToPath === 'always') {
        const dotLookDirMoveDir = view.direction.dot(this.path.getTangentAt(this.position));
        const scale = 0.08 + Math.abs(dotLookDirMoveDir - 1) / 10;
        view.direction = view.direction.add(
          this.path.getTangentAt(this.position).multiplyScalar(scale)
        );
      } else if (!this.lockPosition && this.lockViewToPath === 'moving' && (moveForward || moveBackward)) {
        const dotLookDirMoveDir = view.direction.dot(this.path.getTangentAt(this.position));
        const scale = 0.02 + Math.abs(dotLookDirMoveDir - 1) / 10;
        view.direction = view.direction.add(
          this.path.getTangentAt(this.position).multiplyScalar(scale)
        );
      } else if (this.viewTarget !== null) {
        view.lookAt(this.viewTarget);
      } else {
        // apply rotation
        let yaw = view.yaw;
        let pitch = view.pitch;

        yaw -= this.yawDelta * delta;
        pitch -= this.pitchDelta * delta;

        view.yaw = yaw;
        view.pitch = pitch;
      }
    }

    {
      if (!this.lockPosition && this.path !== null) {
        const deltaPosition = (this.translationDelta.y * delta) / this.pathLength;
        this.position += deltaPosition;

        // Handle out of bounds
        if (this.position < 0) {
          if (this.loop) {
            this.position = 1 + this.position;
          } else {
            this.position = 0;
          }
        } else if (this.position > 1) {
          if (this.loop) {
            this.position = this.position - 1;
          } else {
            this.position = 1;
          }
        }

        const point = this.path.getPointAt(this.position);
        view.position.set(point.x, point.y, point.z);
      }
    }

    {
      // set view target according to speed
      view.radius = 3 * this.viewer.getMoveSpeed();
    }

    {
      // decelerate over time
      let attenuation = Math.max(0, 1 - this.fadeFactor * delta);
      this.yawDelta *= attenuation;
      this.pitchDelta *= attenuation;
      this.translationDelta.multiplyScalar(attenuation);
    }
  }
}
