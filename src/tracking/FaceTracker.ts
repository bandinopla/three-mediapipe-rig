import {
    Category,
    DrawingUtils,
    FaceLandmarker
} from "@mediapipe/tasks-vision";
import { Mesh, Object3D, Vector3 } from "three/webgpu";
import { Tracker } from "./Tracker";
import { rootPosition } from "./util/getRootPosition";
import { getBoneByName } from "./util/getBoneByName";
import { lookAt } from "./util/lookAt";

export async function loadFaceTracker(vision: any, cfg?: { modelPath?: string }) {
    const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: cfg?.modelPath ?? "face_landmarker.task",
			delegate: "GPU", 
        },
		outputFaceBlendshapes: true,
        runningMode: "VIDEO",
		numFaces: 1,
    });

	return new FaceTracker(faceLandmarker);
}

/**
 * @see https://storage.googleapis.com/mediapipe-assets/documentation/mediapipe_face_landmark_fullsize.png
 */
const faceMarks = {
	eyeL: 473,
	eyeR: 468,
	eyeStartL: 463,
	eyeStartR: 243,
	eyeEndL: 263,
	eyeEndR: 33, 

	earL: 454,
	earR: 234,
	noseTip: 4,
	noseBone:6,
	chin:152,
	forehead: 10

}

type MarkKey = keyof typeof faceMarks;
const v = new Vector3();
const v2 = new Vector3();
const v3 = new Vector3();
const v4 = new Vector3();
const v5 = new Vector3();
const v6 = new Vector3();

class FaceTracker extends Tracker<typeof faceMarks> {
	private blendshapeCategories: Category[] | undefined;
	private blendshapeMap: Map<string, number> = new Map();
	private smoothed: Record<string, number> = {};
	private smoothing =.0003; // lower = smoother but more lag, higher = more responsive

	constructor(private faceLandmarker: FaceLandmarker) {
		super(faceMarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION)

		this.root.scale.y*=-1
		this.root.scale.z*=-1
		this.root.scale.multiplyScalar(3)
	}

	override predict(frame: TexImageSource, drawingUtils: DrawingUtils) {
		const result = this.faceLandmarker.detectForVideo(frame, performance.now());
		if (result.faceLandmarks[0]) {
			drawingUtils.drawConnectors(result.faceLandmarks[0], FaceLandmarker.FACE_LANDMARKS_TESSELATION, { color: "#00fff2ff", lineWidth: .1 });
			drawingUtils.drawLandmarks(result.faceLandmarks[0], { color: "#00ff00", lineWidth: .1, radius: .4 });	

			this.updateLandmarks(result.faceLandmarks[0], result.faceLandmarks[0] );
		}

		this.blendshapeCategories = result.faceBlendshapes?.[0]?.categories; 

		this.blendshapeCategories?.forEach((category) => {
			this.blendshapeMap.set(category.categoryName, category.score);
		});
		
	}

	bindShapeKeys(mesh: Mesh) {
		const meshKeys = mesh.morphTargetDictionary; 

		return {
			update: (delta: number) => {
				this.blendshapeCategories?.forEach((category) => {
					const { categoryName, score } = category;

					if (!meshKeys?.hasOwnProperty(categoryName)) return;

					// Initialize if first time seeing this key
					if (this.smoothed[categoryName] === undefined)
						this.smoothed[categoryName] = score;

					// Lerp toward target score
					const factor = 1 - Math.pow(this.smoothing, delta);
					this.smoothed[categoryName] += (score - this.smoothed[categoryName]) * factor;

					mesh.morphTargetInfluences![meshKeys[categoryName]] = this.smoothed[categoryName];
				});

				//eyes
			}
		}
	}

	bind( rig:Object3D ) {

		const eyeL = new EyeRig(rig, "L");
		const eyeR = new EyeRig(rig, "R");
		const headBone = getBoneByName(rig, "head") ;
 
		return {
			update: ( delta:number )=> {
				 
				eyeL.update(delta, this.blendshapeMap);
				eyeR.update(delta, this.blendshapeMap); 
				
				if(!headBone) return;

				//
				const markEarL = v.copy( this.marks.earL.worldPosition );
				const markEarR = v2.copy( this.marks.earR.worldPosition );
				const headcenter = v3.subVectors(markEarL, markEarR).multiplyScalar(.5).add(markEarR);
				const headForward = v4.subVectors(this.marks.noseTip.worldPosition, headcenter) ;
				const headSideNormal = markEarL.sub(markEarR) ;

				
				const headPosition = rootPosition( v5, headBone, rig); 

				const poleLookAt = headSideNormal.add( headPosition ).applyMatrix4(rig.matrixWorld);
				const faceLookAt = headForward.add( headPosition ).applyMatrix4(rig.matrixWorld);

				lookAt( headBone, faceLookAt, poleLookAt,"+x" );
				 

				// headLookAtPos.applyMatrix4(rig.matrixWorld);
				//headBone.lookAt( headLookAtPos );
				// 
			}
		}
		
	}
}

class EyeRig {
	private eyeBone:Object3D|undefined; 

	private eyeLookOut:string;
	private eyeLookIn:string;
	private eyeLookUp:string;
	private eyeLookDown:string;
	private sign = 1;
	
	constructor( readonly rig:Object3D, readonly side:"L"|"R" ) {
		this.eyeBone = rig.getObjectByName(`eye${side}`) as Object3D; 

		const sideName = side == "L" ? "Left" : "Right";
		this.eyeLookOut = `eyeLookOut${sideName}`;
		this.eyeLookIn = `eyeLookIn${sideName}`;
		this.eyeLookUp = `eyeLookUp${sideName}`;
		this.eyeLookDown = `eyeLookDown${sideName}`;

		this.sign = side == "L" ? -1 : 1;
	}

	update( delta:number, blendshapes: Map<string, number> ) {
		if( !this.eyeBone ) return; 
 
		const eye = rootPosition(v3, this.eyeBone, this.rig);  

		
		
		// From MediaPipe blendshapes
		const lookLeft  = blendshapes.get(this.eyeLookOut) ?? 0;  // or eyeLookInRight
		const lookRight = blendshapes.get(this.eyeLookIn) ?? 0;   // or eyeLookOutRight
		const lookUp    = blendshapes.get(this.eyeLookUp) ?? 0;
		const lookDown  = blendshapes.get(this.eyeLookDown) ?? 0;

		
		// Map to a -1..1 range
		const sideMovement = lookRight - lookLeft  // horizontal
		const verticalMovement = lookDown  - lookUp    // vertical
 

		this.eyeBone.rotation.y =( sideMovement * this.sign) / 2; 
		this.eyeBone.rotation.x = verticalMovement / 2; 
		// // Then drive your rig bone with a target offset
		// const lookAtPos = eyeCenter
		//     .add(eyeHorizontalDir ) // -sideMovement * eyeRange)
		//     //.addScaledVector(eyeVerticalDir, verticalMovement * eyeRange/3)
		//     .applyMatrix4(this.rig.matrixWorld);

		// this.eyeBone.lookAt(lookAtPos);
		// this.eyeBone.rotateX(Math.PI/2)
	}
}