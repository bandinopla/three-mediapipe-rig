import {
    DrawingUtils,
    NormalizedLandmark,
    PoseLandmarker,
} from "@mediapipe/tasks-vision"; 
import * as THREE from "three/webgpu";
import { lookAt, LookAtPoleAxis } from "./util/lookAt";
import { Tracker } from "./Tracker";
import { rootPosition } from "./util/getRootPosition";
import { getBoneByName } from "./util/getBoneByName";
import { BoneMap } from "./BoneMapping";

export async function loadPoseTracker(vision: any, config?:Partial<PoseTrackerConfig>) {
	const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { 
			modelAssetPath: config?.modelPath ?? "pose_landmarker_lite.task",
            //modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
            //modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task",
            delegate: "GPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
    });

	return new PoseTracker(poseLandmarker, config);
} 

/**
 * Points derived from https://ai.google.dev/static/mediapipe/images/solutions/pose_landmarks_index.png
 * If the array has 2 elements, the point is between those 2 landmarks.
 * If it has 4, the point is at the center of those 4 landmarks.
 */
const poseMarks = {
			hips: [24,23],
			neck: [12,11],
			leftLeg: 23,
			leftKnee:25,
			leftFoot: 27,
			leftToes: 31,
			leftArm: 11,
			leftElbow: 13,
			leftWrist: 15,
			rightLeg: 24,
			rightKnee: 26,
			rightFoot: 28,
			rightToes: 32,
			rightArm: 12,
			rightElbow: 14,
			rightWrist: 16, 
			head: [8,7] //between the ears
			, mouth:[10,9]
			, torso: [24,23, 12,11] //at the center of the torso
			, leftEar: 7
			, rightEar: 8
		} ;

type MarkKey = keyof typeof poseMarks;

type BoneBinding = [THREE.Object3D, MarkKey, MarkKey,LookAtPoleAxis]

const A = new THREE.Vector3();
const B = new THREE.Vector3();
const C = new THREE.Vector3();
const D = new THREE.Vector3();
const E = new THREE.Vector3();
const lookGoal = new THREE.Vector3();
const poleGoal = new THREE.Vector3();

type PoseTrackerConfig = {
	ignoreLegs:boolean
	modelPath:string
	drawLandmarks?:boolean
}

/**
 * @see https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
 */
class PoseTracker extends Tracker<typeof poseMarks> {
	private _leftWristNormalizedPosition!:NormalizedLandmark;
	private _rightWristNormalizedPosition!:NormalizedLandmark;

	/**
	 * Position of the left wrist in normalized coordinates (0..1)
	 */
	get leftWristNormalizedPosition() { return this._leftWristNormalizedPosition; }

	/**
	 * Position of the right wrist in normalized coordinates (0..1)
	 */
	get rightWristNormalizedPosition() { return this._rightWristNormalizedPosition; }

	constructor(private readonly poseLandmarker:PoseLandmarker, private readonly config?:Partial<PoseTrackerConfig>){ 

		super(poseMarks, PoseLandmarker.POSE_CONNECTIONS)
		
		this.root.scale.y *= -2
		this.root.scale.z *= -2
		this.root.scale.x *= 2 
	}

	override predict( source:TexImageSource, drawingUtils:DrawingUtils ){
		this.poseLandmarker.detectForVideo( source, performance.now(), (result) => {

			if( result.landmarks.length==0 )
			{
				return;
			}
  
			this.updateLandmarks( result.worldLandmarks[0], this.config?.drawLandmarks===false ? undefined : result.landmarks[0],  drawingUtils );

			
			this._leftWristNormalizedPosition = result.landmarks[0][ this.points.leftWrist ];
			this._rightWristNormalizedPosition = result.landmarks[0][ this.points.rightWrist ];
		} );
	}

	// override sync ( delta:number, objects: BoneBinding[] ) {

	// 	const hipsPos = this.marks.hips.getWorldPosition(C); 

	// 	this.marks.rightArm.getWorldPosition(A).sub(hipsPos);
	// 	this.marks.leftArm.getWorldPosition(B).sub(hipsPos); 

	// 	const torsoNormal = C.crossVectors(A,B);

	// 	this.syncObjects(objects, delta, torsoNormal); 

	// }
	

