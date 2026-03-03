import {
	DrawingUtils,
    HandLandmarker,
	HandLandmarkerOptions,
	NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import * as THREE from "three/webgpu";
import { lookAt, LookAtPoleAxis } from "./util/lookAt";
import { Tracker } from "./Tracker";
import { rootPosition } from "./util/getRootPosition";
import { getBoneByName } from "./util/getBoneByName";
import { BoneMap } from "./BoneMapping";

export type HandsTrackerConfig = {
	leftWrist: ()=>NormalizedLandmark;
	rightWrist: ()=>NormalizedLandmark;
	modelPath?:string
} & Partial<HandLandmarkerOptions>;

const A = new THREE.Vector2();
const B = new THREE.Vector2();

export async function loadHandTracker(vision: any, config:HandsTrackerConfig ) {
    const landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: config.modelPath ?? "hand_landmarker.task",
            //modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
    });

	const isMyWrist = ( myWrist:()=>NormalizedLandmark, otherWrist:()=>NormalizedLandmark, handWrist:NormalizedLandmark ) => {

		try{
			A.copy(myWrist());
			B.copy(otherWrist());
		}catch(e){
			console.warn("No pose data... will just be optimitic and say yes to everything.", e);
			return true;
		}
		return A.distanceTo(handWrist) < B.distanceTo(handWrist);
	}

    return {
		left:new HandsTracker(landmarker, "Left", isMyWrist.bind(null, config.leftWrist, config.rightWrist) ),
		right:new HandsTracker(landmarker, "Right", isMyWrist.bind(null, config.rightWrist, config.leftWrist) )
	};
}

const handMarks = {
    wrist: 0,
	palm: [9,13],

    thumb1: 1,
    thumb2: 2,
    thumb3: 3,
    thumb4: 4,

    index1: 5,
    index2: 6,
    index3: 7,
    index4: 8,

    middle1: 9,
    middle2: 10,
    middle3: 11,
    middle4: 12,

    ring1: 13,
    ring2: 14,
    ring3: 15,
    ring4: 16,

    pinky1: 17,
    pinky2: 18,
    pinky3: 19,
    pinky4: 20,
};

export type HandMarkName = keyof typeof handMarks;

const fingerKeys = {
	thumb: ["thumb1","thumb2","thumb3","thumb4"],
	index: ["index1","index2","index3","index4"],
	middle: ["middle1","middle2","middle3","middle4"],
	ring: ["ring1","ring2","ring3","ring4"],
	pinky: ["pinky1","pinky2","pinky3","pinky4"]
} as { [key:string]: HandMarkName[]} ;


type HandSide = "Left" | "Right"
export type Mark2Bone = Partial<{ [key in HandMarkName]: THREE.Object3D }>;

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const v4 = new THREE.Vector3();
const v5 = new THREE.Vector3();
const v6 = new THREE.Vector3();
const v7 = new THREE.Vector3();

const currNormal = new THREE.Vector3();
const currForward = new THREE.Vector3();
const currSide = new THREE.Vector3();
const HALF_PI = Math.PI/2
const DOWN = new THREE.Vector3(0,-1,0);

class HandsTracker extends Tracker<typeof handMarks> {
	private readonly sign:number;
	private readonly isLeft:boolean;
	/**
	 * the axis used to look at the pole
	 */
	private readonly lookAtPoleAxis:LookAtPoleAxis;

	constructor(private readonly handLandmarker:HandLandmarker, private readonly side:HandSide, private readonly isMyWrist:( handWrist:NormalizedLandmark )=>boolean ){
		super(handMarks, HandLandmarker.HAND_CONNECTIONS)

		this.sign = this.side=="Left" ? -1 : 1;
		this.isLeft = this.side=="Left";
		this.lookAtPoleAxis = this.sign<0? "+x" : "-x";
		this.root.scale.setScalar(7)
		this.root.scale.y *= -1
		this.root.scale.z *= -1
	}

