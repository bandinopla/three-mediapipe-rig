import { Mesh, Texture, Vector3Like } from "three"
import { AudioSpriteAtlas } from "./audio"
import { MeshCapMaterialHandler } from "./material"
import { Matrix4, NodeMaterial } from "three/webgpu"



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


export type FrameBase = {

	/**
	 * This is the bounding box in atlas UV space in which the landmarks are expressed.
	 */
	cropUV: UVCoord, 
	startTime:number, 

	/**
	 * The general transformation of the face in this frame.
	 */
	transformMatrix?:Matrix4 
}

export interface RecordedClip extends Clip {
	frames:(FrameBase & { 
		canvas:HTMLCanvasElement,  
	})[],
	audioSprite?:{
		domElement?:HTMLAudioElement,

		/**
		 * Start time in the audio sprite atlas (seconds)
		 */
		start:number, 
	}
}

export interface MCapClip extends Clip {
	frames: (FrameBase & { 
		frameUV:UVCoord, 
	})[]
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
	 * Save the cuyrrent meshcap as a .mcap file.
	 * @param downloadFile If true, the file will be downloaded to the user's computer.
	 * @returns 
	 */
	save( downloadFile:boolean ):Promise<Blob>

	/**
	 * Triggers a download of the atlas texture
	 * @param phrase Optional phrase to use to perform a simple obfuscation of the texture.
	 * 			If the phrase is not provided, the atlas will not be obfuscated. If you use one, you will have to provide it once again on your app or game when you try to load it calling `createMaterialHandlerOnMesh` by defining the `onAtlasKeyPhraseRequired` hook, which is a functionthat should return the phrase.
	 */
	saveImageAtlas( phrase?:string, asJpg?:boolean ):Promise<void>
}