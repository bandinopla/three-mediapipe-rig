import {
	OrbitControls,
	RoomEnvironment,
} from "three/examples/jsm/Addons.js";
import { DemoHandler } from "../demo-type";
import { PlayerUI } from "./lib/PlayerUI";
import {
	AxesHelper,
    Box3,
    Color,
    DirectionalLight,
    GridHelper,
    Material,
    Mesh,
    Object3D,
    PMREMGenerator,
    SkinnedMesh,
    Texture,
    Vector3,
} from "three/webgpu";
import { ClipRange } from "./lib/ClipRangeUI";
import { EditorContext, EditorState, IState, VideoClip } from "./editor-types";
import { RecordingState } from "./state/RecordingState";
import { IdleState } from "./state/IdleState";
import { PickFileState } from "./state/PickFileState";
import { ReplayState } from "./state/ReplayState";
import { DownloadState } from "./state/DownloadState";
import { Inspector } from "three/examples/jsm/inspector/Inspector.js";
import { Overlay } from "./lib/Overlay";

 


/**
 * 0.0.1 - first release!
 */
const POSECAP_EDITOR_VERSION = "0.0.1";

/**
 * The default video source to use when no video source is provided.
 */
const DEFAULT_VIDEO_SOURCE = import.meta.env.BASE_URL + "legs.mp4";


const script = document.createElement("script"); script.src = "https://cdn.tailwindcss.com";
document.head.appendChild(script);  


