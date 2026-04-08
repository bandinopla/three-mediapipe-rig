import {
	AnimationMixer,
    AxesHelper,
    Mesh,
    PerspectiveCamera,
    Scene,
    Timer,
    WebGPURenderer,
} from "three/webgpu";
import { DemoHandler } from "./demo-type";
import { RecordableBindingHandler, TrackerHandler } from "three-mediapipe-rig";
import { GLTFLoader, OrbitControls } from "three/examples/jsm/Addons.js";

export const charactersDemo: DemoHandler = {
    name: "characters-demo",
    trackerConfig: {
        debugVideo: import.meta.env.BASE_URL + "webcam4.mp4",
        displayScale: .5,
    },
    setup: (
        renderer: WebGPURenderer,
        camera: PerspectiveCamera,
        scene: Scene,
        tracker: TrackerHandler,
    ) => {



		document.querySelector("#credits > div:last-child")!.innerHTML = `<div>
				Young Lara by <a href="https://sketchfab.com/3d-models/young-lara-croft-tomb-raider-4-3683b756078947e28c61cb3b06b7c37d">Bandinopla</a>
			</div>
			<div>
				Head Scan by Unknown ( uploaded by <a href="https://sketchfab.com/3d-models/bearded-man-60947a1819a1407685cb4332e894e585">kand8998</a>)
			</div>
			<div>
				Tai Lung (tiger) by <a href="https://sketchfab.com/3d-models/tai-lung-kung-fu-panda-chi-master-048995f379e74ab496415f9d2054f7b8">Guilherme Navarro</a>
			</div>
			<div>
				Woman video ref by <a href="https://grok.com/imagine/">Grok</a>
			</div>`

        let laraBind: RecordableBindingHandler | undefined;
        let headBind: RecordableBindingHandler | undefined;
        let tigerBind: RecordableBindingHandler | undefined;

        scene.add(new AxesHelper(0.1));

        const DEFAULT_CAMERA = {
            position: [
                -0.3832648122004069, 1.0066041624702082, 1.9423869398688414,
            ],
            target: [
                -0.4378161823978737, 1.0129396105225508, -0.19140937902424646,
            ],
            zoom: 1,
        };
        const ctrl = new OrbitControls(camera, renderer.domElement);

        camera.position.fromArray(DEFAULT_CAMERA.position);
        ctrl.target.fromArray(DEFAULT_CAMERA.target);
        camera.zoom = DEFAULT_CAMERA.zoom;
        camera.updateProjectionMatrix();
        ctrl.update();
        ctrl.update();

        //#region recording

        let replayRecording = false;

        replayRecording &&
            new GLTFLoader().load(
                import.meta.env.BASE_URL + "sample.glb",
                (gltf) => {
                    scene.add(gltf.scene);

                    const rig = gltf.scene.getObjectByName("rig")!;

                    new GLTFLoader().load(
                        import.meta.env.BASE_URL + "RecordedClip.glb",
                        (gltf2) => {
                            const mixer = new AnimationMixer(rig);
                            const clip = gltf2.animations[0];

                            const action = mixer.clipAction(clip);

                            action.play();

                            let clock = new Timer();
                            renderer.setAnimationLoop((time: number) => {
                                const delta = clock.update(time).getDelta();
                                mixer.update(delta);
                                renderer.render(scene, camera);
                            });
                        },
                    );
                },
            );

        !replayRecording &&
            new GLTFLoader().load(
                import.meta.env.BASE_URL + "sample.glb",
                (gltf) => {
                    scene.add(gltf.scene);

                    scene.traverse((child) => {
                        if (child instanceof Mesh) {
                            child.frustumCulled = false;
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });

                    const rig = gltf.scene.getObjectByName("rig")!;
                    const handL = rig.getObjectByName("handL")!;
                    const handR = rig.getObjectByName("handR")!;

                    handL.scale.multiplyScalar(0.75);
                    handR.scale.multiplyScalar(0.75);

                    // rig.position.set(.1,0,-.1)
                    // rig.rotateY(Math.PI/2)

                    laraBind = tracker.bind(rig);

                    const headRig = gltf.scene.getObjectByName("head-rig")!;

                    headBind = tracker.bind(headRig);

                    const tigerRig = gltf.scene.getObjectByName("tiger-rig")!;

                    tigerBind = tracker.bind(tigerRig);

                    // the line below starts and stops a recording pressing SPACE key

                    let rec = false;
                    window.addEventListener("keydown", (ev) => {
                        if (ev.code === "Space") {
                            // const settings = {
                            // 	position: camera.position.toArray(),
                            // 	target: ctrl.target.toArray(),
                            // 	zoom: camera.zoom,
                            // }
                            // navigator.clipboard.writeText(JSON.stringify(settings, null, 2))
                            // //tracker.start()
                            if (!rec) {
                                rec = true;
                                laraBind?.startRecording();
                            } else {
                                rec = false;
                                const op = laraBind?.stopRecording();
                                op?.saveToFile();
                            }
                        }
                    });
                },
            );

        //#endregion

        return (delta: number) => {
            laraBind?.update(delta);
            headBind?.update(delta);
            tigerBind?.update(delta);
        };
    },
};
