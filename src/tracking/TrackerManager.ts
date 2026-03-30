import {
    DrawingUtils,
    FilesetResolver,
    HandLandmarkerOptions,
    PoseLandmarker,
} from "@mediapipe/tasks-vision";
import * as THREE from "three/webgpu";
import { loadPoseTracker, PoseTracker } from "./PoseTracker";
import { HandsTracker, loadHandTracker } from "./HandTracker"; 
import { FaceTracker, loadFaceTracker } from "./FaceTracker";
import { BoneMap, defaultBoneMap } from "./BoneMapping";
import { createRigRecorder } from "./recoding/recorder";

export type TrackerConfig = {
    /**
     * Use an image file. Useful to test a particular pose.
     */
    debugFrame?: string;

    /**
     * Scale of the video display
     */
    displayScale: number;

    /**
     * If the body pose should ignore the legs
     */
    ignoreLegs: boolean;

    /**
     * Use a video file instead of the webcam
     */
    debugVideo?: string;

    /**
     * Don't track the face
     */
    ignoreFace: boolean;

    /**
     * Only track the face
     */
    onlyFace: boolean;

    /**
     * @see https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js#configuration_options
     */
    handsTrackerOptions: HandLandmarkerOptions | undefined;

	modelPaths?: {
		vision?:string;
		pose?: string;
		hand?: string;
		face?: string;
	}

	/**
	 * Draw the wireframe landmarks on top of the source image/video? ( default to true )
	 */
	drawLandmarksOverlay?:boolean
};

export interface BindingHandler {

	/**
	 * Updates the rig with the latest landmarks.
	 * @param delta The time elapsed since the last frame in seconds.
	 */
    update: (delta: number) => void;

}

export interface RecorderHandler { 
	/**
	 * Starts recording the rig's movement and active shape keys ( from media pipe ).
	 */
	startRecording: VoidFunction;

	/**
	 * Stops recording the rig's movement.
	 * @returns A function that can be called to SAVE the recording to a file.
	 */
	stopRecording: ReturnType<typeof createRigRecorder>['stop'];

	/**
	 * Checks if the rig is currently recording.
	 * @returns True if the rig is recording, false otherwise.
	 */
	isRecording: () => boolean;
}

export interface RecordableBindingHandler extends BindingHandler, RecorderHandler {}

// Check if webcam access is supported.
const hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia;