	override predict( source:TexImageSource, drawingUtils:DrawingUtils ){
		const result = this.handLandmarker.detectForVideo(source, performance.now());

		if( result.landmarks.length )
		{
			//console.log(`DETECTED ${result.landmarks.length} hands`, result.handedness)


			for(let i=0; i<result.landmarks.length; i++){
				const hand = result.landmarks[i];
				const wrist = hand[this.points.wrist];
				const isMyWrist = this.isMyWrist(wrist);
				if( isMyWrist ){
					this.updateLandmarks( result.worldLandmarks[i] );

					drawingUtils.drawConnectors(hand, HandLandmarker.HAND_CONNECTIONS, {
						color: this.side=="Left" ? "#00FF00" : "#0000FF",
						lineWidth: 4
					});
					drawingUtils.drawLandmarks(hand, { color: this.side=="Left" ? "#00FF00" : "#0000FF", lineWidth: 3, radius: 1 }); 

					
					break;
				}
			} 
 
 
		} 
	}

	override sync ( delta:number, objects: [THREE.Object3D, HandMarkName, HandMarkName, LookAtPoleAxis][] ) {

		throw new Error("Not used. Use syncHandBones instead");
	}
		
	/**
	 * 
	 * @param delta time since last frame
	 * @param landmark2bones Array the same size as the umber of hand landmarks, and on each positionthe bone that belongs to that point.
	 * @see https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker
	 */
	syncHandBones( delta:number, markToBone:Mark2Bone, rig:THREE.Object3D )
	{ 
		const palmNormal = v1.crossVectors(
			v2.copy(this.marks.index1.worldPosition).sub(this.marks.wrist.worldPosition),
			v3.copy(this.marks.pinky1.worldPosition).sub(this.marks.wrist.worldPosition)
		).normalize();

		const parlmDir = v2.copy(this.marks.palm.worldPosition).sub(this.marks.wrist.worldPosition).normalize();
		const palmSide = v3.copy(this.marks.pinky1.worldPosition).sub(this.marks.index1.worldPosition).normalize();
		 
		if( parlmDir.dot(DOWN)>0.8 )
		{
			return;
		}

		//
		// positioning of the palm's bone
		//
		if( markToBone.wrist )
		{
			const palmLookAt = rootPosition(v4, markToBone.wrist, rig ).add( parlmDir ).applyMatrix4(rig.matrixWorld) //markToBone.wrist.getWorldPosition(v4).add( parlmDir );
			const polPosition = rootPosition(v5, markToBone.wrist, rig ).sub( palmSide ).applyMatrix4(rig.matrixWorld) //markToBone.wrist.getWorldPosition(v5).sub( palmSide );

			const palmGhost = this.getGhost(markToBone.wrist)

			lookAt( palmGhost, palmLookAt, polPosition, "-y" );
			palmGhost.rotateX( HALF_PI ) ; 

			palmGhost.lerp(markToBone.wrist, delta)
		}

		// palmLookAtOffset.normalize();
		// const palmSide = v3.crossVectors(palmNormal, palmLookAtOffset).normalize();
 
		this.syncFinger( delta, rig, palmNormal, parlmDir, palmSide, markToBone, fingerKeys.index, "middle1" )
		this.syncFinger( delta, rig, palmNormal, parlmDir, palmSide, markToBone, fingerKeys.middle, "ring1" )
		this.syncFinger( delta, rig, palmNormal, parlmDir, palmSide, markToBone, fingerKeys.ring, "pinky1" )
		this.syncFinger( delta, rig, palmNormal, parlmDir, palmSide, markToBone, fingerKeys.pinky, "ring1", true  )

		// //thumb...
		this.syncFinger( delta, rig, palmNormal, parlmDir, palmSide, markToBone, fingerKeys.thumb, "index1"  )

		
	}

