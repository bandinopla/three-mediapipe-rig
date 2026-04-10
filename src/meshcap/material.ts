import { Mesh, Texture } from "three";
import { MCapClip } from "./types";
import { DataTexture, Node, FloatType, Matrix4, MeshPhysicalNodeMaterial, NodeMaterial, RGBAFormat, Vector3, NearestFilter } from "three/webgpu"; 
import { attribute, float, instancedArray, nodeObject, positionLocal, select, texture, uniform, varying, vec2, vec3 } from "three/tsl";
import { createFaceLandmarksIndexAttribute, FACE_LANDMARKS_COUNT } from "../tracking/util/face-tracker-utils"; 
import { createAudioAtlasPlayer } from "./audio";

 

export type MeshCapMaterialHandler = {

	/**
	 * 4x4 transformation matrix from MediaPipe Face tracking.
	 * Represents the face pose in camera space (position, rotation, scale).
	 * Can be applied directly to 3D objects to align them with the tracked face. 
	 * 
	 * Returns the last known face transform matrix.
	 * Everytime you call `update` and the frames get evaluated, this will return the transformMatrix the face has in the
	 * current frame. You can use this to position hats, hair, etc. Remember this transformation is from the face's origin perspective. 
	 * So if you do add a hat, make sure the origin point of it is at the same place as the origin point of the face mesh so the rotations look alright.
	 * @returns 
	 */
	getLastKnownFaceTransform:()=>Matrix4|undefined;

	/**
	 * If it should play a sound or not (if it has one. Default: false )
	 */
	muted:boolean;

	/**
	 * This hook will be called everytime a clip starts playing.
	 * @param clipIndex Index of the clip that is starting to play
	 * @param clipStartTime Start time of sound clip withing the sound atlas (in seconds)
	 * @param clipDuration Duration of the clip (in seconds)
	 * @returns 
	 */
	playClipAudioHook?:(clipIndex:number, clipStartTime:number, clipDuration:number)=>void;
 

	/**
	 * Moves to a particular clip
	 * @param clipIndex The index of the clip to move to
	 * @param _loop Optional: Whether the clip should loop
	 * @param _onEndReached Optional: Callback to be called when the clip reaches the end
	 */
	goto:( clipIndex:number|string, _loop?:boolean, _onEndOrLoopReached?:( timeOffset:number )=>void, playSound?:boolean )=>void

	/**
	 * Play a clip and when it reaches the end, it will loop back
	 * @param clipName Name of the clip
	 * @returns 
	 */
	gotoAndLoop:( clipIndex:number|string, _onLoop?:( timeOffset:number )=>void )=>void

	/**
	 * Play a clip and when it reaches the end, it will not loop back
	 * @param clipName Name of the clip
	 * @returns 
	 */
	gotoAndPlay:( clipIndex:number|string, _onEndReached?:()=>void )=>void

	/**
	 * Moves to a particular clip and stops at the first frame
	 * @param clipIndex The index of the clip to move to
	 * @returns 
	 */
	gotoAndStop:( clipIndex:number|string, frame?:number )=>void

	/**
	 * Updates the material with the given delta time
	 * @param delta The time to add to the current time
	 */
	update:( delta:number )=>void

	/**
	 * The clips available to play
	 */
	clips:MCapClip[]

	/**
	 * The texture atlas that contains the frames used by the clips
	 */
	atlasTexture:Texture

	/**
	 * Disposes the material and the texture atlas
	 */
	dispose:VoidFunction

	/**
	 * The material used
	 */
	material:NodeMaterial
}

/**
 * Creates or setups a MeshCap material handler (not the material itself) for a given mesh.
 * 
 * @param atlasTexture The texture atlas that contains the frames used by the clips. You may need to `flipY=false` on the texture atlas.
 * @param clips The clips previously obtained by loading an .mcap file
 * @param targetMesh The mesh to apply the material to. (It will be updated with a landmarkIndex attribute if it doesn't have one)
 * @param host Optional: The material to use as a base. Defaults to a MeshPhysicalNodeMaterial.
 * @param audioAtlas Optional: The audio atlas that contains the audio for the clips if you want to let the handler play the audio clips automatically on it's own. Else you will have to hook on the `playClipAudioHook` callback from the returned handler and play them yourself.
 * @returns A handler that allows you to control the material.
 */
