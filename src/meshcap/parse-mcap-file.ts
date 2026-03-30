import { Mesh, Texture, Vector3Like, NodeMaterial} from "three/webgpu";
import { MCapClip, MCapFile, RecordedClip, UVCoord } from "./types";
import { inflate } from "fflate";
import { MCAP_FILE_VERSION, MCAP_MAGIC } from "./constants"; 
import { FACE_LANDMARKS_COUNT } from "../tracking/util/face-tracker-utils";
import { AudioSpriteAtlas, extractAudioSprites } from "./audio";
import { createMeshCapMaterial } from "./material"; 



/**
 * Loads a MeshCap (.mcap) file from a URL or File object. This is the file that contains the metadata for the clips.
 * @param mcapFileSource URL or File object
 * @returns 
 */
export async function loadMeshCapFile( mcapFileSource:string|File ) : Promise<MCapFile> {
	if (typeof mcapFileSource === "string") {
		const response = await fetch(mcapFileSource);
		const buffer = await response.arrayBuffer();
		return deserializeMCapFile(buffer);
	} else {
		return new Promise<MCapFile>((resolve, reject) => {
					const reader = new FileReader();
					reader.onload = (e) => {
						const buffer = e.target!.result as ArrayBuffer;

						resolve( deserializeMCapFile(buffer) ) 
					}
					reader.onerror = (e) => {
						reject(e);
					}
					reader.readAsArrayBuffer(mcapFileSource);
			}) ;
	}
} 


/**
 * Opens and decompresses an MCAP file.
 * @param compressedBuffer 
 * @returns 
 */
