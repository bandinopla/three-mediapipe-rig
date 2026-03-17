import { GLTFLoader, OrbitControls } from "three/examples/jsm/Addons.js";
import type { DemoHandler } from "./demo-type";
import { Mesh } from "three";
import {
    AmbientLight,
    Color,
    MaterialNode,
    MeshPhysicalNodeMaterial,
    PointLight,
    Node,
    TextureLoader,
    SRGBColorSpace,
} from "three/webgpu";
import { Inspector } from "three/examples/jsm/inspector/Inspector.js";
import { mix, texture, uniform } from "three/tsl";

export const faceUVDemo: DemoHandler = {
    name: "face-uv-demo",
    trackerConfig: {
        debugVideo: import.meta.env.BASE_URL + "face.mp4",
        displayScale: 1,
		onlyFace:true,
		drawLandmarksOverlay:false
    },
    setup: (renderer, camera, scene, tracker) => {
        const face = "mediapipe-canonical-face.glb";

        const controls = new OrbitControls(camera, renderer.domElement);
        camera.position.set(0, 0, 3);
        camera.fov = 22.5;
        camera.updateProjectionMatrix();
        controls.update();

        const debugLight = new PointLight(0xff0000, 3, 10);
        debugLight.position.set(0, 0, 0);
        debugLight.castShadow = true;

        scene.add(debugLight);

        scene.background = new Color(0x333333);

        let inspector = new Inspector();
        renderer.inspector = inspector;

        inspector.init();

        const lightSettings = inspector.createParameters("Light");
        const al = new AmbientLight(0xffffff, 0);
        scene.add(al);
        lightSettings.add(al, "intensity", 0, 1, 0.01).name("Ambient");

        let renderFace: ((delta: number) => void) | undefined;

        document.querySelector("#credits > div:last-child")!.innerHTML = `
	Woman video ref by <a href="https://grok.com/imagine">Grok</a>`; 
        //
        // load the model
        //
        new GLTFLoader().load(face, (gltf) => {
            scene.add(gltf.scene);

            //
            // select the canonical face mesh
            // see: https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model.fbx
            //
            const mesh = scene.getObjectByName("face_model_with_iris") as Mesh;

            //
            // this "binds" the geometry to be in sync with the face mesh provided by mediapipe.
            //
            const face = tracker.faceTracker!.bindGeometry(
                mesh,
                (posNode, colorNode) => {
                    //
                    // here we are using the callback to create the material ourselves because
                    // we want to use the uv texture
                    //

                    const uvFactor = uniform(0);

                    const uvTexture = new TextureLoader().load(
                        "canonical_face_model_uv_visualization.png",
                        (texture) => {
                            texture.colorSpace = SRGBColorSpace;
                            texture.flipY = false;
                            texture.generateMipmaps = false;
                            texture.needsUpdate = true;
                        },
                    );

                    mesh.material = new MeshPhysicalNodeMaterial({
                        positionNode: posNode,
                        colorNode: mix(
                            colorNode as Node<"vec4">,
                            texture(uvTexture),
                            uvFactor,
                        ),
                    });

                    shapes.add(uvFactor, "value", 0, 1, 0.01).name("UV Factor");
                },
            );

            mesh.castShadow = true;
            mesh.receiveShadow = true;

            const shapes = inspector.createParameters("Face");
            let vals = { ...mesh.morphTargetDictionary };

            Object.entries(mesh.morphTargetDictionary!).forEach(
                ([key, value]) => {
                    vals[key] = 0;
                    shapes
                        .add(vals, key, 0, 0.1, 0.001)
                        .name(key)
                        .onChange((v) => {
                            mesh.morphTargetInfluences![value] = v;
                        });
                },
            );

            renderFace = (delta: number) => {
                //
                // keep the vertices in sync so it animates
                //
                face.update(delta);
            };
        });

        return (delta: number) => {
            //
            // Make a light spin just for show...
            //
            debugLight.position.x = Math.sin(Date.now() * 0.01) * 1;
            debugLight.position.y = Math.cos(Date.now() * 0.01) * 1;

            //
            // Update the face
            //
            renderFace?.(delta);
        };
    },
};