export function createMeshCapMaterial( atlasTexture:Texture, clips:MCapClip[], targetMesh:Mesh, host?:NodeMaterial, audioAtlas?:AudioBuffer ):MeshCapMaterialHandler 
{
	const addMaterial = !host;

	host ??= new MeshPhysicalNodeMaterial();  

	if( addMaterial )
	{
		targetMesh.material = host;
	}

	if( !targetMesh.geometry.hasAttribute(	"landmarkIndex") )
	{
		createFaceLandmarksIndexAttribute(targetMesh); 
	}

	/**
	 * index...
	 *    - cropRectIndex 
	 *    - landmarksIndex
	 *    - total frames
	 *    - fps
	 */
	const clipInfo:number[] = []
	const clipAspect:number[] = []; 

	/**
	 * Since all the frames are stored one after the other, we need to know the start index of each clip
	 * to calculate the frame index for a given clip.
	 */
	const clipFramesStartIndex:number[] = [];

	let cropRectIndex = 0;
	let landmarksIndex = 0;
	let totalFrames = 0;
	for (let i=0; i<clips.length; i++) {
		const clip = clips[i];
		clipInfo.push(cropRectIndex, landmarksIndex, clip.frames.length, clip.fps);
		cropRectIndex += clip.frames.length;
		landmarksIndex += clip.frames.length * FACE_LANDMARKS_COUNT; 
		totalFrames += clip.frames.length;
		clipAspect.push(clip.aspectRatio); 
		clipFramesStartIndex.push( i==0? 0 : clipFramesStartIndex[i-1] + clips[i-1].frames.length );
	}
 
	const clipAspectRatioNode = instancedArray(new Float32Array(clipAspect), "float");
	//const clipInfoNode = instancedArray(new Float32Array(clipInfo), "vec4") 

	//
	// uv coords for each frame in the atlas
	// 
	const cropRects = new Float32Array( clips.flatMap(clip=>clip.frames).reduce( (acc, entry) => {
		acc.push(entry.frameUV.u, entry.frameUV.v, entry.frameUV.w, entry.frameUV.h);
		return acc;
	}, [] as number[] ) );

	//
	// landmarks cropped UVs coords ( in the same space as the normalized landmarks )
	//
	const landmarksCropUvs = new Float32Array( clips.flatMap( clip => clip.frames.flatMap( frame=>[frame.cropUV.u, frame.cropUV.v, frame.cropUV.w, frame.cropUV.h]) ) );
	

	//
	// crop data
	//
	const frames = clips.flatMap(clip=>clip.frames);

	const cropData = new Float32Array( frames.reduce( (acc, entry) => {

		// frame UV
		acc.push(entry.frameUV.u, entry.frameUV.v, entry.frameUV.w, entry.frameUV.h);
 

		return acc;
	}, [] as number[] ) .concat(
		frames.reduce( (acc, entry) => {
 

			// landmarks cropped UVs coords ( in the same space as the normalized landmarks )
			acc.push(entry.cropUV.u, entry.cropUV.v, entry.cropUV.w, entry.cropUV.h);

			return acc;
		}, [] as number[] )
	)

	);	

	//const cropRectsNode = instancedArray(cropRects, "vec4");

	const CROP_DATA_FRAMEUV_V = 0.25;
	const CROP_DATA_LANDMARKSCROPUV_V = 0.75;

	const cropDataTexture = new DataTexture(
		cropData,
		totalFrames,
		2,
		RGBAFormat,
		FloatType
	);
	cropDataTexture.flipY = false;
	cropDataTexture.magFilter = NearestFilter;
	cropDataTexture.minFilter = NearestFilter;
	cropDataTexture.needsUpdate = true;  

	//
	// LANDMARKS_COUNT landmarks per frame
	//
	const landmarks = new Float32Array( clips.flatMap( clip => clip.landmarks.flatMap( marks=>marks.flatMap( m=>[m.x, m.y, m.z, 0]) ) ) ); 
	//const landmarkStore = instancedArray(landmarks, "vec3");
 

	// Create texture  
	const width = FACE_LANDMARKS_COUNT;
	const height = totalFrames;  

	const landmarkTexture = new DataTexture(
	    landmarks,  
	    width,
	    height,
	    RGBAFormat,
	    FloatType
	);

	landmarkTexture.flipY = false;
	landmarkTexture.magFilter = NearestFilter;
	landmarkTexture.minFilter = NearestFilter;  
	landmarkTexture.needsUpdate = true;
	
	
	const atlasNode = texture(atlasTexture);


	const clipIndex = uniform(0);
	const clipFrame = uniform(0);
	// const totalTime = uniform(0); 
	const loop = uniform(true);

	const clipAspectRatio = clipAspectRatioNode.element(clipIndex);
 

	/**
	 * this array holds per clip how many frame data was before it.
	 */
	const clipFramesStartIndexStore = instancedArray(new Float32Array(clipFramesStartIndex), "float");

	/**
	 * Frame index inside of the clip's timeline
	 */
	const clipFrameIndex = clipFrame;

	/**
	 * Frame index in the main timeline that contains every clip in a sequence
	 */
	const timelineFrameIndex =  clipFramesStartIndexStore.element(clipIndex).add(clipFrameIndex)  ;
 
	const cropRect = texture( cropDataTexture, vec2( timelineFrameIndex.add(0.5).div(totalFrames), CROP_DATA_FRAMEUV_V )) ;
 

	//
	// a map of each vertex to its corresponding landmark index
	//
	const landmarkIndexAttr = attribute("landmarkIndex", "float").toInt();
 

	const landmarkIndex = varying( landmarkIndexAttr ) //clipLandmarksStartIndex.add( landmarkIndexAttr )


	//const currentLandmark = landmarkStore.element(landmarkIndex);
	const getLandmark = ( landmarkIndex:Node|number )=>{

		//return landmarkStore.element(clipLandmarksStartIndex.add( landmarkIndex ));

		const lmIdx = nodeObject(landmarkIndex).toFloat() ;
		const frameIdx = timelineFrameIndex.toFloat().add(0.5);
 
	    const u = lmIdx.div(width).add(0.5 / width);
	    const v = frameIdx.div(height).add(0.5 / height);
 
	    
		// convert from 0-1 to -1 1
		const landmark = texture(landmarkTexture, vec2(u, v));
		return vec3(
			landmark.x ,
			landmark.y ,
			landmark.z 
		);
	}

	const currentLandmark = getLandmark(landmarkIndex);

    const currentLandmarksCropCoords = texture( cropDataTexture, vec2( timelineFrameIndex.add(0.5).div(totalFrames), CROP_DATA_LANDMARKSCROPUV_V )) ;

	const uvToUse = currentLandmark.xy .sub(currentLandmarksCropCoords.xy).div(currentLandmarksCropCoords.zw) ;
	
 
 
	const sampleUV = varying(  cropRect.xy .add(uvToUse.mul(cropRect.zw)) ) ;
 

	const colorNode = texture(atlasNode , sampleUV);

	host.colorNode = colorNode  ; 

	

	
	const A1 = getLandmark(234).xy;
	const A2 = getLandmark(93).xy;
	const B1 = getLandmark(454).xy;
	const B2 = getLandmark(323).xy; 

	const A = A1.sub(A2).div(2).add(A2);
	const B = B1.sub(B2).div(2).add(B2);

	//
	// center / pivot point to use by the landmarks...
	//
	const center = B.sub(A).div(2).add(A);

	const geometry = targetMesh.geometry;
	const posAttr = geometry.attributes.position; 
	const scaleRefIndexA = 116;
	const scaleRefIndexB = 346;

	const meshFaceReference = new Vector3().subVectors(
		new Vector3(posAttr.getX(scaleRefIndexA), posAttr.getY(scaleRefIndexA), posAttr.getZ(scaleRefIndexA)),
		new Vector3(posAttr.getX(scaleRefIndexB), posAttr.getY(scaleRefIndexB), posAttr.getZ(scaleRefIndexB))
	).lengthSq(); 


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


	const geometryScaleReference = uniform(meshFaceReference);
 
	

	const landmarkScaleReference = getLandmark(scaleRefIndexB)
						.sub( getLandmark(scaleRefIndexA) ) 
						.lengthSq();

	const ratio = geometryScaleReference.div(landmarkScaleReference).sqrt(); //.mul(2);

	const positionNode = currentLandmark.sub(center).xzy .mul(vec3( 1,-1, float(1).div(clipAspectRatio) )).mul(ratio).add(origin);
	
	host.positionNode = select( landmarkIndexAttr.toUint().lessThanEqual(FACE_LANDMARKS_COUNT), positionNode, positionLocal)

	let currentClipTotalTime = 0;
	let currentClipTime = 0;
	let currentClip:MCapClip|undefined;
 


	/**
	 * callback called when the clip reaches the end or loops again
	 */
	let currentClipCallback:((offset:number)=>void)|undefined;
	let currentFrames:MCapClip["frames"] = clips[0].frames;
	let _play = false;

	let audiosAtlasHandler = audioAtlas? createAudioAtlasPlayer(audioAtlas, clips):undefined;
	let _lastKnownFaceTransform:Matrix4|undefined = undefined;

	const handler:MeshCapMaterialHandler = {
		muted:false,
		clips,
		atlasTexture,
		material:host,

		getLastKnownFaceTransform:()=>_lastKnownFaceTransform, 

		goto(_clipID:number|string, _loop=true, _onEndReached?:( offset:number )=>void, _playSound=true) {

			let _clipIndex = -1;
			if( typeof _clipID === "number" ){ 
				_clipIndex = _clipID;
			} else { 
				_clipIndex = clips.findIndex( clip => clip.name === _clipID );

				if( _clipIndex === -1 ){
					throw new Error(`Clip ${_clipID.toString()} not found`);
				}
			}

			loop.value = _loop;
			clipFrame.value = 0;
			//totalTime.value = 0;  
			clipIndex.value = _clipIndex;

			const clip = clips[_clipIndex];

			currentClip = clip;
			currentFrames = clip.frames;
			currentClipTotalTime = clip.duration;
			currentClipTime = 0;
			currentClipCallback = _onEndReached;
			_play = true;


			if( audiosAtlasHandler )
			{
				audiosAtlasHandler.stopCurrent();

				if( _playSound && !handler.muted && clip.audioSprite )
				{ 
					audiosAtlasHandler.playSprite(_clipIndex);
					handler.playClipAudioHook?.(_clipIndex, clip.audioSprite.start, clip.duration);
				}
			}
			
		},
		update(delta) { 
			if( !_play ) return;

			//totalTime.value += delta; 
			currentClipTime += delta;

			//
			// go to the right frame ( we assume will always move forward in time )
			//
			clipFrame.value = getFrameAtTime(currentFrames, currentClipTime, clipFrame.value);
		 

			//
			// current orientation of the face at the time of the frame
			//
			_lastKnownFaceTransform = currentFrames[clipFrame.value].transformMatrix; 

			if( loop.value ){
				if( currentClipTime >= currentClipTotalTime ){
					currentClipTime -= currentClipTotalTime;
					clipFrame.value = 0

					// play the clip's sound again because we are looping back

					if( !handler.muted ){ 
						audiosAtlasHandler?.playSprite(clipIndex.value);

						if( currentClip?.audioSprite  )
						{
							handler.playClipAudioHook?.(clipIndex.value, currentClip.audioSprite.start, currentClip.duration);
						}
					}

					currentClipCallback?.(currentClipTime); 
				}
			}
			else 
			{
				if( currentClipTime >= currentClipTotalTime ){
					const callback = currentClipCallback;
					currentClipCallback = undefined;
					callback?.(currentClipTotalTime); 
				}
			}
		},
		dispose() {
			atlasTexture.dispose();
			host.dispose();
		},

		gotoAndLoop( clipID: number|string, _onLoop?:( timeOffset:number )=>void){  
			this.goto(clipID , true, _onLoop);
		},

		gotoAndPlay( clipID: number|string, _onEndReached?:()=>void ){  
			this.goto(clipID, false, _onEndReached);
		},

		gotoAndStop( clipID: number|string, frame=0 ){  
			this.goto(clipID, false, undefined, false); 
			clipFrame.value = frame;
			_play = false;
		},
	};

	return handler;
}

function getFrameAtTime(frames: MCapClip["frames"] , time: number, lastFrameIndex:number): number {
//   let lo = startFrame, hi = frames.length - 1;
//   while (lo < hi) {
//     const mid = (lo + hi + 1) >> 1;
//     if (frames[mid].startTime <= time) lo = mid;
//     else hi = mid - 1;
//   }
//   return lo;
  // scan forward from last known position (common case: O(1))
  while (lastFrameIndex < frames.length - 1 && frames[lastFrameIndex + 1].startTime <= time) {
    lastFrameIndex++;
  }
  return lastFrameIndex;
}