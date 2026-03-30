import { Mesh, Texture, Vector3Like } from "three"
import { AudioSpriteAtlas } from "./audio"
import { MeshCapMaterialHandler } from "./material"
import { NodeMaterial } from "three/webgpu"



export interface UVCoord {u:number,v:number,w:number,h:number}

export interface Clip  {
	fps:number,
	name:string,
	landmarks:Vector3Like[][], 
	scale:number
	aspectRatio:number, 
	audioSprite?:{ 
		start:number, 
	}

	/**
	 * Duration of this clip (in seconds)
	 */
	duration:number
}


export interface RecordedClip extends Clip {
	frames:{ canvas:HTMLCanvasElement, cropUV: UVCoord, startTime:number }[],
	audioSprite?:{
		domElement?:HTMLAudioElement,

		/**
		 * Start time in the audio sprite atlas (seconds)
		 */
		start:number, 
	}
}

export interface MCapClip extends Clip {
	frames: { cropUV:UVCoord, frameUV:UVCoord, startTime:number }[]
}

export interface MCapFile {
	clips: MCapClip[];
	version: number;
	atlasSize:number,
	atlasPadding:number,

	/**
	 * Extract the clips from the atlas image using the metadata as a guide to know where the clips are.
	 * If the clips use a sound atlas, and one is provided, their audio clips will be reconstructed.
	 * @param atlas 
	 */
	unpackClips: (atlas:File|string|HTMLImageElement|HTMLCanvasElement, audioFile?:File|Blob|string|ArrayBuffer)=>Promise<{clips:RecordedClip[], audioAtlas?:AudioSpriteAtlas}>;

	/**
	 * Creates a material on the mesh that updates its texture to match the clip frames.
	 * If you pass `audioAtlas`, the handler will play the audio for the clip when it is played.
	 * @param mesh 
	 * @param atlasTexture 
	 * @returns 
	 */
	createMaterialHandlerOnMesh: (mesh:Mesh, atlasTexture:Texture, host?:NodeMaterial, audioAtlas?:AudioBuffer)=>MeshCapMaterialHandler;
} 

export interface MeshCapAtlas {
    canvas: HTMLCanvasElement;

	/**
	 * the index of each will correspond to the provided recorded clip's frames array at the time of creation
	 */
    clips: MCapClip[];

	/**
	 * padding used in the creation of the atlas
	 */
	padding:number

	/**
	 * prefered max atlas dimension
	 */
	atlasSize:number

	/**
	 * 
	 */
	save( downloadFile:boolean ):Promise<Blob>
}