	private syncFinger( delta:number, rig:THREE.Object3D, palmNormal:THREE.Vector3, palmForward:THREE.Vector3, palmSide:THREE.Vector3, markToBone:Mark2Bone, fingerKeys:HandMarkName[], sideGoal:HandMarkName, negateSideGoal:boolean=false ){
	 
		let signMult = 1;

		for(let i=0; i<fingerKeys.length-1;i++) {  
			
			const bone = markToBone[fingerKeys[i]];
			//const bonePole = markToBone[sideGoal];

			if(!bone ) continue;

			const fingerGhost = this.getGhost(bone)

			// finger's direction
			const myDir = v4.copy( this.marks[fingerKeys[i+1]].worldPosition ).sub( this.marks[fingerKeys[i]].worldPosition).normalize() ;  
			
			const bonePos = rootPosition(v5, bone, rig) //bone.getWorldPosition(v5); 


			//const poleOffset = v6.copy(bonePos).add(palmSide) //rootPosition(v6, bonePole, rig).sub( bonePos );//bonePole.getWorldPosition(v6).sub( bonePos );

			//if( negateSideGoal ) poleOffset.negate(); 


			if( i==0 )
			{  
				const fingerSideNormal = v6.copy(this.marks[sideGoal].worldPosition).sub(this.marks[fingerKeys[0]].worldPosition).normalize() ;
 
				if( negateSideGoal )
					fingerSideNormal.negate();
 

				// if( this.isLeft )
				// 	sideDir.negate();

				currSide.copy(fingerSideNormal);

				
				lookAt( fingerGhost, 
					myDir.add( bonePos ).applyMatrix4(rig.matrixWorld), 
					fingerSideNormal.add(bonePos).applyMatrix4(rig.matrixWorld), 
					this.lookAtPoleAxis ); 

				
			}
			else 
			{ 
				lookAt( fingerGhost, 
					myDir.add( bonePos ).applyMatrix4(rig.matrixWorld), 
					v6.copy(currSide).add(bonePos).applyMatrix4(rig.matrixWorld), 
					this.lookAtPoleAxis );
			} 

			fingerGhost.rotateX( HALF_PI ); 

			fingerGhost.lerp(bone, delta)

		}

 
	}
 
	bind( rig:THREE.Object3D, magging:BoneMap ){

		const map:Mark2Bone = {
			
		}	 

		const addBind = ( boneName:string, markName:HandMarkName ) => {
			//const bone = rig.getObjectByName( cleanBoneName( boneName.replace("X", this.sign<0 ? "L" : "R") ));

			const bone = getBoneByName(rig, boneName );

			if( bone ){
				map[markName] = bone;
				return markName;
			}
		}

		addBind( this.isLeft ? magging.handL : magging.handR, "wrist" )
		addBind( this.isLeft ? magging.index1L : magging.index1R, "index1" )
		addBind( this.isLeft ? magging.index2L : magging.index2R, "index2" )
		addBind( this.isLeft ? magging.index3L : magging.index3R, "index3" ) 

		addBind( this.isLeft ? magging.middle1L : magging.middle1R, "middle1" )
		addBind( this.isLeft ? magging.middle2L : magging.middle2R, "middle2" )
		addBind( this.isLeft ? magging.middle3L : magging.middle3R, "middle3" ) 

		addBind( this.isLeft ? magging.ring1L : magging.ring1R, "ring1" )
		addBind( this.isLeft ? magging.ring2L : magging.ring2R, "ring2" )
		addBind( this.isLeft ? magging.ring3L : magging.ring3R, "ring3" ) 

		addBind( this.isLeft ? magging.pinky1L : magging.pinky1R, "pinky1" )
		addBind( this.isLeft ? magging.pinky2L : magging.pinky2R, "pinky2" )
		addBind( this.isLeft ? magging.pinky3L : magging.pinky3R, "pinky3" ) 

		addBind( this.isLeft ? magging.thumb1L : magging.thumb1R, "thumb1" )
		addBind( this.isLeft ? magging.thumb2L : magging.thumb2R, "thumb2" )
		addBind( this.isLeft ? magging.thumb3L : magging.thumb3R, "thumb3" ) 

		return {
			update: ( delta:number )=> { 
				this.syncHandBones(delta, map, rig);
			}
		}	
	}
}