export const poseClipEditor: DemoHandler = {
    name: "pose-clip-editor",
    trackerConfig: {
        debugVideo: DEFAULT_VIDEO_SOURCE,
        displayScale: 1, 

		/**
		 * In my experience testing this, it is better to ignore the face when doing full body tracking because the face is too small anyway to get
		 * any significant details.
		 */
		ignoreFace: true
    },
    setup: (renderer, camera, scene, tracker) => {

		tracker.pause()

		document.querySelector("#credits > div:last-child")!.innerHTML = `
	PoseCap by <a href="https://x.com/bandinopla">bandinopla</a>`; 

		let overlay = new Overlay();

		let inspector = new Inspector();  
	    renderer.inspector = inspector;
	    inspector.init();

		const controls = new OrbitControls(camera, renderer.domElement);
		controls.dampingFactor = 0.2;
		controls.enableDamping = true;
		

        let updater: ((delta: number) => void) | undefined;
		let disposeOld:(()=>void) | undefined;
		let currentRig:Object3D|undefined;

		const ctx:EditorContext = {
			tracker,
			enterState(state) {

				console.log("enter state: ", state);
				if( currentState?.exit() === false ) return;
				currentState = states[state];
				 
				currentState.enter();

			},
			setActiveRig,
			getActiveRig:()=>currentRig,
			FPS: 12,
			countdown: 0,
			overlay
		}
 
		const states : Record<EditorState, IState> = {
			
			[EditorState.Idle]: new IdleState(ctx), 
			[EditorState.Recording]: new RecordingState(ctx), 
			[EditorState.PickFile]: new PickFileState(ctx), 
			[EditorState.Replay]: new ReplayState(ctx),
			[EditorState.Download]: new DownloadState(ctx), 

		}  

		// side menu panel actions...

		const actions = {
			inputWebcam: ()=>{
				overlay.show("Requesting webcam...");
				tracker.setVideoFromWebcam( false ).catch(err=>{ 

					alert("Failed to access camera. Please allow camera access and try again. Err: "+err); 
					
				})
				.finally(()=>{
					overlay.hide();
				})
			},
			inputFile:()=>{
				const input = document.createElement("input");
				input.type = "file";
				input.accept = "video/*";
				input.onchange = (e: Event) => {
					const file = input.files?.[0];
					if (!file) return; 
					tracker.setVideoFromSource(file); 
				}
				input.click();
			},
			inputDefault:()=>{
				tracker.setVideoFromSource(DEFAULT_VIDEO_SOURCE)
			},
			loadModel:()=> currentState?.pickFile(),
			downloadModel:()=> currentState?.download?.(),
			readme:()=>{
				window.open("https://github.com/bandinopla/three-mediapipe-rig/blob/main/POSECAP.md", "_blank");
			},
			reportBug:()=>{
				window.open("https://github.com/bandinopla/three-mediapipe-rig/issues", "_blank");
				
			}
		}

		let currentState = states[EditorState.Idle];   
		
		const mainPanel = inspector.createParameters(`Welcome to PoseCap v.${POSECAP_EDITOR_VERSION}`);
		mainPanel.add(actions, "readme").name("README.md");
		mainPanel.add(actions, "reportBug").name("Report Bug");

		const recordingSource = inspector.createParameters("Video source");

		recordingSource.add( actions, "inputWebcam" ).name("Webcam");
		recordingSource.add( actions, "inputFile" ).name("Video File");
		recordingSource.add( actions, "inputDefault" ).name("Default");

		const recordingSettings = inspector.createParameters("Recording settings");
 
		const fps = recordingSettings.add(ctx, "FPS", 1, 60, 1).name("FPS") ; 
		recordingSettings.add(ctx, "countdown", 0, 10, 1).name("Countdown");

		recordingSettings.add({ ignoreLegs:false },"ignoreLegs").name("Ignore legs").onChange( v=>{
			tracker.poseTracker.ignoreLegs = v;
		})
		const modelSettings = inspector.createParameters("Model settings");

		modelSettings.add(actions,"loadModel").name("Load model (.glb)");
		modelSettings.add(actions,"downloadModel").name("Download model (.glb)");
		
  
		scene.background = new Color("#444444")
		scene.add(new GridHelper(10,30, 0x333333, 0x555555))

		const axis = new AxesHelper(.5);
		axis.position.y = 0.001
		scene.add(axis)
		camera.position.set(.3,1,2)
		camera.lookAt(0,0,0)

		const cameraPosition = camera.position.clone();
		let sun!:DirectionalLight;

		scene.traverse((child)=>{
			if(child instanceof DirectionalLight){
				sun = child;
			}
		});

		//tracker.pause()

		sun.intensity*=3
		sun.shadow.mapSize.width = 2048;
		sun.shadow.mapSize.height = 2048;
		sun.shadow.camera.near = 0.5;
		sun.shadow.camera.far = 30;
		const sunMargin = 7;
		sun.shadow.camera.left = -sunMargin;
		sun.shadow.camera.right = sunMargin;
		sun.shadow.camera.top = sunMargin;
		sun.shadow.camera.bottom = -sunMargin;
		sun.shadow.bias = -0.0003;

		//----- add room enviornment
		const pmremGenerator = new PMREMGenerator(renderer);
		const env = pmremGenerator.fromScene(new RoomEnvironment()).texture;

		scene.environment = env; 
		scene.environmentIntensity = 0.3;
		pmremGenerator.dispose();

		// this is the player UI ( play,stop, record )
        const player = new PlayerUI<VideoClip>({
          onPlayChange: (isPlaying) => currentState?.play(isPlaying),
          onRecordChange: (isRecording) => currentState?.record(isRecording),
          onItemSelect: (item) => currentState?.selectClip(item), 
		  onItemDelete: (item) => currentState?.deleteClip?.(item) , 
		  onRename: (item) => currentState?.renameClip?.(item),
        });

		ctx.player = player;

        // 2. Use the chainable API to set up initial state
        player.mount(); // Mounts to document.body by default


		const cr = new ClipRange(4)
		cr.mount(document.body)
		cr.hide();
		ctx.clipper = cr
		

		/**
		 * We are going to work with this rig now. Calling this should basically reset the entire app to use this rig.
		 * @param rig 
		 */
		function setActiveRig( rig:Object3D ) {

			// reset... 
			disposeOld?.();

			// add rig at the center

			rig.position.set(0,0,0)
			rig.rotation.set(0,0,0)
			rig.scale.set(1,1,1)
			scene.add(rig);

			disposeOld = () => {
			  scene.remove(rig);

			  rig.traverse((obj: Object3D) => {
			    const mesh = obj as Mesh | SkinnedMesh;

			    if ((mesh as Mesh).isMesh || (mesh as SkinnedMesh).isSkinnedMesh) {
			      if (mesh.geometry) mesh.geometry.dispose();

			      const material = mesh.material as Material | Material[];

			      if (material) {
			        const materials = Array.isArray(material) ? material : [material];

			        materials.forEach((mat) => {
			          Object.values(mat).forEach((value) => {
			            if ((value as Texture)?.isTexture) {
			              (value as Texture).dispose();
			            }
			          });
			          mat.dispose();
			        });
			      }
			    }

			    if ((obj as SkinnedMesh).isSkinnedMesh) {
			      const skinned = obj as SkinnedMesh;
			      skinned.skeleton?.dispose();
			    }
			  });

			  disposeOld = undefined;
			};

			// --- adjust camera so the rig is in frame

			const box = new Box3().setFromObject(rig);
			const size = box.getSize(new Vector3());
			const center = box.getCenter(new Vector3());

			const maxDim = Math.max(size.x, size.y, size.z);
			const fov = camera.fov * (Math.PI / 180);
			const distance = maxDim / (2 * Math.tan(fov / 2));

			camera.position.copy(center);
			camera.position.z += distance *  1.5; // padding 

			camera.lookAt(center);

			camera.near = distance / 100;
			camera.far = distance * 100;
			camera.updateProjectionMatrix();

			controls.update();

			//---- bind rig to tracker 
			const poseBind = tracker.bind(rig);
 

			ctx.bind = poseBind; 
			currentRig = rig;
		}
 

        return (delta) => {
			controls.update();
			currentState?.update?.(delta)
 
		};;
    },
};
 


