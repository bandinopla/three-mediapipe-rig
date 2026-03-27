import { DemoHandler } from "./demo-type";
import { Inspector } from "three/examples/jsm/inspector/Inspector.js";
import { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { Mesh } from "three";
import {
	ACESFilmicToneMapping,
    AmbientLight,
    BackSide,
    CanvasTexture,
    Color,
    LinearToneMapping,
    MeshBasicMaterial,
    MeshBasicNodeMaterial,
    MeshPhysicalNodeMaterial,
    Node,
    NodeMaterial,
    PlaneGeometry,
    ReinhardToneMapping,
    SphereGeometry,
    SRGBColorSpace,
} from "three/webgpu";
import { GLTFLoader, OrbitControls } from "three/examples/jsm/Addons.js";
import {
    add,
    floor,
    mix,
    mod,
    mul,
    sin,
    time,
    uniform,
    uv,
    vec2,
    vec4,
} from "three/tsl";
import styles from "./face-clip-editor.module.css";
import {
    buildMeshCapAtlas,
    loadMeshCapFile,
    MeshCapAtlas,
    RecordedClip,
	createMeshCapMaterial,
    MeshCapMaterialHandler,
} from "three-mediapipe-rig/meshcap";  

const EDITOR_VERSION = "0.0.1";

const txt = {
    start_recording: "⦿ Start recording",
    stop_recording: "■ Stop",
    replay: "↺ Replay",
    stopReplay: "■ Stop",
    renameClip: "✎ Rename",
    deleteClip: "🗑 Delete",
    capture_fps: "Capture FPS",
    capture_scale: "Capture Scale",
    atlas_size: "Atlas Size",
    frame_padding: "Frame Padding (px)",
    clip: "Clip",
    btnMetadata: "Metadata ( .mcap )",
    btnAtlasTexture: "Image Atlas ( .png )",
    btnCloseAtlasTexture: "✕ Close Atlas View",
    panelTitleExport: "Save",
    panelTitleInspect: "View / Preview",
    panelTitleRecording: "Recording",
    panelTitleSelectedClip: "Current Clip",
    panelTitleTextureAtlas: "Texture Atlas",
    panelTitleMainMenu: `Welcome to MeshCap ( v${EDITOR_VERSION} )`,
    btnOpen: "Open ( .mcap + Image Atlas )",
    btnHowToUse: "Instructions",
    panelTitleScene: "Scene",
	panelTitleVideoSource:"Video source",
	sourceFromVideoFile:"From video file",
	sourceFromWebcam:"From webcam",
	sourceDefaultWomanFace:"Default face",
	btnCopyClips:"Copy clips dictionary",
	btnDownloadCanonicalFaceMesh:"Canonical face mesh (.glb)",
};

type AppState = {
    enter?(): void;
    exit?: () => void;
    update?: (delta: number) => void;

    onClickRecord?: () => void;
    onClickReplay?: () => void;
    onClickRename?: () => void;
    onClickDelete?: () => void;
    onClickInspectAtlas?: () => void;

	domElement?: HTMLDivElement;
};

const DEFAULT_VIDEO_SOURCE = import.meta.env.BASE_URL + "face4.mp4";
const CANONICAL_FACE_URL = import.meta.env.BASE_URL + "mediapipe-canonical-face.glb";

export const faceClipEditor: DemoHandler = {
    name: "face-clip-editor",
    trackerConfig: {
        onlyFace: true,
        debugVideo: DEFAULT_VIDEO_SOURCE,
        //drawLandmarksOverlay: false,
        displayScale: 0.6,
    },
    setup: (renderer, camera, scene, tracker) => {
        let editor: ReturnType<DemoHandler["setup"]> | undefined;

        camera.far = 2000;
        camera.updateProjectionMatrix();

        scene.add(new CoolBackground());
		renderer.toneMapping = LinearToneMapping

		document.querySelector("#credits > div:last-child")!.innerHTML = `
	MeshCap by <a href="https://x.com/bandinopla">bandinopla</a>`; 

        //
        // load the canonical mesh
        //
        new GLTFLoader().load(CANONICAL_FACE_URL, (gltf) => {
            scene.add(gltf.scene);
            editor = startEditor(renderer, camera, scene, tracker);
        });

        return (delta) => {
            editor?.(delta);
        };
    },
};

/**
 * Just a checkerboard background
 */
class CoolBackground extends Mesh {
    constructor() {
        // TSL checker material

        // Uniforms
        const speed = uniform(0.001);
        const scale = uniform(110.0);
        const colorA = uniform(new Color("#2e2e2e"));
        const colorB = uniform(new Color("#292929"));

        // TSL node graph
        // animated UV offset
        const t = mul(time, speed);
        const animatedUV = add(uv(), vec2(t.mul(2), t));

        // checker pattern: floor(u*scale) + floor(v*scale), check parity
        const scaled = mul(animatedUV, scale);
        const fx = mod(floor(scaled.x), 2.0);
        const fy = mod(floor(scaled.y), 2.0);
        const checker = mod(add(fx, fy), 2.0); // 0 or 1

        // animated color mix — pulse with sine
        const pulse = add(
            mul(sin(add(mul(time, 2.0), mul(checker, 3.14))), 0.5),
            0.5,
        );
        const color = mix(colorA, colorB, checker);
        const finalColor = color;

        super(
            new SphereGeometry(1000, 32, 32),
            new MeshBasicNodeMaterial({
                colorNode: vec4(finalColor, 1.0),
                side: BackSide,
            }),
        );
    }
}


/**
 * The editor here uses the Inspector as GUI. 
 * 
 * Each button in the Inspector calls an action in the `actions` object that, in turns, call a function or
 * a method in the current state object. 
 * 
 * States are stored in the `states` object. 
 * Each key is the id of the state and the value is the state object.
 * 
 */
const startEditor: DemoHandler["setup"] = (
    renderer,
    camera,
    scene,
    tracker,
) => {
    let faceMesh: Mesh | undefined;
    let atlasView: Mesh | undefined;
    let liveMaterial: MeshPhysicalNodeMaterial | undefined;
    let replayMaterial: MeshCapMaterialHandler | undefined;
    let syncLiveMaterial: ((delta: number) => void) | undefined;
    let update: ((delta: number) => void) | undefined;

    let inspector = new Inspector();  
    renderer.inspector = inspector;
    inspector.init();

	

    let metadataInspector: HTMLDivElement | undefined;

    const mainMenu = inspector.createParameters(txt.panelTitleMainMenu);
	const sourceMenu = inspector.createParameters(txt.panelTitleVideoSource);
    const sceneSettings = inspector.createParameters(txt.panelTitleScene);
	 
    const mainactions = inspector.createParameters(txt.panelTitleTextureAtlas);
    const captureSettings = inspector.createParameters(txt.panelTitleRecording);
    const selectedClipActions = inspector.createParameters(
        txt.panelTitleSelectedClip,
    );
    const inspectSettings = inspector.createParameters(txt.panelTitleInspect);
    const exportSettings = inspector.createParameters(txt.panelTitleExport);

    const settings = {
        currentClipIndex: -1,
        fps: 12,
        scale: 0.5,
        atlasSize: 2048,
        padding: 1,
        ambientLight: new AmbientLight(0xffffff, 0.1),
    };

    scene.add(settings.ambientLight);

    /**
     * If a change was made that would require to repack all clips into an atlas...
     */
    const repackClips = () => {
        if (lastPackedRev != rev) {
            createClipsAtlas();
            lastPackedRev = rev;
        }
    };

	const showVideoPreview = ( yes:boolean )=>{
		tracker.domElement.style.display = yes ? "block" : "none";
	}

	/**
	 * Menu button's actions
	 */
    const actions = {
        startRecording: () => currentState?.onClickRecord?.(), 
        replayClip: () => currentState?.onClickReplay?.(), 
        renameClip: () => currentState?.onClickRename?.(), 
        deleteClip: () => currentState?.onClickDelete?.(), 
        export: () => {}, 
        inspectMetadata: () => openMetadataInspector(), 
        inspectAtlas: () => currentState?.onClickInspectAtlas?.(),  
        exportAtlasTexture,
        exportMetadata,
        open,
        howToUse: openTutorialModal,
		sourceFromWebcam,
		sourceFromVideoFile, 
		sourceDefaultWomanFace,
		copyClipsDictionary,
		downloadCanonicalFaceMesh
    };

	/**
	 * The current state of the editor
	 */
    let currentState: AppState | undefined;

	/**
	 * The way to enter a new state
	 * @param state 
	 */
    const enter = (state: AppState) => {
        currentState?.exit?.();
        currentState = state;
        currentState.enter?.();
    };

	/**
	 * The base state with common functionality
	 */
    const baseState: AppState = {
        onClickRecord: () => enter(states.recordingState),
        onClickReplay: () => {
            if (settings.currentClipIndex == -1) {
                alert(
                    "Nothing to replay. Try creating a new recording first...",
                );
                return;
            }

            enter(states.replayState);
        },

        onClickRename: () => {
            if (settings.currentClipIndex == -1) {
                alert("No clip selected");
                return;
            }

            // prompt for new name
            const newName = prompt(
                "Enter new name for clip:",
                clips[settings.currentClipIndex].name,
            );
            if (newName) {
                clips[settings.currentClipIndex].name = newName;
                updateClipsCombo(settings.currentClipIndex);
                rebuildMetaInspector();
            }
        },
        onClickDelete: () => enter(states.deleteClipState),
        onClickInspectAtlas: () => {
            repackClips();
            if (clips.length == 0) {
                alert("The atlas is currently empty");
                return;
            }
            enter(states.inspectAtlasState);
        },
    };

	/**
	 * All the states of the editor
	 */
    const states: Record<string, AppState> = {
        initialState: {
            ...baseState,

            enter: () => {
                btnCapture.name(txt.start_recording);
                btnReplay.name(txt.replay);
                faceMesh!.material = liveMaterial!;
                update = syncLiveMaterial;
            },
        },

        recordingState: {
            ...baseState,
            enter: () => {
                recording = true;
                btnCapture.name(txt.stop_recording);
				document.body.classList.add( styles.recordingState);

                recordedClip = {
                    fps: settings.fps,
                    name: "clip_" + Date.now(),
                    landmarks: [],
                    frames: [],
                    scale: settings.scale,
                    aspectRatio:
                        tracker.video!.videoWidth / tracker.video!.videoHeight,
                };

                capturedFrames = 0;
                totalCaptureTime = 0;

                settings.currentClipIndex = clips.length;
                clips.push(recordedClip!);

                updateClipsCombo(settings.currentClipIndex);

                faceMesh!.material = liveMaterial!;
                update = syncLiveMaterial;
            },

            exit: () => {
				document.body.classList.remove( styles.recordingState);
                recording = false;
                rev++;
                repackClips();
            },

            onClickRecord: () => enter(states.initialState),
        },

        replayState: {
            ...baseState,
            enter() {
                btnReplay.name(txt.stopReplay);

                replayMaterial!.goto(settings.currentClipIndex);

                faceMesh!.material = replayMaterial!.material;
                update = replayMaterial!.update;
				showVideoPreview(false);

				document.body.classList.add( styles.replayingState);

            },
			exit () {
				showVideoPreview(true);
				document.body.classList.remove( styles.replayingState);
			},

            onClickReplay: () => enter(states.initialState),
        },

        deleteClipState: {
            enter: () => {
                if (settings.currentClipIndex == -1) {
                    alert("No clip selected");
                    enter(states.initialState);
                    return;
                }

                //confirm
                const clipName = clips[settings.currentClipIndex].name;
                if (
                    !confirm(
                        "Are you sure you want to delete clip: " +
                            clipName +
                            "?",
                    )
                )
                    return;

                clips.splice(settings.currentClipIndex, 1);
                settings.currentClipIndex = -1;
                rev++;
                updateClipsCombo(-1);
                repackClips();

                enter(states.initialState);
            },
        },

        inspectAtlasState: {
            ...baseState,
            enter: () => {
                faceMesh!.visible = false;
                btnInspectAtlas.name(txt.btnCloseAtlasTexture);

                repackClips();

                if (!atlasView) {
                    atlasView = new Mesh(
                        new PlaneGeometry(5, 5),
                        new MeshBasicMaterial(),
                    );

                    scene.add(atlasView);
                }

                const atlasTexture = new CanvasTexture(currentAtlas!.canvas);
                atlasTexture.colorSpace = SRGBColorSpace;
                atlasTexture.flipY = true;
                atlasTexture.generateMipmaps = false;
                atlasTexture.needsUpdate = true;

                const aspectRatio =
                    currentAtlas!.canvas.width / currentAtlas!.canvas.height;

                //@ts-ignore
                atlasView.material.map = atlasTexture;
                //@ts-ignore
                atlasView.material.needsUpdate = true;

                atlasView.scale.set(1, 1 / aspectRatio, 1);
                atlasView.visible = true;

                atlasView.userData.dispose = () => {
                    atlasTexture.dispose();
                    (atlasView!.material as MeshBasicMaterial).dispose();
                };

				showVideoPreview(false);
            },
            exit: () => {
                btnInspectAtlas.name(txt.btnAtlasTexture);
                faceMesh!.visible = true;
                atlasView!.visible = false;
                atlasView!.userData.dispose?.();
				showVideoPreview(true);
            },

            onClickInspectAtlas: () => enter(states.initialState),
        },
    };

    const comboOptions = { "--- new clip ---": -1 };
    const currentClipName = selectedClipActions
        .add(settings, "currentClipIndex", comboOptions)
        .name("Clip")
        .onChange((v) => {
            const clip = clips[v];
            if (clip) {
                fps.setValue(clip.fps);
                scale.setValue(clip.scale);
            }
        });

    /**
     * @see https://github.com/mrdoob/three.js/blob/f01bb0837278e4fe0f20f579e350a87114cc2f63/examples/jsm/inspector/ui/Values.js#L294
     */
    function updateClipsCombo(selectIndex = -1) {
        //@ts-ignore
        currentClipName.select.options.length = 0;

        let options: Record<string, number> = {
            ...comboOptions,
        };

        clips.forEach((clip, index) => { 

            options[clip.name] = index;
 
        });

        Object.entries(options).forEach(([key, value]) => {
            const optionEl = document.createElement("option");
            optionEl.value = key;
            optionEl.textContent = key;
            //@ts-ignore
            currentClipName.select.appendChild(optionEl);
            if (selectIndex == value) {
                optionEl.selected = true;
            }
        });

        //@ts-ignore
        currentClipName.options = options;
    }

    const fps = captureSettings.add(settings, "fps", 1, 60, 1).name("FPS").onChange( (v)=>{
		captureInterval = 1 / v;
	});

    const scale = captureSettings
        .add(settings, "scale", 0.1, 1, 0.01)
        .name("Frame Scale");
    const atlasSizeSelector = mainactions
        .add(settings, "atlasSize", [512, 1024, 2048, 4096, 8192])
        .name("Width");
    const paddingSelector = mainactions
        .add(settings, "padding", 0, 10, 1)
        .name("Padding");
    const ambientLightIntensity = sceneSettings
        .add(settings.ambientLight, "intensity", 0, 2, 0.01)
        .name("Ambient Light Intensity");

    let recordedClip: RecordedClip | undefined;
    let currentAtlas: MeshCapAtlas | undefined;
    let clips: RecordedClip[] = [];

	/**
	 * I'm using rev (revision) to track changes in the clips.
	 * When rev changes, I update the atlas.
	 */
    let rev = 0;

	/**
	 * last packed rev ( if lastPackedRev == rev, we don't need to update the atlas)
	 */
    let lastPackedRev = -1;

	/**
	 * if we are recording frames from the video or not.
	 */
    let recording = false;

	/**
	 * This is used to capture at the desired FPS
	 */
    let timeSinceLastCapture = 0;
    let totalCaptureTime = 0;
    let capturedFrames = 0;
    let captureInterval = 1 / settings.fps;

    mainMenu.add(actions, "open").name(txt.btnOpen);
    mainMenu.add(actions, "howToUse").name(txt.btnHowToUse);

	sourceMenu.add(actions, "sourceFromWebcam").name(txt.sourceFromWebcam);
	sourceMenu.add(actions, "sourceFromVideoFile").name(txt.sourceFromVideoFile);
	sourceMenu.add(actions, "sourceDefaultWomanFace").name(txt.sourceDefaultWomanFace);

    const btnCapture = selectedClipActions
        .add(actions, "startRecording")
        .name(txt.start_recording); 

		// @ts-ignore
		btnCapture.domElement.classList.add(styles.btnCapture);

    const btnReplay = selectedClipActions
        .add(actions, "replayClip")
        .name(txt.replay);

    selectedClipActions.add(actions, "renameClip").name(txt.renameClip);
    selectedClipActions.add(actions, "deleteClip").name(txt.deleteClip);

    exportSettings.add(actions, "exportMetadata").name(txt.btnMetadata);
    exportSettings.add(actions, "exportAtlasTexture").name(txt.btnAtlasTexture);
	exportSettings.add(actions, "copyClipsDictionary").name(txt.btnCopyClips);
	exportSettings.add(actions, "downloadCanonicalFaceMesh").name(txt.btnDownloadCanonicalFaceMesh);

    inspectSettings.add(actions, "inspectMetadata").name(txt.btnMetadata);
    const btnInspectAtlas = inspectSettings
        .add(actions, "inspectAtlas")
        .name(txt.btnAtlasTexture);

    function open() {
        const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "avif"];

        /**
         * We must open 2 files, the .mcap and the atlas texture.
         */
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
        input.accept =
            ".mcap," + IMAGE_EXTENSIONS.map((e) => "image/" + e).join(",");
        input.onchange = (e: Event) => {
            const files = input.files;
            if (files?.length != 2) {
                alert(
                    "Please select 2 files, the .mcap and the atlas texture.",
                );
                return;
            }
            const getExt = (f: File) => f.name.split(".").pop()!.toLowerCase();
            let mcapFile: File | undefined;
            let atlasFile: File | undefined;

            for (const file of files) {
                if (getExt(file) === "mcap") {
                    mcapFile = file;
                } else if (IMAGE_EXTENSIONS.includes(getExt(file))) {
                    atlasFile = file;
                }
            }

            if (!mcapFile || !atlasFile) {
                alert(
                    "Please select 2 files, the .mcap and the atlas texture.",
                );
                return;
            }

            const loadMcap = loadMeshCapFile(mcapFile);

            const loadAtlas = new Promise<HTMLCanvasElement>(
                (resolve, reject) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement("canvas");
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext("2d")!;
                        ctx.drawImage(img, 0, 0);
                        resolve(canvas);
                    };
                    img.src = URL.createObjectURL(atlasFile);
                },
            );

            Promise.all([loadMcap, loadAtlas]).then((results) => {
                const [mcap, atlasCanvas] = results;

                mcap.unpackClips(atlasCanvas).then((unpackedClips) => {
                    //...
                    currentState?.exit?.();
                    clips = unpackedClips;
                    rev++;
                    repackClips();
                    updateClipsCombo();
                    enter(states.initialState);

                    //@ts-ignore
                    atlasSizeSelector.select.value = mcap.atlasSize;

                    paddingSelector.setValue(mcap.atlasPadding);
 
                });
            });
        };
        input.click();
    }

    function openTutorialModal() {
		const modal = new Overlay()
		const container = modal.container;
		const body = document.createElement("div");
		body.classList.add(styles.tutorialModalBody);
		container.appendChild(body);

		body.innerHTML = `
			<h2>Instructions</h2>
			<p>This editor allows you to create and edit facial animations powered by <a href="https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker">Google's MediaPipe facial tracking</a> using a pre recorded video OR a live feed from your webcam. </p> 
			<p>
				The outputs from this editor are 2 files, a binary .mcap file and an image atlas size. The .mcap file contains metadata related to each frame of the recorded clip. And the image atlas stores all the frames of each clip.
			</p>
			<p>The workflow is as follows:</p>
			<ol>
				<li>You use either a pre-recordedvideo or your webcam to capture facial expressions</li>
				<li>Google MediaPipe will scan the video looking for known landmarks of the face</li>
				<li>The landmarks are used to deform the vertices of a canonical face mesh</li>
				<li>The video is cropped around the face and an atlas texture is created with all the recorded frames</li>
				<li>You record many clips, each clip is a sequence of frames</li>
				<li>Each clip will save the landmarks and the frames</li>
				<li>You save the clips as a .mcap file and a texture atlas image ( 2 files )</li>
				<li>You can then use these clips to animate the face in a game or project without needing a video anymore. </li>
			</ol>
			<p><br/>Read the <a href="https://github.com/bandinopla/three-mediapipe-rig/blob/main/MESHCAP.md">MeshCap documentation</a></p>
			<p><br/>Click anywhere to close...</p>
		`;
		modal.container.onclick = () => {
			modal.remove();
		}
	}

	function downloadCanonicalFaceMesh() {
		window.open(CANONICAL_FACE_URL,"_blank")
	}

	function sourceFromVideoFile() {
		// let user select a video file
		console.log("PICK VIDEO")
		const input = document.createElement("input");
		input.type = "file";
		input.accept = "video/*";
		input.onchange = (e: Event) => {
			const file = input.files?.[0];
			if (!file) return;
			console.log( "VIDEO", file )
			tracker.setVideoFromSource(file);
			
		}
		input.click();
	}

	function sourceFromWebcam() {
		const overlay = new Overlay();
		overlay.setStatus("Requesting camera access...");
		tracker.setVideoFromWebcam().catch(err=>{
			console.error(err);

			overlay.setStatus("Failed to access camera. Please allow camera access and try again.");
			alert(err);

			
		})
		
		.finally(()=>{
			overlay.remove();
		});
	}

	function sourceDefaultWomanFace() {
		tracker.setVideoFromSource(DEFAULT_VIDEO_SOURCE);
	}

	/**
	 * When recording, this function is called every frame to capture the face landmarks + the video pixels of the face region
	 * @param delta 
	 * @returns 
	 */
    function captureFrame(delta: number) {
        totalCaptureTime += delta;

        // totalCaptureTime is seconds, SHow it as 00:00
        const minutes = Math.floor(totalCaptureTime / 60);
        const seconds = Math.floor(totalCaptureTime % 60);

        btnCapture.name(
            "(" +
                txt.stop_recording +
                ") -- " +
                minutes.toString().padStart(2, "0") +
                ":" +
                seconds.toString().padStart(2, "0") +
                " F " +
                capturedFrames,
        );

        //
        // record a frame respecting the desired FPS
        //
        timeSinceLastCapture += delta;
        if (timeSinceLastCapture < captureInterval) return;
        timeSinceLastCapture = 0;

        const frameLandmarks = tracker.faceTracker!.lastKnownLandmarks;
        if (frameLandmarks?.length) {
            capturedFrames++;
            recordedClip!.landmarks.push(frameLandmarks);

            const crop = cropFaceFromLandmarks(
                tracker.video!,
                frameLandmarks,
                recordedClip!.scale,
                0.1,
            );
            recordedClip!.frames.push(crop);
        }
    }

	/**
	 * This creates the texture atlas from the recorded clips.
	 */
    async function createClipsAtlas() {
        currentAtlas = buildMeshCapAtlas(
            clips,
            settings.atlasSize,
            settings.padding,
        );

        const atlasTexture = new CanvasTexture(currentAtlas.canvas);
        atlasTexture.flipY = false;
        atlasTexture.colorSpace = SRGBColorSpace;

        if (replayMaterial) {
            replayMaterial.dispose();
        }

        replayMaterial = createMeshCapMaterial(
            atlasTexture,
            currentAtlas.clips,
            faceMesh!
        ); 
   

        rebuildMetaInspector();
    }

	/**
	 * This creates the modal that shows the clips that will be used to generate the texture atlas.
	 */
    function rebuildMetaInspector() {
        // ---- build metadata inspector
        if (metadataInspector) metadataInspector.remove();

        metadataInspector = document.createElement("div");
        metadataInspector.classList.add(styles.inspector);
        metadataInspector.textContent =
            "These are the clips that will be used to generate the face texture atlas.";
        //document.body.appendChild(metadataInspector);

        const closeBtn = document.createElement("button");
        closeBtn.textContent = "Close";
        closeBtn.classList.add(styles.closeBtn);
        closeBtn.onclick = () => {
            metadataInspector!.remove();
        };
        metadataInspector!.appendChild(closeBtn);

        clips.forEach((clip, index) => {
            const clipDiv = document.createElement("div");

            clipDiv.classList.add(styles.clip);

            const duration = (clip.frames.length + 1) / clip.fps;
            const minutes = Math.floor(duration / 60);
            const seconds = Math.floor(duration % 60);

            clipDiv.innerHTML = `clip: <strong>${clip.name}</strong> - ( total frames:<strong>${clip.frames.length}</strong> | Duration:<strong>${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}</strong> | FPS:<strong>${clip.fps}</strong> | scale:<strong>${clip.scale}</strong> )`;
            metadataInspector!.appendChild(clipDiv);

            // add to clipDiv button to rename and delete
            const renameBtn = document.createElement("button");
            renameBtn.textContent = "Rename";
            renameBtn.onclick = () => {
                currentState?.onClickRename?.();
                openMetadataInspector();
            };
            clipDiv.appendChild(renameBtn);

            const deleteBtn = document.createElement("button");
            deleteBtn.textContent = "Delete";
            deleteBtn.onclick = () => {
                currentState?.onClickDelete?.();

                if (clips.length) openMetadataInspector();
            };
            clipDiv.appendChild(deleteBtn);

            const totalFrames = clip.frames.length;
            const count = Math.min(5, totalFrames);

            // Pick exactly `count` evenly-spaced indices
            const indices = Array.from({ length: count }, (_, i) =>
                Math.floor((i * (totalFrames - 1)) / (count - 1)),
            );

            const framesDiv = document.createElement("div");
            framesDiv.classList.add(styles.frames);

            indices.forEach((frameIndex, i) => {
                if (i > 0) {
                    const span = document.createElement("span");
                    span.textContent = "...";
                    framesDiv.appendChild(span);
                }
                framesDiv.appendChild(clip.frames[frameIndex].canvas);
            });
            clipDiv.appendChild(framesDiv);
        });
    }

    function openMetadataInspector() {
        repackClips();

        if (clips.length == 0) {
            alert("No clips to inspect. Try creating a new recording first...");
            return;
        }
        document.body.appendChild(metadataInspector!);
    }

	/**
	 * Exports the texture atlas to a PNG file.
	 */
    function exportAtlasTexture() {
        if (!clips.length) {
            alert("No clips found...");
            return;
        }

        repackClips();

        const link = document.createElement("a");
        link.download = "atlas.png";
        link.href = currentAtlas!.canvas.toDataURL();
        link.click();
    }

	/**
	 * Exports the metadata to a .mcap file.
	 */
    function exportMetadata() {
        if (!clips.length) {
            alert("No metadata found...");
            return;
        }

        repackClips();

        // add overlay...
        const overlay = document.createElement("div");
        overlay.classList.add(styles.overlay);
        overlay.textContent = "Exporting metadata...";
        document.body.appendChild(overlay);

        currentAtlas!.save(true).finally(() => {
            overlay.remove();
        });
    } 

	/**
	 * Copy a dictionary relating index to clip name to the clipboard.
	 * Use this to reference a clip index by it's name
	 */
	function copyClipsDictionary(){
		if( clips.length == 0) {
			alert("No clips found...");
			return;
		}
		const dict: Record<string, number> = {};
		clips.forEach((clip, index) => {
			// slugify the name
			const slug = clip.name.toLowerCase().replace(/[^a-z0-9]/g, "_");
			dict[slug] = index;
		});
		navigator.clipboard.writeText("const clipsDictionary = "+JSON.stringify(dict)+" as const;");
		alert("Clips dictionary copied to clipboard.");
	}

    const controls = new OrbitControls(camera, renderer.domElement);
    camera.position.set(0, 0, 11);
    camera.fov = 22.5;
    camera.updateProjectionMatrix();
    controls.update();

    //
    // the face mesh
    //
    faceMesh = scene.getObjectByName("face_model_with_iris") as Mesh;
    // faceMesh.receiveShadow = true;
    // faceMesh.castShadow = true; 

	//
	// bind the face mesh to the tracker
	//
    const faceBind = tracker.faceTracker!.bindGeometry(
        faceMesh,
        (posNode, colorNode) => {
            liveMaterial = new MeshPhysicalNodeMaterial({
                positionNode: posNode,
                colorNode: colorNode as Node<"vec4">,
            }); 

            faceMesh!.material = liveMaterial;

            enter(states.initialState);
        },
    ); 

    syncLiveMaterial = faceBind.update;
    update = syncLiveMaterial;

    return (delta: number) => {
        if (
            tracker.video &&
            tracker.video.videoWidth &&
            tracker.video.videoHeight &&
            tracker.faceTracker &&
            recording
        ) {
            captureFrame(delta);
        }

        update?.(delta);
    };
};

