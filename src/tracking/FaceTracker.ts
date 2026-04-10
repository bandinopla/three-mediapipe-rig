import {
    Category,
    DrawingUtils,
    FaceLandmarker,
	Matrix,
	NormalizedLandmark
} from "@mediapipe/tasks-vision";
import { BufferAttribute, Mesh, Object3D, Vector3, Node, VideoTexture, SRGBColorSpace, MeshPhysicalNodeMaterial, UniformNode, NodeMaterial, Matrix4 } from "three/webgpu";
import { Tracker } from "./Tracker";
import { rootPosition } from "./util/getRootPosition";
import { getBoneByName } from "./util/getBoneByName";
import { lookAt } from "./util/lookAt";
import { attribute, float, instancedArray, mix, positionLocal, select, texture, uniform, varying, vec2, vec3 } from "three/tsl";  
import { createFaceLandmarksIndexAttribute, FACE_LANDMARKS_COUNT } from "./util/face-tracker-utils";



export type FaceTrackerConfig = {
	modelPath?: string,
	videoElementRef?:()=>HTMLVideoElement|undefined,
	drawLandmarks?:boolean
}

export async function loadFaceTracker(vision: any, cfg?: FaceTrackerConfig ) {
    const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: cfg?.modelPath ?? "face_landmarker.task",
			delegate: "GPU", 
        },
		outputFaceBlendshapes: true,
		outputFacialTransformationMatrixes: true,
        runningMode: "VIDEO",
		numFaces: 1,
    });

	return new FaceTracker(faceLandmarker, { ...cfg});
}

