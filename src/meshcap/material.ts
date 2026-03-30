import { Mesh, Texture } from "three";
import { MCapClip } from "./types";
import { MeshPhysicalNodeMaterial, NodeMaterial, Vector3 } from "three/webgpu"; 
import { attribute, float, instancedArray, select, texture, uniform, varying, vec3 } from "three/tsl";
import { createFaceLandmarksIndexAttribute, FACE_LANDMARKS_COUNT } from "../tracking/util/face-tracker-utils"; 
import { createAudioAtlasPlayer } from "./audio";

 

export type MeshCapMaterialHandler = {

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
	for (let i=0; i<clips.length; i++) {
		const clip = clips[i];
		clipInfo.push(cropRectIndex, landmarksIndex, clip.frames.length, clip.fps);
		cropRectIndex += clip.frames.length;
		landmarksIndex += clip.frames.length * FACE_LANDMARKS_COUNT; 
		clipAspect.push(clip.aspectRatio); 
		clipFramesStartIndex.push( i==0? 0 : clipFramesStartIndex[i-1] + clips[i-1].frames.length );
	}
 
	const clipAspectRatioNode = instancedArray(new Float32Array(clipAspect), "float");
	const clipInfoNode = instancedArray(new Uint32Array(clipInfo), "uvec4");

	//
	// uv coords for each frame in the atlas
	// 
	const cropRects = new Float32Array( clips.flatMap(clip=>clip.frames).reduce( (acc, entry) => {
		acc.push(entry.frameUV.u, entry.frameUV.v, entry.frameUV.w, entry.frameUV.h);
		return acc;
	}, [] as number[] ) );

	const cropRectsNode = instancedArray(cropRects, "vec4");

	//
	// landmarks cropped UVs coords ( in the same space as the normalized landmarks )
	//
	const landmarksCropUvs = new Float32Array( clips.flatMap( clip => clip.frames.flatMap( frame=>[frame.cropUV.u, frame.cropUV.v, frame.cropUV.w, frame.cropUV.h]) ) );
	const landmarksCropUvsNode = instancedArray(landmarksCropUvs, "vec4");

	//
	// LANDMARKS_COUNT landmarks per frame
	//
	const landmarks = new Float32Array( clips.flatMap( clip => clip.landmarks.flatMap( marks=>marks.flatMap( m=>[m.x, m.y, m.z]) ) ) );
	//const totalFrames = clips.reduce((acc, clip) => acc + clip.frames.length, 0);
 
 
	const landmarkStore = instancedArray(landmarks, "vec3");

	
	const atlasNode = texture(atlasTexture);


	const clipIndex = uniform(0);
	const clipFrame = uniform(0);
	// const totalTime = uniform(0); 
	const loop = uniform(true);

	const clipAspectRatio = clipAspectRatioNode.element(clipIndex);

	// const clipFPS = clipInfoNode.element(clipIndex).w;
	// const clipTotalFrames = clipInfoNode.element(clipIndex).z;  

	//
	// convertine the time passed to the frame equivalent in this clip ( taking into acount the FPS )
	//
	//const timeToFrame = totalTime.mul(clipFPS).floor().toUint(); 
 
	//
	// if loop is false and we are past the end of the clip, clamp to the last frame
	// otherwise wrap around
	//
	// const _clipFrame = select(
	// 	loop.not().and(timeToFrame.greaterThanEqual(clipTotalFrames)), // no loop + past end
	// 	clipTotalFrames.sub(1),                                        // → clamp to last frame
	// 	timeToFrame.mod(clipTotalFrames)                               // → wrap around
	// );

	/**
	 * this array holds per clip how many frame data was before it.
	 */
	const clipFramesStartIndexStore = instancedArray(new Uint32Array(clipFramesStartIndex), "uint");

	/**
	 * Frame index inside of the clip's timeline
	 */
	const clipFrameIndex = clipFrame;

	/**
	 * Frame index in the main timeline that contains every clip in a sequence
	 */
	const timelineFrameIndex = clipFramesStartIndexStore.element(clipIndex).add(clipFrameIndex);


	const cropRect = cropRectsNode.element(clipInfoNode.element(clipIndex).x.add(clipFrameIndex));
	const clipLandmarksStartIndex = clipInfoNode.element(clipIndex).y.add(clipFrameIndex.mul(FACE_LANDMARKS_COUNT)); 
 


	//
	// a map of each vertex to its corresponding landmark index
	//
	const landmarkIndexAttr = attribute("landmarkIndex", "uint").toUint();


	const landmarkIndex = clipLandmarksStartIndex.add( landmarkIndexAttr )
	const currentLandmark = landmarkStore.element(landmarkIndex);
	const currentLandmarksCropCoords = landmarksCropUvsNode.element(timelineFrameIndex);

	const uvToUse = currentLandmark.xy.sub(currentLandmarksCropCoords.xy).div(currentLandmarksCropCoords.zw) // .sub( currentLandmarksCropCoords.xy ).mul( currentLandmarksCropCoords.zw  ) ;
	
	const flippedUv = uvToUse //vec2( uvToUse.x, uvToUse.y.mul( float(1).div(clipAspectRatio) ));
 
	const sampleUV = varying( cropRect.xy.add(flippedUv.mul(cropRect.zw)) ) ;
 

	const colorNode = texture(atlasNode, sampleUV );

	host.colorNode = colorNode ;

	//
	
	const A1 = landmarkStore.element(clipLandmarksStartIndex.add(234)).xy;
	const A2 = landmarkStore.element(clipLandmarksStartIndex.add(93)).xy;
	const B1 = landmarkStore.element(clipLandmarksStartIndex.add(454)).xy;
	const B2 = landmarkStore.element(clipLandmarksStartIndex.add(323)).xy; 

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

	const geometryScaleReference = uniform(meshFaceReference);
 
	

	const landmarkScaleReference = landmarkStore.element(clipLandmarksStartIndex.add(scaleRefIndexB))
						.sub( landmarkStore.element(clipLandmarksStartIndex.add(scaleRefIndexA)) ) 
						.lengthSq();

	const ratio = geometryScaleReference.div(landmarkScaleReference).sqrt().mul(2);

	const positionNode = currentLandmark.sub(center).xzy .mul(vec3( 1,-1, float(1).div(clipAspectRatio) )).mul(ratio);
	
	host.positionNode = positionNode;  

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

	const handler:MeshCapMaterialHandler = {
		muted:false,
		clips,
		atlasTexture,
		material:host,
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