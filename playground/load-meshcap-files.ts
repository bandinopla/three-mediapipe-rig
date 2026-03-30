import { loadMeshCapFile, MeshCapMaterialHandler } from "three-mediapipe-rig/meshcap"
import { StandaloneDemoHandler } from "./demo-type"
import { ACESFilmicToneMapping, AudioLoader, LinearToneMapping, Mesh, ReinhardToneMapping, SRGBColorSpace, TextureLoader } from "three";
import { GLTFLoader, OrbitControls } from "three/examples/jsm/Addons.js";

/**
 * Demo showing how to load and play a meshcap file.
 */
export const loadMeshcapFiles: StandaloneDemoHandler = {
	name: "load-meshcap-files",
	setup: (renderer, camera, scene) => {
		console.log("OK SETUP MESHCAP LOAD...")

		const mcapLoader = loadMeshCapFile("meshcap-test-files/test.mcap");
		const atlas = new TextureLoader().loadAsync("meshcap-test-files/test.png");
		const audioAtlas = new AudioLoader().loadAsync("meshcap-test-files/test.mp3");
		const faceMesh = new GLTFLoader().loadAsync("mediapipe-canonical-face.glb");

		let handler:MeshCapMaterialHandler|undefined;

		renderer.toneMapping = LinearToneMapping;
		renderer.toneMappingExposure = 1.5;

		Promise.all([mcapLoader, atlas, audioAtlas, faceMesh]).then(([mcap, atlas, audioAtlas, faceMesh]) => {
			 
			camera.position.set(0,0,18)
			camera.fov = 20;
			camera.updateProjectionMatrix();
			new OrbitControls(camera, renderer.domElement);
			scene.add(faceMesh.scene);

			const face = faceMesh.scene.children[0] as Mesh;
			
			console.log( mcap )
			atlas.flipY = false;
			atlas.colorSpace = SRGBColorSpace;
 
			handler = mcap.createMaterialHandlerOnMesh(face, atlas, undefined, audioAtlas);


			const ctx = new AudioContext();
			const source = ctx.createBufferSource();
			source.buffer = audioAtlas;
			source.connect(ctx.destination);

			const clip = mcap.clips[0]; 
 
			handler.gotoAndLoop(0);

		})

		return delta => {
			handler?.update(delta);
		}
	}
}

function playSprite(ctx: AudioContext, buffer: AudioBuffer, start: number, duration: number) {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0, start, duration);
    return source; // keep ref if you need to stop it early
}