export async function setupTracker(config?: Partial<TrackerConfig>) : Promise<TrackerHandler>{
    const $cfg = {
        debugFrame: undefined,
        displayScale: 1,
        ignoreLegs: false,
        debugVideo: undefined,
        ignoreFace: false,
		onlyFace: false,
		drawLandmarksOverlay:true,
		modelPaths: {
			vision: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm",
			pose: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
			hand: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
			face: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
		},
        ...config,
    };
    let video: HTMLVideoElement | undefined;
    const vision = await FilesetResolver.forVisionTasks( $cfg.modelPaths.vision ?? "/wasm" );
    const poseTracker = $cfg.onlyFace ? undefined : await loadPoseTracker(vision, {
        ignoreLegs: $cfg.ignoreLegs,
		modelPath: $cfg.modelPaths.pose!,
		drawLandmarks: $cfg.drawLandmarksOverlay,
    });
    const handsTracker = $cfg.onlyFace ? undefined : await loadHandTracker(vision, {
        leftWrist: () => poseTracker!.leftWristNormalizedPosition,
        rightWrist: () => poseTracker!.rightWristNormalizedPosition,
		modelPath: $cfg.modelPaths.hand!,
		drawLandmarks: $cfg.drawLandmarksOverlay,
        ...config?.handsTrackerOptions,
    });
    const faceTracker = $cfg.ignoreFace
        ? undefined
        : await loadFaceTracker(vision, { modelPath: $cfg.modelPaths.face!, videoElementRef:()=>video, drawLandmarks: $cfg.drawLandmarksOverlay });

    //#region setup Camera and Canvas...
	const viewport = document.createElement("div");
	viewport.style.position = "absolute";
	viewport.style.top = "0px";
	viewport.style.left = "0px"; 
	viewport.style.zIndex = "21";
	viewport.style.maxWidth = "600px"; 
	viewport.style.width = "100%"; 
	viewport.classList.add("three-mediapipe-rig")
	document.body.appendChild(viewport);

    const canvasElement = document.createElement("canvas");
    const canvasCtx = canvasElement.getContext("2d")!;
    const drawingUtils = new DrawingUtils(canvasCtx);

    canvasElement.style.zIndex = "22";
    canvasElement.style.position = "absolute";
    canvasElement.style.top = "0px";
    canvasElement.style.left = "0px";
    canvasElement.style.pointerEvents = "none";
	canvasElement.style.maxWidth = "100%";  
    viewport.appendChild(canvasElement);

    function predict(source: TexImageSource) {
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        poseTracker?.predict(source, drawingUtils);
        handsTracker?.left.predict(source, drawingUtils);
        handsTracker?.right.predict(source, drawingUtils);
        faceTracker?.predict(source, drawingUtils);
        canvasCtx.restore();
    }

    function initializeVideo() {
        video = document.createElement("video");
        viewport.appendChild(video);

        let lastVideoTime = -1;

        video.style.zIndex = "21";
        video.style.position = "absolute";
        video.style.top = "0px";
        video.style.left = "0px";
		video.style.height = "auto"; 
		video.style.maxWidth = "100%"; 
		video.style.display = "block"; 
		video.muted = false

        if ($cfg.debugVideo) {
            video.src = $cfg.debugVideo;
            video.controls = true;
            video.loop = true;
            video.muted = true;
            video.controls = true;
            video.play();
        }

        function predictWebcam() {
            if (lastVideoTime !== video!.currentTime && video!.readyState >= 2) {
                predict(video!);
                lastVideoTime = video!.currentTime;
            }
            window.requestAnimationFrame(predictWebcam);
        }

        video.addEventListener("loadeddata", () => {
			 const vw = video!.videoWidth;
			  const vh = video!.videoHeight;

			  const maxW = 600; 
			  const maxH = 600; 

			  const scale = Math.min(maxW / vw, maxH / vh, 1);

			  video!.width = vw * scale * ($cfg.displayScale ?? 1);
			  video!.height =  vh * scale * ($cfg.displayScale ?? 1);
 
            canvasElement.width = video!.width;
            canvasElement.height = video!.height;
            canvasElement.style.height = "auto";
            canvasElement.style.width = video!.width + "px";
            canvasElement.style.maxWidth = "100%"; 

            window.requestAnimationFrame(predictWebcam);
        });
    }

    if ($cfg.debugFrame) {
        //#region Debug Frame mode — use a static image
        const img = document.createElement("img");
        img.src = $cfg.debugFrame;
        img.style.zIndex = "21";
        img.style.position = "absolute";
        img.style.top = "0px";
        img.style.left = "0px";
		viewport.appendChild(img);

        img.addEventListener("load", () => {
            img.width = img.naturalWidth * $cfg.displayScale;
            img.height = img.naturalHeight * $cfg.displayScale;
            canvasElement.width = img.naturalWidth;
            canvasElement.height = img.naturalWidth;
            canvasElement.style.width = img.width + "px";
            canvasElement.style.height = img.height + "px";

            function predictFrame() {
                predict(img);
				//window.requestAnimationFrame(predictFrame);
            }

            window.requestAnimationFrame(predictFrame);
        });
        //#endregion
    } else if( $cfg.debugVideo ) {
        //#region Video mode
        initializeVideo();
        //#endregion
    } 

	let webcamStopper:VoidFunction | undefined;

	function setEnabled( enabled:boolean ) {
		if(!video) return;
		if (video.srcObject) {
			// webcam
			const tracks = (video.srcObject as MediaStream).getTracks();
			tracks.forEach(t => t.enabled = enabled);
		} else {
			if(enabled) video.play();
			else video.pause();
		}
	}

    return {
        poseTracker,
        handsTracker,
        faceTracker,
        video,
		canvas: canvasElement,

		
		domElement: viewport,

		
        start: async ( withAudio:boolean = false ) => {
			let stopped = false;

            if (!hasGetUserMedia()) {
                throw new Error("Webcam not supported");
            }

            if (!video) {
                initializeVideo();
            }

            let stream: Awaited<MediaStream> | undefined;

			function onTrackEnded(video: HTMLVideoElement): void {
				if( stopped ) return;
				console.warn('Camera track ended, attempting recovery...');
				stopCamera(video);
				retryWithBackoff(video);
			}

			function stopCamera(video: HTMLVideoElement): void {
				stream?.getVideoTracks().forEach(t => t.stop());
				stream = undefined;
				video.srcObject = null;
			}

			async function retryWithBackoff(video: HTMLVideoElement, attempt = 0): Promise<void> {
			  const MAX_ATTEMPTS = 3;
			  const delay = Math.min(1000 * 2 ** attempt, 16000); // 1s, 2s, 4s, 8s, 16s

			  if (attempt >= MAX_ATTEMPTS) {  
			    throw new Error('Camera recovery failed after max attempts');
			  }

			  await new Promise(res => setTimeout(res, delay)); 

			  if(stopped) return;

			  try {
			    await startCamera(video); 
			  } catch ( err ) {
			    await handleCameraError(err, video, attempt + 1);
			  }
			}

			async function startCamera(video: HTMLVideoElement): Promise<void> {
			 
			    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: withAudio });
			    video.srcObject = stream;
			    await video.play();

			    // Listen for track ending (camera disconnected / permission revoked)
			    stream.getVideoTracks().forEach(track => {
			      track.addEventListener('ended', () => onTrackEnded(video));
			    });
 
			}

			async function handleCameraError(err: unknown, video: HTMLVideoElement, attempt=0): Promise<void> {
			  if (err instanceof DOMException) {
			    switch (err.name) {
			      case 'NotAllowedError':
			        throw new Error('Permission denied — prompt user to allow camera'); 
			      case 'NotFoundError':
			        console.error('No camera found — retry when device is connected');
			        await retryWithBackoff(video, attempt + 1); // device might be plugged in later
			        break;
			      case 'NotReadableError':  
			        throw new Error('Camera in use by another app');
			      default: 
					throw new Error('Camera error: ' + err.message);
			    }
			  } else {
				throw new Error('Unknown camera error: ' + err);
			  }
			} 

            await retryWithBackoff(video!);

			webcamStopper = () => {
				stopped = true;
				stopCamera(video!);
				webcamStopper = undefined;
			}

			return {
				getStream: () => stream,
				stop: webcamStopper
			}
        },

		pause: () => {
			setEnabled(false);
		},

		resume: () => {
			setEnabled(true);
		},

        
        bind: ( rig: THREE.Object3D, magging?:BoneMap ) => {

			magging = magging || defaultBoneMap;

			if(!poseTracker) throw new Error("Pose tracker not initialized");
			if(!handsTracker) throw new Error("Hands tracker not initialized");
			if(!faceTracker) throw new Error("Face tracker not initialized");

            const bodyBindin = poseTracker.bind(rig, magging);
            const leftHandBinding = handsTracker.left.bind(rig, magging);
            const rightHandBinding = handsTracker.right.bind(rig, magging);
            let faceKeys: BindingHandler | undefined;
            const faceRig = faceTracker?.bind(rig);

            rig.traverse((child) => {
                if (
                    child instanceof THREE.Mesh &&
                    child.name.indexOf( magging.faceMesh ) === 0
                ) {
                    child.frustumCulled = false;
                    faceKeys = faceTracker?.bindShapeKeys(child);
                }
            });

			const recorder = createRigRecorder(rig, magging)

            return {

				/**
				 * Will save the tracked movement of the rig to an animation clip.
				 * Only the bones moved by the bone mapping will be recorded.
				 */
				startRecording: recorder.start,
				stopRecording: recorder.stop,
				isRecording: () => recorder.isRecording(),

                update: (delta: number) => {
                    bodyBindin.update(delta);
                    leftHandBinding.update(delta);
                    rightHandBinding.update(delta);
                    faceKeys?.update(delta);
                    faceRig?.update(delta);

					if( recorder.isRecording() ) {
						recorder.captureFrame()
					}
                },
            } as RecordableBindingHandler;
        },

		
		setVideoFromSource: ( source: string | File ) => {

			webcamStopper?.();

			if (!video) {
                initializeVideo();
            }

			video!.src = source instanceof File ? URL.createObjectURL(source) : source;
            video!.controls = true;
            video!.loop = true;
            video!.muted = true;
            video!.controls = true;
            video!.play();
		},

		
		async setVideoFromWebcam( withAudio = false ):Promise<VideoHandler> {
			if (!video) {
                initializeVideo();
            }

			if( webcamStopper ) {
				throw new Error("Webcam already started"); 
			};

			return await (this as TrackerHandler).start(withAudio);
		}


    };
}

