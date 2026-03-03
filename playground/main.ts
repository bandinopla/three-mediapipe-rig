import * as THREE from "three/webgpu"; 
import { GLTFLoader, OrbitControls } from "three/examples/jsm/Addons.js"; 
import { BindingHandler, RecordableBindingHandler, setupTracker } from "three-mediapipe-rig"; 
import Stats from "three/examples/jsm/libs/stats.module.js";

// — Renderer —
const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.5;
document.body.appendChild(renderer.domElement);
renderer.shadowMap.enabled = true;

// add the gui stats
const stats = new Stats();
document.body.appendChild(stats.dom);

await Promise.all([renderer.init(), setupTracker({ /*debugFrame:import.meta.env.BASE_URL +"videoframe_3974.png",*/ debugVideo: import.meta.env.BASE_URL + "webcam4.mp4", displayScale:1  }) ]).then(
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
 

        // — Lights —
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambient);

        const directional = new THREE.DirectionalLight(0xffffff, 2);
        directional.position.set(5, 10, 7);
		directional.castShadow = true;
		directional.shadow.mapSize.width = 2048;
		directional.shadow.mapSize.height = 2048;
		directional.shadow.camera.near = 0.5;
		directional.shadow.camera.far = 50;
		directional.shadow.camera.left = -10;
		directional.shadow.camera.right = 10;
		directional.shadow.camera.top = 10;
		directional.shadow.camera.bottom = -10;
		directional.shadow.bias = -0.003;
        scene.add(directional);

		scene.add(new THREE.AxesHelper(.1))
		
		const DEFAULT_CAMERA = {
		  "position": [
		    -0.3832648122004069,
		    1.0066041624702082,
		    1.9423869398688414
		  ],
		  "target": [
		    -0.4378161823978737,
		    1.0129396105225508,
		    -0.19140937902424646
		  ],
		  "zoom": 1
		}
		const ctrl = new OrbitControls(camera, renderer.domElement)
		 
		camera.position.fromArray(DEFAULT_CAMERA.position)
		ctrl.target.fromArray(DEFAULT_CAMERA.target)
		camera.zoom = DEFAULT_CAMERA.zoom
		camera.updateProjectionMatrix()
		ctrl.update()
		ctrl.update() 

		let laraBind:RecordableBindingHandler|undefined;
		let headBind:RecordableBindingHandler|undefined;
		let tigerBind:RecordableBindingHandler|undefined;

		//const leftHandMarks = tracker.handsTracker.right.root
		//scene.add( leftHandMarks)
 

        // — Handle resize —
        window.addEventListener("resize", () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }); 

		let replayRecording = false

		replayRecording && new GLTFLoader().load(import.meta.env.BASE_URL +"sample.glb", (gltf)=>{
			scene.add(gltf.scene);

			const rig = gltf.scene.getObjectByName("rig")!; 

			new GLTFLoader().load(import.meta.env.BASE_URL +"RecordedClip.glb", (gltf2)=>{

				const mixer = new THREE.AnimationMixer(rig);
				const clip = gltf2.animations[0];
				 
				const action = mixer.clipAction(clip);  

				action.play(); 

				let clock = new THREE.Timer() 
				renderer.setAnimationLoop((time:number) => { 
					const delta = clock.update(time).getDelta(); 
					mixer.update(delta); 
					renderer.render(scene, camera);
				});

			});
			
		});

		!replayRecording && new GLTFLoader().load(import.meta.env.BASE_URL +"sample.glb", (gltf) => {
			scene.add(gltf.scene);

			scene.traverse((child) => {
				if (child instanceof THREE.Mesh) {
					child.frustumCulled = false;
					child.castShadow = true;
					child.receiveShadow = true;
				} 
			})

			const rig = gltf.scene.getObjectByName("rig")!;
			const handL = rig.getObjectByName("handL")!;
			const handR = rig.getObjectByName("handR")!;

			handL.scale.multiplyScalar(0.75)
			handR.scale.multiplyScalar(0.75)

			// rig.position.set(.1,0,-.1)
			// rig.rotateY(Math.PI/2)
			
			laraBind = tracker.bind( rig ) ;  

			const headRig = gltf.scene.getObjectByName("head-rig")!; 
			
			headBind = tracker.bind( headRig ) ;  

			const tigerRig = gltf.scene.getObjectByName("tiger-rig")!; 
 
			
			tigerBind = tracker.bind( tigerRig ) ;  

			// the line below starts and stops a recording pressing SPACE key

			let rec = false;
			window.addEventListener("keydown", ev=>{ 
				if( ev.code === "Space" ){
					// const settings = {
					// 	position: camera.position.toArray(),
					// 	target: ctrl.target.toArray(),
					// 	zoom: camera.zoom,
					// }
					// navigator.clipboard.writeText(JSON.stringify(settings, null, 2))
					// //tracker.start()
					if(!rec) {
						rec = true;
						laraBind?.startRecording()
					}
					else {
						rec = false;
						const op = laraBind?.stopRecording()
						op?.saveToFile()
					}
				}
			}) 
			
		})	 
 


		let clock = new THREE.Timer() 

		renderer.setAnimationLoop((time:number) => { 
			 
			const delta = clock.update(time).getDelta(); 

			laraBind?.update(delta) 
			headBind?.update(delta) 
			tigerBind?.update(delta) 
			renderer.render(scene, camera);
			stats.update();
		})

		//-----------
		const sourceBtn = document.createElement("button"); 
		sourceBtn.onclick = () => {
			window.open("https://github.com/bandinopla/three-mediapipe-rig/blob/main/playground/main.ts","_blank");
		};
		sourceBtn.classList.add("source-btn");
		sourceBtn.textContent = "</>";
		document.body.appendChild(sourceBtn);
    },
);