async function deserializeMCapFile( compressedBuffer: ArrayBuffer) : Promise<MCapFile> {
    
	let usesAudioAtlas = false;

    // Decompress first
    const decompressed = await new Promise<Uint8Array>((resolve, reject) => {
        inflate(new Uint8Array(compressedBuffer), (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });

    const view = new DataView(decompressed.buffer);
    let offset = 0;

    // --- Header ---
    const magic = view.getUint32(offset); offset += 4;
    if (magic !== MCAP_MAGIC) throw new Error('Invalid file: not a MCAP file');

    const version = view.getUint8(offset); offset += 1;

	//
	// TODO: handle compatibility with older versions
	//
    //if (version !== MCAP_FILE_VERSION) throw new Error(`Unsupported version: ${version} != ${MCAP_FILE_VERSION}`);

    const clipsCount = view.getUint8(offset); offset += 1;
	const atlasSize = view.getUint16(offset); offset += 2;
	const atlasPadding = view.getUint8(offset); offset += 1;

    const clips: MCapClip[] = [];  

    // --- Per clip ---
    for (let i = 0; i < clipsCount; i++) {

        // Name
        const nameLength = view.getUint8(offset); offset += 1;
        const nameBytes = new Uint8Array(decompressed.buffer, offset, nameLength);
        const name = new TextDecoder().decode(nameBytes);
        offset += nameLength;

        const frameCount  = view.getUint8(offset);          offset += 1;
        const fps         = view.getUint8(offset);          offset += 1;
        const scale       = view.getUint8(offset) / 100;    offset += 1;
        const aspectRatio = view.getUint8(offset) / 100;    offset += 1;

        const frameCoords: UVCoord[] = [];
        const landmarks: Vector3Like[][] = [];
        const uvCrop: UVCoord[] = [];

        // --- Per frame ---
        for (let j = 0; j < frameCount; j++) {

            // Atlas coords
            const atlasX      = view.getUint16(offset) / 1000; offset += 2;
            const atlasY      = view.getUint16(offset) / 1000; offset += 2;
            const atlasWidth  = view.getUint16(offset) / 1000; offset += 2;
            const atlasHeight = view.getUint16(offset) / 1000; offset += 2;

            frameCoords.push({ u: atlasX, v: atlasY, w: atlasWidth, h: atlasHeight });

            // Crop UV
            const u = view.getUint16(offset) / 1000; offset += 2;
            const v = view.getUint16(offset) / 1000; offset += 2;
            const w = view.getUint16(offset) / 1000; offset += 2;
            const h = view.getUint16(offset) / 1000; offset += 2;
 
            uvCrop.push({ u, v, w, h });

            // --- Landmarks ---
            const frameLandmarks: Vector3Like[] = [];
            const prevLandmarks = j > 0 ? landmarks[j - 1] : null;

            for (let k = 0; k < FACE_LANDMARKS_COUNT; k++) {
                if (prevLandmarks === null) {
                    // First frame — absolute Uint16
                    const x = view.getUint16(offset) / 1000; offset += 2;
                    const y = view.getUint16(offset) / 1000; offset += 2;
                    const z = view.getInt16(offset)  / 1000; offset += 2;
                    frameLandmarks.push({ x, y, z });
                } else {
                    // Delta frames — Int8
                    const dx = view.getInt8(offset) / 1000; offset += 1;
                    const dy = view.getInt8(offset) / 1000; offset += 1;
                    const dz = view.getInt8(offset) / 1000; offset += 1;
                    frameLandmarks.push({
                        x: prevLandmarks[k].x + dx,
                        y: prevLandmarks[k].y + dy,
                        z: prevLandmarks[k].z + dz,
                    });
                }
            }

            landmarks.push(frameLandmarks);
        }
  
		/**
		 * Default startTime in case someone opens a version 1 file...
		 */ 

        clips.push({ 
			name, 
			fps, 
			scale, 
			aspectRatio, 
 
			frames: uvCrop.map( (cropUV, i)=>({ 
				cropUV, 
				frameUV: frameCoords[i],
				startTime: i / fps //<-- default for versions sub 2...
			})), 

			landmarks ,
			duration: frameCount / fps // default for versions sub 2...
		}); 
    }

	if( version>=2 )
	{
		// -- extract audio sprites --
		for(let i=0; i<clips.length; i++){
			let clipDuration = view.getUint16(offset); offset += 2;

			clips[i].duration = clipDuration / 1000;

			let audioStart = view.getUint16(offset); offset += 2;

			if( audioStart===1 )
			{ 
				// this clip has no audio
				console.log("Clip " + i + " has no audio");
			}
			else 
			{
				audioStart /= 1000; 

				clips[i].audioSprite = { start: audioStart };
				usesAudioAtlas = true; 
			} 
		}

		// -- extract frame deltas --
		for(let i=0; i<clips.length; i++)
		{
			const clipInfo = clips[i];
			let lastTimestamp = 0;
			for(let j=0; j<clipInfo.frames.length; j++)
			{
				const delta = view.getUint8(offset); offset += 1;
				const timestamp = lastTimestamp + delta / 1000;
				clipInfo.frames[j].startTime = timestamp;
				lastTimestamp = timestamp;
			}
		}
	}
	

    return { 
		clips, 
		version,
		atlasSize,
		atlasPadding,

		
		unpackClips: async ( atlasSource:File|Blob|string|HTMLImageElement|HTMLCanvasElement, audioAtlasSource?:File|Blob|string|ArrayBuffer ) => {
 
			let atlas:HTMLCanvasElement;
			let disposeAfter = true; 
			let audioAtlas:AudioSpriteAtlas|undefined = undefined;

			if (atlasSource instanceof HTMLCanvasElement) 
			{
				disposeAfter = false;
				atlas = atlasSource;
			} 
			else 
			{ 
				let img = new Image();

				if (typeof atlasSource === "string") { 
					img.src = atlasSource; 
				} 
				
				else if (atlasSource instanceof File || atlasSource instanceof Blob) 
				{
					const url = URL.createObjectURL(atlasSource);
					img.src = url;
					await new Promise<void>((resolve, reject) => {
						img.onload = () => {
							URL.revokeObjectURL(url);
							resolve()};
						img.onerror = reject;
					});
				} 
				else if (atlasSource instanceof HTMLImageElement) {
					img = atlasSource;
				} 

				if( !img.complete || !img.naturalWidth )
				{
					await new Promise<void>((resolve, reject) => {
						img.onload = () => resolve();
						img.onerror = reject;
					});
				}

				atlas = document.createElement('canvas');
				atlas.width = img.width;
				atlas.height = img.height;
				const ctx = atlas.getContext('2d')!;
				ctx.drawImage(img, 0, 0);   
			}

			
			const recordedClips = clips.map<RecordedClip>( clip => {
				
				return {
					...clip,
					frames: clip.frames.map( frame => {
						
						const frameCanvas = document.createElement("canvas");
						frameCanvas.width = frame.frameUV.w * atlas.width;
						frameCanvas.height = frame.frameUV.h * atlas.height;
						const frameCtx = frameCanvas.getContext("2d")!;
						frameCtx.drawImage(
							atlas,
							frame.frameUV.u * atlas.width,
							frame.frameUV.v * atlas.height,
							frame.frameUV.w * atlas.width,
							frame.frameUV.h * atlas.height,
							0,
							0,
							frameCanvas.width,
							frameCanvas.height
						);
						
						return { 
							canvas: frameCanvas,
							cropUV: frame.cropUV, 
							startTime: frame.startTime, 
						};
					})
				};
			});

			if( disposeAfter )
			{
				atlas.remove();
			}

			if( usesAudioAtlas )
			{
				if(!audioAtlasSource) {
					console.warn("This mcap file uses an audio atlas, but no audio atlas file was provided.");
				}
				else 
				{
					audioAtlas = await extractAudioSprites(audioAtlasSource, recordedClips);
				}
			}

			return {
				clips: recordedClips,
				audioAtlas
			};
		},

		createMaterialHandlerOnMesh: (mesh:Mesh, atlasTexture:Texture, host?:NodeMaterial, audioAtlas?:AudioBuffer )=>{
			const handler = createMeshCapMaterial(atlasTexture, clips, mesh, host, audioAtlas);
			return handler;
		}
	};
}