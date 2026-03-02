
![cover](cover.jpg)

# three-mediapipe-rig

Integrate [Google MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/guide)'s **webcam motion tracking** with [Three.js](https://threejs.org/) skeletal rigs. Load a GLTF/GLB character, bind it, and drive its body, hands, and face from a webcam or video — in just a few lines of code.

Use your webcam ( or a video ) to drive a skeleton.

This will run 3 models: face, body, hands. So expect a FPS drop.

LIVE EXAMPLE: https://bandinopla.github.io/three-mediapipe-rig/

## Features

- **Full-body pose tracking** — shoulders, arms, hips, legs, and head
- **Hand tracking** — individual finger bones for both hands
- **Face tracking** — blendshape/morph target support for facial expressions and eye movement
- **Automatic bone binding** — maps MediaPipe landmarks to your rig's skeleton using a configurable bone-name map
- **Webcam & video input** — use a live webcam feed or a pre-recorded video for motion capture
- **Debug tools** — preview the video/image feed overlaid with landmark visualizations

## Installation
```
npm install three-mediapipe-rig
```

> **Peer dependency:** [three](https://www.npmjs.com/package/three) `^0.182.0` and [mediapipe](https://www.npmjs.com/package/@mediapipe/tasks-vision) `^0.10.32` must be installed in your project.

## Quick Start

```ts
// 1. Create your renderer
const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// 2. Initialize the tracker (loads MediaPipe models)
await setupTracker({ ...config... })
 
const rig = scene.getObjectByName("rig")!;

// 3. Bind the rig to the tracker
const binding = tracker.bind(rig);
 

// 4. Start the webcam ( must be initialized by a user triggered event like a click )
tracker.start();

// 5. Update in your render loop
const clock = new THREE.Timer();
renderer.setAnimationLoop((time: number) => {
  const delta = clock.update(time).getDelta();

  // 6. update the skeleton...
  binding?.update(delta);

  renderer.render(scene, camera);
});
```

### Skeleton
You can use the skeleton provided in `rig.blend` or use your own and provide a bone name mapping so we know where the bones are in the second argument for the `.bind` method. But pay attention to the bone role of the provided skeleton, as it is the one expected by this module.

### Facial Animation
Media Pipe provides blend shape keys for the face ( estimated from the webcam ). The face it is expected to be a separated mesh, just the face, with blend shape keys named as the ones provided by Media Pipe. See [Blend Shape Keys reference](/face-blendshapekeys.md) You don't have to have all of them, if they are not found, they will be ignored.


## API

### `setupTracker(config?)`

Initializes MediaPipe vision models and returns a tracker API object. This is an **async** function that downloads and loads the ML models.

```ts
const tracker = await setupTracker({
  ignoreLegs: true,
  displayScale: 0.2,
});
```

#### `TrackerConfig` options

| Option | Type | Default | Description |
|---|---|---|---|
| `ignoreLegs` | `boolean` | `false` | Skip leg tracking (useful for seated / upper-body-only characters) |
| `ignoreFace` | `boolean` | `false` | Skip face tracking entirely |
| `displayScale` | `number` | `1` | Scale of the debug video/canvas overlay |
| `debugVideo` | `string` | `undefined` | Path to a video file to use instead of the webcam |
| `debugFrame` | `string` | `undefined` | Path to a static image for single-frame debugging |
| `handsTrackerOptions` | `HandLandmarkerOptions` | `undefined` | Override [MediaPipe hand landmarker options](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js#configuration_options) |
| `modelPaths` | `object` | *(CDN URLs)* | Custom URLs for the MediaPipe WASM & model files (see below) |

#### `modelPaths`

By default, models are loaded from Google's CDN. Override individual paths if you want to self-host the assets:

```ts
await setupTracker({
  modelPaths: {
    vision: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm",
    pose: "/models/pose_landmarker_lite.task",
    hand: "/models/hand_landmarker.task",
    face: "/models/face_landmarker.task",
  },
});
```

---

### Tracker API (return value of `setupTracker`)

The object returned by `setupTracker` exposes the following:

#### `tracker.start()` → `Promise<{ stop(): void }>`

Starts the webcam feed and begins real-time tracking. Returns a handle to stop the camera.

```ts
const camera = await tracker.start();

// Later, to stop:
camera.stop();
```

> Handles permission errors, missing cameras, and reconnection automatically with exponential backoff.

#### `tracker.bind(rig, boneMap?)` → `BindingHandler`

Binds a Three.js skeleton rig to the tracker. This is where the magic happens — it maps MediaPipe landmarks to your character's bones for **body**, **hands**, and **face** simultaneously.

```ts
const rig = gltf.scene.getObjectByName("rig")!;
const binding = tracker.bind(rig);
```

- **`rig`** — The root `Object3D` of your skeleton (the armature). It must contain child bones matching the expected naming convention.
- **`boneMap`** *(optional)* — A custom `BoneMap` object if your rig uses different bone names (see [Bone Naming](#bone-naming) below).

#### `BindingHandler.update(delta)`

Call this every frame in your render loop to apply the tracked motion to the bound rig. The `delta` parameter (in seconds) controls the interpolation smoothness.

```ts
renderer.setAnimationLoop((time) => {
  const delta = clock.update(time).getDelta();
  binding.update(delta);
  renderer.render(scene, camera);
});
```

#### `tracker.poseTracker` / `tracker.handsTracker` / `tracker.faceTracker`

Direct access to the individual sub-trackers if you need lower-level control. Each has a `.root` property (a `THREE.Object3D`) you can add to your scene for debugging landmark positions.

```ts
// Visualize the hand tracking landmarks in the 3D scene
scene.add(tracker.handsTracker.left.root);
```

---

## Bone Naming

The library uses a **default bone map** that expects specific bone names in your rig. If your model uses different names, pass a custom `BoneMap` to `tracker.bind()`.

> Check the skeleton at `rig.blend` for the expected bone names or append that rig to your project and use that as your skeleton.

### Default bone names

| Region | Bones |
|---|---|
| **Body** | `hips`, `torso`, `neck`, `head` |
| **Arms** | `upper_armL`, `forearmL`, `upper_armR`, `forearmR` |
| **Legs** | `thighL`, `shinL`, `footL`, `thighR`, `shinR`, `footR` |
| **Hands** | `handL`, `handR` |
| **Fingers (L/R)** | `index1L`–`index3L`, `middle1L`–`middle3L`, `ring1L`–`ring3L`, `pinky1L`–`pinky3L`, `thumb1L`–`thumb3L` *(same pattern for R)* |
| **Face** | Mesh named `face` (for blendshapes) |

### Custom bone map example

```ts
import type { BoneMap } from "three-mediapipe-rig";

// this tells the module what is the name of the expected bone.
const myBoneMap: BoneMap = {
  faceMesh: "Head_Mesh",
  head: "Head",
  hips: "Hips",
  neck: "Neck",
  torso: "Spine1",
  armL: "LeftArm",
  forearmL: "LeftForeArm",
  armR: "RightArm",
  forearmR: "RightForeArm",
  thighL: "LeftUpLeg",
  shinL: "LeftLeg",
  footL: "LeftFoot",
  thighR: "RightUpLeg",
  shinR: "RightLeg",
  footR: "RightFoot",
  handL: "LeftHand",
  handR: "RightHand",
  // ... finger bones ...
  index1L: "LeftHandIndex1",
  index2L: "LeftHandIndex2",
  index3L: "LeftHandIndex3",
  // (continue for all fingers)
};

const binding = tracker.bind(rig, myBoneMap);
```

---

## Multiple Characters

You can bind **multiple rigs** to the same tracker. All of them will mirror the tracked motion:

```ts
const laraBinding = tracker.bind(laraRig);
const robotBinding = tracker.bind(robotRig);

renderer.setAnimationLoop((time) => {
  const delta = clock.update(time).getDelta();
  laraBinding.update(delta);
  robotBinding.update(delta);
  renderer.render(scene, camera);
});
```

---

## Debugging with Video

During development, use a pre-recorded video instead of a live webcam:

```ts
const tracker = await setupTracker({
  debugVideo: "test-video.mp4",
  displayScale: 0.2, // small overlay in the corner
});
```

Or test against a single frame:

```ts
const tracker = await setupTracker({
  debugFrame: "pose-reference.jpg",
  displayScale: 0.5,
});
```

--- 

## License

MIT
