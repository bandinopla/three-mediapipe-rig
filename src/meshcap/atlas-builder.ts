import { Texture, TextureLoader } from "three";
import { MeshCapAtlas, MCapClip, RecordedClip, UVCoord } from "./types";
import { atlasToMCap } from "./write-mcap-file";
 

interface Shelf {
    y: number;
    height: number;
    currentX: number;
}

interface Item {
    id: number;
    width: number;
    height: number;
}

interface PackedItem extends Item {
    x: number;
    y: number;
}

/**
 * Pack shelves aiming for a square-ish output.
 * If atlasWidth is provided, uses it. Otherwise computes optimal width
 * to make the result as square as possible.
 */
function packShelves(
    items: Item[], 
): { packed: PackedItem[]; width: number; height: number } {
    
    // Calculate optimal atlas width if not provided
    const targetWidth = computeOptimalWidth(items);
    
    const shelves: Shelf[] = [];
    const packed: PackedItem[] = [];
    let currentY = 0;

    // Sort by height descending for better shelf packing
    const sorted = [...items].sort((a, b) => b.height - a.height);

    for (const item of sorted) {
        let placed = false;

        // Try to fit in an existing shelf
        for (const shelf of shelves) {
            if (item.width <= targetWidth - shelf.currentX && item.height <= shelf.height) {
                packed.push({
                    ...item,
                    x: shelf.currentX,
                    y: shelf.y,
                });
                shelf.currentX += item.width;
                placed = true;
                break;
            }
        }

        // Create new shelf if needed
        if (!placed) {
            const newShelf: Shelf = {
                y: currentY,
                height: item.height,
                currentX: item.width,
            };
            shelves.push(newShelf);
            packed.push({
                ...item,
                x: 0,
                y: currentY,
            });
            currentY += item.height;
        }
    }

    // Calculate actual bounds
    const actualWidth = shelves.length > 0 
        ? Math.max(...shelves.map(s => s.currentX)) 
        : 0;
    const actualHeight = currentY;

    return {
        packed,
        width: Math.max(actualWidth, targetWidth),
        height: actualHeight,
    };
}

/**
 * Compute optimal width to achieve ~square aspect ratio.
 * Uses total area to estimate: width ≈ height, so width ≈ sqrt(totalArea)
 */
function computeOptimalWidth(items: Item[]): number {
    if (items.length === 0) return 1;

    const totalArea = items.reduce((sum, item) => sum + item.width * item.height, 0);
    
    // Target: width ≈ height, so width * height = totalArea
    // If width ≈ height, then width² ≈ totalArea → width ≈ sqrt(totalArea)
    let optimalWidth = Math.ceil(Math.sqrt(totalArea));
    
    // Ensure we can fit the widest item
    const maxItemWidth = Math.max(...items.map(i => i.width));
    optimalWidth = Math.max(optimalWidth, maxItemWidth);
    
    // Round up to a nice power-of-2 or multiple for texture optimization (optional)
    optimalWidth = nextPowerOf2(optimalWidth);
    
    return optimalWidth;
}

// Optional: round to next power of 2 (good for GPU textures)
function nextPowerOf2(n: number): number {
    return Math.pow(2, Math.ceil(Math.log2(n)));
}


const footerHeight = 20;

/**
 * Builds a texture atlas from a list of recorded clips.
 * @param clips The clips to build the atlas from
 * @param atlasSize Max size of the atlas (width or height)
 * @param padding The padding to add between frames
 * @returns The atlas
 */
export function buildMeshCapAtlas( clips:RecordedClip[], atlasSize:number, padding:number=0 ):MeshCapAtlas {

	//
	// flat all frames
	//
    const canvases = clips.flatMap( (clip)=>clip.frames.map((frame)=>frame.canvas) ); 

	// Prepare items with padding applied
    const items = Array.from(canvases.entries()).map(([id, canvas]) => ({
        id, // index of the frame after all the frames from all the clips have been flattened
        width: canvas.width + padding * 2,
        height: canvas.height + padding * 2,
    }));

	/**
	 * pack the frames into shelves
	 */
	const packed = packShelves(items );

	// Calculate total height needed
    const initialHeight = packed.height //Math.max(...packed.map(p => p.y + p.height)) + footerHeight;
    const initialWidth = packed.width //atlasSize;

    // determine scale to fit within atlasSize
    const scale = Math.min(1.0, atlasSize / initialWidth, atlasSize / initialHeight);
    const atlasWidth = Math.floor(initialWidth * scale);
    const atlasHeight = Math.floor(initialHeight * scale)+footerHeight;

	// Create the atlas canvas
    const atlasCanvas = document.createElement('canvas');
    atlasCanvas.width = atlasWidth;
    atlasCanvas.height = atlasHeight;
    const ctx = atlasCanvas.getContext('2d')!;

	//background black
	ctx.fillStyle = "#000000";
	ctx.fillRect(0, 0, atlasCanvas.width, atlasCanvas.height);

    // Draw all canvases into the atlas
    const entries :UVCoord[] = [];

    for (const pack of packed.packed) {
        const sourceCanvas = canvases[ pack.id ];
        const x = pack.x + padding;
        const y = pack.y + padding;
        const width = sourceCanvas.width;
        const height = sourceCanvas.height;

        ctx.drawImage(sourceCanvas, x * scale, y * scale, width * scale, height * scale);

		//
		// store normalized coordinates of each frame relative to the atlas
		//
        entries[ pack.id ] = { 
            u: (x * scale) / atlasWidth, 
            v: (y * scale) / atlasHeight, 
            w: (width * scale) / atlasWidth, 
            h: (height * scale) / atlasHeight 
        };  
    }

	// create the mcap clips
	const mcapClips:MCapClip[] = [];
	let frameIndex = 0;

	for( const clip of clips ){
		const mcapClip:MCapClip = {
			...clip,
			frames:[]
		};
		for( const frame of clip.frames ){
			mcapClip.frames.push({
				frameUV:entries[ frameIndex++ ],
				cropUV:frame.cropUV,
				startTime:frame.startTime,
				transformMatrix:frame.transformMatrix
			});
		}
		mcapClips.push(mcapClip);
	}

	// write in the atlas a signature that says: "by bandinopla"
	ctx.font = `${Math.max(6, Math.floor(12 ))}px monospace`; 
	ctx.fillStyle = "#ff0000";
	ctx.fillText("Created with MeshCap : https://bandinopla.github.io/three-mediapipe-rig/?editor=meshcap", 0, atlasHeight - 4);

	//-------------------
 


    return { 
		canvas: atlasCanvas, 
		clips:mcapClips,
		padding,
		atlasSize,
		async save(downloadFile:boolean){
			const binBlob = await atlasToMCap( this );
			if( downloadFile ){
				const binUrl = URL.createObjectURL(binBlob);
				const binLink = document.createElement('a');
				binLink.href = binUrl;
				binLink.download = `atlas.mcap`; // custom extension
				binLink.click();
				URL.revokeObjectURL(binUrl);
				binLink.remove();
			}
			return binBlob;
		},
		async saveImageAtlas( phrase?:string, asJpg?:boolean ) {
	        const link = document.createElement("a");
	        link.download = asJpg ? "atlas.jpg" : "atlas.png";

			let canvas = this.canvas;

			if( phrase )
			{
				return await downloadObfuscatedCanvas(canvas, phrase, asJpg);
			}

	        link.href = canvas.toDataURL( asJpg? "image/jpeg" : "image/png", asJpg?0.8:1 );
	        link.click();
		}
	};
}

