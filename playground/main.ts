import * as THREE from "three/webgpu"; 
import { setupTracker } from "three-mediapipe-rig"; 
import Stats from "three/examples/jsm/libs/stats.module.js";
import { handsDemo } from "./hands-demo";
import { DemoHandler, StandaloneDemoHandler } from "./demo-type";
import { faceUVDemo } from "./face-uv-demo";
import { charactersDemo } from "./characters-demo";
import { loadMeshcapFiles } from "./load-meshcap-files";
import { gameYoutubers } from "./game-youtubers";

// — Renderer —
const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.5;
document.body.appendChild(renderer.domElement);
renderer.shadowMap.enabled = true;

// add the gui stats
const stats = new Stats();
//document.body.appendChild(stats.dom);

const $querystring = new URLSearchParams( location.search);
const demoName = $querystring.get("demo");
let demo:DemoHandler|StandaloneDemoHandler = charactersDemo;

if( $querystring.get("editor")=="meshcap")
{
	demo = (await import("./face-clip-editor")).faceClipEditor;
}
else 
{
	[handsDemo, faceUVDemo, charactersDemo, loadMeshcapFiles, gameYoutubers].forEach( d =>{
		if( demoName==d.name )
		{
			demo = d;
		}
	}) 
}

await Promise.all([renderer.init(), "trackerConfig" in demo ? setupTracker(demo.trackerConfig) : Promise.resolve(null) ]).then(
    ([renderer, tracker]) => {
        // — Scene —
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x333333); 

        // — Camera —
        const camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.1,
            100,
        );
        camera.position.set(-.1, 1, 1);
        camera.lookAt(0, 1.5, 0);  

		// — Handle resize —
        window.addEventListener("resize", () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }); 

		//-----------
		const sourceBtn = document.createElement("button"); 
		sourceBtn.onclick = () => {
			window.open(`https://github.com/bandinopla/three-mediapipe-rig/blob/main/playground/${demo.name}.ts`,"_blank");
		};
		sourceBtn.classList.add("source-btn");
		sourceBtn.textContent = "</>";
		document.body.appendChild(sourceBtn);
 

        // — Lights —
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambient);

        const directional = new THREE.DirectionalLight(0xffffff, 2);
        directional.position.set(17, 10, 17);
		directional.castShadow = true;
		directional.shadow.mapSize.width = 2048/2;
		directional.shadow.mapSize.height = 2048/2;
		directional.shadow.camera.near = 0.5;
		directional.shadow.camera.far = 110;
		directional.shadow.camera.left = -10;
		directional.shadow.camera.right = 10;
		directional.shadow.camera.top = 10;
		directional.shadow.camera.bottom = -10;
		directional.shadow.bias = -0.001;
        scene.add(directional);

		// @ts-ignore
		const demoHandler = demo.setup(renderer, camera, scene, tracker);

		let clock = new THREE.Timer() 

		renderer.setAnimationLoop((time:number) => { 
			 
			const delta = clock.update(time).getDelta();  
			
			demoHandler?.(delta);
			renderer.render(scene, camera);
			//stats.update();
		})  
		
    },
);