/**
 * @see https://storage.googleapis.com/mediapipe-assets/documentation/mediapipe_face_landmark_fullsize.png
 * @see https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model_uv_visualization.png
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
 
export class FaceTracker extends Tracker<typeof faceMarks> {
	private blendshapeCategories: Category[] | undefined;
	private blendshapeMap: Map<string, number> = new Map();
	private smoothed: Record<string, number> = {};
	private smoothing =.0003; // lower = smoother but more lag, higher = more responsive
	private _faceLandmarks: NormalizedLandmark[] = [];
	private _facialTransformationMatrix: Matrix4 | undefined; 

	constructor(private faceLandmarker: FaceLandmarker, private cfg:FaceTrackerConfig) {
		super(faceMarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION)

		this.root.scale.y*=-1
		this.root.scale.z*=-1
		this.root.scale.multiplyScalar(3)
	}

	override predict(frame: TexImageSource, drawingUtils: DrawingUtils) {
		const result = this.faceLandmarker.detectForVideo(frame, performance.now());
		if (result.faceLandmarks[0]) {

			if( this.cfg.drawLandmarks ){
				drawingUtils.drawConnectors(result.faceLandmarks[0], FaceLandmarker.FACE_LANDMARKS_TESSELATION, { color: "#00fff2ff", lineWidth: .1 });
				drawingUtils.drawLandmarks(result.faceLandmarks[0], { color: "#00ff00", lineWidth: .1, radius: .4 });	
			}

			this.updateLandmarks(result.faceLandmarks[0], result.faceLandmarks[0] );

			this._faceLandmarks = result.faceLandmarks[0];

			if(!this._facialTransformationMatrix )
			{
				this._facialTransformationMatrix = new Matrix4();
			}
			
			const m = result.facialTransformationMatrixes[0];

			this._facialTransformationMatrix.set(
				m.data[0],  m.data[1],  m.data[2],  m.data[3],
				m.data[4],  m.data[5],  m.data[6],  m.data[7],
				m.data[8],  m.data[9],  m.data[10], m.data[11],
				m.data[12], m.data[13], m.data[14], m.data[15]
			); 
		}  

		this.blendshapeCategories = result.faceBlendshapes?.[0]?.categories; 

		this.blendshapeCategories?.forEach((category) => {
			this.blendshapeMap.set(category.categoryName, category.score);
		});
		
	}

	get lastKnownLandmarks() {
		return this._faceLandmarks;
	}

	/**
	 * this matrix is useful to know how the canonical mesh is rotated.
	 * This allows to move other objects to simulate the same transformation that the skull/face is having.
	 * Used for things like hats, glasses, etc... things you want to make look like they are attatched to the face mesh.
	 */
	get lastKnownFacialTransformationMatrix() {
		return this._facialTransformationMatrix;
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

	/**
	 * The mesh is assumed to be a canonical_face_model because we will be manipulating it's vertices.
	 * 
	 * @see https://github.com/google-ai-edge/mediapipe/tree/master/mediapipe/modules/face_geometry
	 * @param mesh basically either the original or a clone of the canonical_face_model
	 * @returns an object with a disposeMaterial method that should be called when the mesh is disposed of.
	 */
	bindGeometry( mesh:Mesh, setupTheMaterialYourself?:( posNode:Node<"vec3">, colorNode:Node<"vec4"> )=>void )
	{ 
		const A = new Vector3();
		const B = new Vector3();
		const C = new Vector3();
		const D = new Vector3();

		const geometry = mesh.geometry;
        const posAttr = geometry.attributes.position; 

		/// 209  429

		//
		// The provided cannonical face by google has the origin of the mesh at a plaze that doesn't match the origin
		// used by the faceLandmarks.z. Based on observation and testing i've noticed:
		// the half point of this segment is the one that the landmarks Z use as origin (z=0) or at least they match visually...
		//
		const originA = 209;
		const originB = 429;

		const origin = uniform(new Vector3().addVectors(
			new Vector3(posAttr.getX(originA), posAttr.getY(originA), posAttr.getZ(originA)),
			new Vector3(posAttr.getX(originB), posAttr.getY(originB), posAttr.getZ(originB))
		).multiplyScalar(.5));
 

		//const center = uniform(new Vector3(0.5, 0.5, 0.5));

		createFaceLandmarksIndexAttribute(mesh);

		const landmarkIndexAttr = attribute("landmarkIndex", "float").toUint();;
		const landmarkStore = instancedArray(FACE_LANDMARKS_COUNT, "vec3");

		const sampleUV = varying( landmarkStore.element(landmarkIndexAttr) ).xy;
		let video:HTMLVideoElement|undefined;

		// scale reference is a distance between 2 points in the face that is used to make everything relative to that
		// so we can have a way to obtain the scale of the face regardless of how far or close the face is from camera.
		const scaleRefIndexA = 116;
		const scaleRefIndexB = 346;

		// the length of A to B
		const meshFaceReference = C.subVectors(
			new Vector3(posAttr.getX(scaleRefIndexA), posAttr.getY(scaleRefIndexA), posAttr.getZ(scaleRefIndexA)),
			new Vector3(posAttr.getX(scaleRefIndexB), posAttr.getY(scaleRefIndexB), posAttr.getZ(scaleRefIndexB))
		).lengthSq(); 

		//console.log("# mesh face reference (live): ", meshFaceReference);

		const geometryScaleReference = uniform(meshFaceReference);
		const landmarkScaleReference = uniform(1); // will be calculated below in the "update" function, on every frame.

		
		let disposeMaterial:VoidFunction|undefined;

		return {

			/**
			 * Disposes of the material and removes events listeners on the video element.
			 */
			disposeMaterial: () => {
				disposeMaterial?.();
			},

			/**
			 * asas
			 * @param delta asas
			 * @returns 
			 */
			update: ( delta:number ) => {
				if( !video )
				{
					const currentVideo = this.cfg?.videoElementRef?.();
					if (!currentVideo || !currentVideo.videoWidth || !currentVideo.videoHeight) return;
					video = currentVideo;

					

					const tex = new VideoTexture(video); 
						  tex.colorSpace = SRGBColorSpace; 
						  

					const videoRatio = uniform( video.videoWidth / video.videoHeight ); 

					const landmarkScaleReference = landmarkStore.element( scaleRefIndexB )
						.sub( landmarkStore.element( scaleRefIndexA ) ) 
						.lengthSq();

					const ratio = geometryScaleReference.div(landmarkScaleReference).sqrt()//.mul(2);


					const A1 = landmarkStore.element(234).xy;
					const A2 = landmarkStore.element(93).xy;
					const B1 = landmarkStore.element(454).xy;
					const B2 = landmarkStore.element(323).xy; 

					const A = A1.sub(A2).div(2).add(A2);
					const B = B1.sub(B2).div(2).add(B2);

					//
					// center / pivot point to use by the landmarks...
					//
					const center = B.sub(A).div(2).add(A);

					
					// ionitialize material
					const mediapipePosition = landmarkStore.element(landmarkIndexAttr).sub(center).xzy .mul(vec3( 1,-1, float(1).div(videoRatio) )).mul(ratio).add(origin);
					const positionNode = select( landmarkIndexAttr.toUint().lessThanEqual(FACE_LANDMARKS_COUNT), mediapipePosition, positionLocal)


					const colorNode = texture(tex, vec2( sampleUV.x, sampleUV.y.oneMinus())); 

					/**
					 * called when the video.src changes
					 */
					const onVideoSourceChanged = ()=>{

						const tex = new VideoTexture(video); 
						  	  tex.colorSpace = SRGBColorSpace;

						colorNode.value = tex;
						colorNode.needsUpdate = true;

						videoRatio.value = video!.videoWidth / video!.videoHeight; 
					}

					video.addEventListener("loadeddata", onVideoSourceChanged );

					if( setupTheMaterialYourself )
					{
						setupTheMaterialYourself(positionNode, colorNode);
					}
					else 
					{
						mesh.material = new MeshPhysicalNodeMaterial({  

							positionNode,
							colorNode,
							roughness:0.93

						});
					}

					disposeMaterial = () => {
						(colorNode.value as VideoTexture).dispose();
						video?.removeEventListener("loadeddata", onVideoSourceChanged );
						(mesh.material as NodeMaterial)?.dispose();
					}
				}

				const landmarks = this.lastKnownLandmarks;
				if( !landmarks?.length ) return; 
				

				//
				// distance used to "normalize" the face's vertices against a known reference value.
				//
				landmarkScaleReference.value = C.subVectors(landmarks[scaleRefIndexB], landmarks[scaleRefIndexA]).lengthSq();
				landmarkScaleReference.needsUpdate = true;

				const data = landmarkStore.value.array ;

				//
				//  upload the landmarks
				//
				for (let i = 0; i < landmarks.length; i++) {
					data[i * 3] = landmarks[i].x ;
					data[i * 3 + 1] = landmarks[i].y ;
					data[i * 3 + 2] = landmarks[i].z ;
				}

				landmarkStore.value.needsUpdate = true;
  
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