export type VideoHandler = {
	stop:VoidFunction,
	getStream: () => MediaStream|undefined
}

export type TrackerHandler = {

	poseTracker:PoseTracker|undefined,
	handsTracker:{
		left:HandsTracker,
		right:HandsTracker,
	}|undefined,
	faceTracker:FaceTracker|undefined,

	/**
	 * Video element showing the webcam or video file
	 */
	video:HTMLVideoElement|undefined,

	/**
	 * Canvas where the debug landmarks are drawn
	 */
	canvas:HTMLCanvasElement|undefined,

	/**
	 * A div that contains the video and canvas used to display the landmarks stacked on top of each other.
	 */
	domElement:HTMLDivElement|undefined,

	/**
	 * Start the webcam feed. This must be initiated by a user triggered event ( a click on a button ) due to security reasons. 
	 */
	start: ( withAudio?:boolean ) => Promise<VideoHandler>;

	/**
	 * Pauses the tracking.
	 */
	pause: VoidFunction;

	/**
	 * Resumes the tracking.
	 */
	resume: VoidFunction;

	/**
     * Binds the bones of the rig to the landmarks provided by media pipe.
     * @param rig The rig that contains all the bones and skinned meshes of your character.
	 * @param magging The bone mapping to use for the rig.
     */
	bind: ( rig: THREE.Object3D, magging?:BoneMap ) => RecordableBindingHandler;

	/**
	 * Sets the source of the video used for the face tracking.
	 * @param source 
	 */
	setVideoFromSource: ( source: string | File ) => void;

	/**
	 * Starts the webcam feed.
	 * @returns A function to stop the webcam feed.
	 */
	setVideoFromWebcam: ( withAudio?:boolean ) => Promise<VideoHandler>;
};