function xorBuffer(buffer: ArrayBuffer, pass: string) {
	const data = new Uint8Array(buffer);

	// simple key from passphrase
	let key = 0;
	for (let i = 0; i < pass.length; i++) {
		key = (key + pass.charCodeAt(i)) & 255;
	}

	// XOR
	for (let i = 0; i < data.length; i++) {
		data[i] ^= key;
	}

	return data;
}
 
async function downloadObfuscatedCanvas(canvas: HTMLCanvasElement, pass: string, asJpg?:boolean) {
	const blob = await new Promise<Blob>((res) => canvas.toBlob(res as any, asJpg? "image/jpeg" : "image/png", asJpg?0.8:1));
	const buffer = await blob!.arrayBuffer();
	const data = xorBuffer(buffer, pass); 

	const outBlob = new Blob([data], { type: "application/octet-stream" });
	const url = URL.createObjectURL(outBlob);

	const a = document.createElement("a");
	a.href = url;
	a.download = "atlas.mcatlas";
	a.click();

	URL.revokeObjectURL(url);
}

/**
 * Load an atlas from a URL or File. If will handle deobfuscation if the file is an .mcapatlas file.
 * @param atlasSource URL or File of the atlas. If it is an .mcapatlas file, it will be deobfuscated.
 * @param pass If the atlas is obfuscated, provide the passphrase to deobfuscate it.
 * @returns 
 */
export async function loadMeshcapAtlas( atlasSource:string|File, pass?:string ) 
{ 
	if (typeof atlasSource === "string") {

		if( atlasSource.endsWith(".mcatlas") ){
			const response = await fetch(atlasSource);
			const buffer = await response.arrayBuffer();
			return await deObfuscate(buffer, pass!);
		}
		else 
		{
			return new TextureLoader().loadAsync(atlasSource);
		}

		
	} else { 

		if( atlasSource.name.endsWith(".mcatlas") ){

			return new Promise<Texture<HTMLImageElement>>((resolve, reject) => {
					const reader = new FileReader();
					reader.onload = (e) => {
						const buffer = e.target!.result as ArrayBuffer;

						resolve( deObfuscate(buffer,pass!) ) 
					}
					reader.onerror = (e) => {
						reject(e);
					}
					reader.readAsArrayBuffer(atlasSource);
			}) ;
			
		}

		const url = URL.createObjectURL(atlasSource);

		return await new Promise<Texture<HTMLImageElement>>((resolve, reject) => {
			new TextureLoader().load(url, resolve, undefined, reject);
		});
	}
}
 

async function deObfuscate(buffer: ArrayBuffer, pass: string) {

	if(!pass){
		throw new Error("No passphrase provided");
	}

	const data = xorBuffer(buffer, pass); 
 
	const blob = new Blob([data], { type: "image/png" });
	const url = URL.createObjectURL(blob);

	const image = document.createElement("img");

	await new Promise<void>((resolve, reject) => {
		image.onload = () => resolve();
		image.onerror = reject;
		image.src = url;
	});

	const texture = new Texture(image);
	texture.needsUpdate = true;

	//URL.revokeObjectURL(url); 

	return texture;
}


export async function obfuscateImage(image:HTMLImageElement, pass:string) {
	const canvas = document.createElement('canvas');
	canvas.width = image.width;
	canvas.height = image.height;
	const ctx = canvas.getContext('2d')!;
	
	ctx.drawImage(image, 0, 0);

	const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
		canvas.toBlob(jpgBlob => { 

			if(!jpgBlob){
				reject(new Error("Failed to create blob"));
				return;
			} 

			resolve(jpgBlob.arrayBuffer());

		}, 'image/jpeg', 0.75);
	});

	const data = xorBuffer(buffer, pass);

	return new Blob([data], { type: "application/octet-stream" });
	
}