	bind( rig:THREE.Object3D, magging:BoneMap )
	{ 
		 
		const map : { [key in MarkKey]?:THREE.Object3D } = {
			"hips": getBoneByName(rig, magging.hips),
			"neck": getBoneByName(rig, magging.neck),
			"leftArm": getBoneByName(rig, magging.armL),
			"leftElbow": getBoneByName(rig, magging.forearmL),
			"leftWrist": getBoneByName(rig, magging.handL),
			"rightArm": getBoneByName(rig, magging.armR),
			"rightElbow": getBoneByName(rig, magging.forearmR),
			"rightWrist": getBoneByName(rig, magging.handR),
			"head": getBoneByName(rig, magging.head), 
			"torso": getBoneByName(rig, magging.torso),
			"leftLeg": getBoneByName(rig, magging.thighL),
			"leftKnee": getBoneByName(rig, magging.shinL),
			"leftFoot": getBoneByName(rig, magging.footL),
			"rightLeg": getBoneByName(rig, magging.thighR),
			"rightKnee": getBoneByName(rig, magging.shinR),
			"rightFoot": getBoneByName(rig, magging.footR),
		} 

		if( this.config?.ignoreLegs ){
			delete map.leftLeg
			delete map.leftKnee
			delete map.leftFoot
			delete map.leftToes
			delete map.rightLeg
			delete map.rightKnee
			delete map.rightFoot
			delete map.rightToes
		}

		const v = new THREE.Vector3();
		const v2 = new THREE.Vector3();

		const syncBone = ( delta:number, bone:THREE.Object3D|undefined, from:MarkKey, to:MarkKey, sideAxis:THREE.Vector3, poleAxis:LookAtPoleAxis ) => {
			if( !bone ) return;

			const hipsDir = this.marks[to].getWorldPosition(v).sub(this.marks[from].getWorldPosition(v2)).normalize(); 

		  
			rootPosition(lookGoal, bone, rig).add( hipsDir ).applyMatrix4(rig.matrixWorld) ;
			rootPosition(poleGoal, bone, rig).add( sideAxis ).applyMatrix4(rig.matrixWorld) ; 

			const ghost = this.getGhost(bone)

			lookAt(ghost, lookGoal, poleGoal, poleAxis)
			ghost.rotateX(Math.PI/2)
			 

			ghost.lerp(bone, delta)
		}

		return {
			update: (delta:number)=>{
 
				const sideHips = this.marks.leftLeg.getWorldPosition(A).sub(this.marks.rightLeg.getWorldPosition(B)).normalize();
				const sideShoulders = this.marks.leftArm.getWorldPosition(B).sub(this.marks.rightArm.getWorldPosition(C)).normalize();
				const sideHead = this.marks.leftEar.getWorldPosition(D).sub(this.marks.rightEar.getWorldPosition(E)).normalize();

				syncBone(delta, map.hips, "hips", "torso", sideHips, "+x")
				syncBone(delta, map.torso, "torso", "neck", sideShoulders, "+x")
				syncBone(delta, map.neck, "neck", "head", sideHead, "+x")
				syncBone(delta, map.head, "neck", "head", sideHead, "+x")

				syncBone(delta, map.leftArm, "leftArm", "leftElbow", sideShoulders, "-x")
				syncBone(delta, map.leftElbow, "leftElbow", "leftWrist", sideShoulders, "-x")
				syncBone(delta, map.leftLeg, "leftLeg", "leftKnee", sideHips, "+x") 
				syncBone(delta, map.leftKnee, "leftKnee", "leftFoot", sideHips, "+x") 
				syncBone(delta, map.leftFoot, "leftFoot", "leftToes", sideHips, "+x") 

				syncBone(delta, map.rightArm, "rightArm", "rightElbow", sideShoulders, "-x")
				syncBone(delta, map.rightElbow, "rightElbow", "rightWrist", sideShoulders, "-x")
				syncBone(delta, map.rightLeg, "rightLeg", "rightKnee", sideHips, "+x") 
				syncBone(delta, map.rightKnee, "rightKnee", "rightFoot", sideHips, "+x") 
				syncBone(delta, map.rightFoot, "rightFoot", "rightToes", sideHips, "+x") 
				
			}
		}
	}
}
 