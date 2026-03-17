import { GLTFLoader, OrbitControls } from "three/examples/jsm/Addons.js";
import { DemoHandler } from "./demo-type";
import { RecordableBindingHandler } from "three-mediapipe-rig";
import { Mesh, PerspectiveCamera } from "three";
import { MeshPhysicalNodeMaterial } from "three/webgpu";
import { uv } from "three/tsl";

export const handsDemo: DemoHandler = {
    name: "hands-demo",
    trackerConfig: {
        debugVideo: import.meta.env.BASE_URL + "webcam4.mp4",
        displayScale: 1,
		ignoreFace:true
    },
    setup: (renderer, camera, scene, tracker) => {
        let handsBind: RecordableBindingHandler | undefined;

        //scene.add(tracker.handsTracker!.right.root);

        new GLTFLoader().load(
            import.meta.env.BASE_URL + "hands.glb",
            (gltf) => {
                scene.add(gltf.scene);

                scene.traverse((child) => {
                    if (child instanceof Mesh) {
                        child.frustumCulled = false;
                        child.castShadow = true;
                        child.receiveShadow = true;

                        if (child.material.name == "arms") {
                            child.material = new MeshPhysicalNodeMaterial({
                                color: 0x333,
                                transparent: true,
                                depthTest: false,
                                opacityNode: uv().y.oneMinus(),
                            });
                        }
                    } else if (child instanceof PerspectiveCamera) {
                        camera.position.copy(child.position);
                        camera.quaternion.copy(child.quaternion);
                        camera.fov = child.fov;
                        camera.aspect = child.aspect;
                        camera.near = child.near;
                        camera.far = child.far;
                        camera.updateProjectionMatrix();
                    }
                });

                const rig = scene.getObjectByName("hands-rig")!;
                handsBind = tracker.bind(rig);
            },
        );

        const ctrl = new OrbitControls(camera, renderer.domElement);

        return (delta: number) => {
            handsBind?.update(delta);
        };
    },
};
