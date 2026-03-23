import { Vector3Like } from "three"



export interface UVCoord {u:number,v:number,w:number,h:number}

export interface Clip  {
	fps:number,
	name:string,
	landmarks:Vector3Like[][], 
	scale:number
	aspectRatio:number, 
}


export interface RecordedClip extends Clip {
	frames:{ canvas:HTMLCanvasElement, cropUV: UVCoord }[],
}

export interface MCapClip extends Clip {
	frames: { cropUV:UVCoord, frameUV:UVCoord }[]
}

export interface MCapFile {
	clips: MCapClip[];
	version: number;
	atlasSize:number,
	atlasPadding:number,

	/**
	 * Extract the clips from the atlas image using the metadata as a guide to know where the clips are.
	 * @param atlas 
	 */
	unpackClips: (atlas:File|string|HTMLImageElement|HTMLCanvasElement)=>Promise<RecordedClip[]>;
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
	 * 
	 */
	save( downloadFile:boolean ):Promise<Blob>
}