/**
 *
 * @param video will crop the face from this video
 * @param landmarks mediapipe landmarks (normalized 0-1)
 * @param scale scale factor for the output canvas
 * @param padding extra padding around the face bounding box (0.1 = 10%)
 * @returns
 */
function cropFaceFromLandmarks(
    video: HTMLVideoElement,
    landmarks: NormalizedLandmark[], // mediapipe landmarks (normalized 0-1)
    scale: number = 1,
    padding: number = 0.1, // extra padding around the face bounding box (0.1 = 10%)
) {
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    // Convert normalized landmarks to pixel coordinates
    const xs = landmarks.map((l) => l.x * videoWidth);
    const ys = landmarks.map((l) => l.y * videoHeight);

    // Get bounding box of all landmarks
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const faceWidth = maxX - minX;
    const faceHeight = maxY - minY;

    // Apply padding
    const padX = faceWidth * padding;
    const padY = faceHeight * padding;

    // Clamp to video bounds
    const srcX = Math.max(0, minX - padX);
    const srcY = Math.max(0, minY - padY);
    const srcW = Math.min(videoWidth - srcX, faceWidth + padX * 2);
    const srcH = Math.min(videoHeight - srcY, faceHeight + padY * 2);

    // Create output canvas at desired scale
    const canvas = document.createElement("canvas");
    canvas.width = srcW * scale;
    canvas.height = srcH * scale;

    const ctx = canvas.getContext("2d")!;

    // Crop from video and draw into canvas
    ctx.drawImage(
        video,
        srcX,
        srcY,
        srcW,
        srcH, // source rect (from video)
        0,
        0,
        canvas.width,
        canvas.height, // destination rect (into canvas)
    );

    return {
        canvas,
        cropUV: {
            u: srcX / videoWidth,
            v: srcY / videoHeight,
            w: srcW / videoWidth,
            h: srcH / videoHeight,
        },
    };
}

class Overlay {
	readonly setStatus: (status: string) => void;
	readonly remove: () => void;
	readonly setHTML: (html: string) => void;

	readonly container: HTMLDivElement;
	constructor(){
		const overlay = document.createElement("div");
        overlay.classList.add(styles.overlay); 
        document.body.appendChild(overlay);

		this.container = overlay;

		this.setStatus = (status: string) => {
			overlay.textContent = status;
		};

		this.setHTML = (html: string) => {
			overlay.innerHTML = html;
		};

		this.remove = () => {
			overlay.remove();
		};
	}
}