import { MeshCapAtlas, MCapClip, RecordedClip, UVCoord } from "./types";
import { atlasToMCap } from "./write-mcap-file";


interface Shelf {
    y: number;
    height: number;
    currentX: number;
}

/**
 * Simple shelf bin packer algorithm.
 * Sorts items by height (descending) and packs them into shelves.
 */
function packShelves(
    items: { id: number; width: number; height: number }[],
    atlasWidth: number
): { id: number; x: number; y: number; width: number; height: number }[] {
    const shelves: Shelf[] = [];
    const result: { id: number; x: number; y: number; width: number; height: number }[] = [];
    let currentY = 0;

    // Sort by height descending for better packing
    const sorted = [...items].sort((a, b) => b.height - a.height);

    for (const item of sorted) {
        // Try to fit in an existing shelf
        let placed = false;
        for (const shelf of shelves) {
            if (
                item.width <= atlasWidth - shelf.currentX &&
                item.height <= shelf.height
            ) {
                result.push({ id: item.id, x: shelf.currentX, y: shelf.y, width: item.width, height: item.height });
                shelf.currentX += item.width;
                placed = true;
                break;
            }
        }

        // Open a new shelf
        if (!placed) {
            const newShelf: Shelf = {
                y: currentY,
                height: item.height,
                currentX: item.width,
            };
            shelves.push(newShelf);
            result.push({ id: item.id, x: 0, y: currentY, width: item.width, height: item.height });
            currentY += item.height;
        }
    }

    return result;
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
	const packed = packShelves(items, atlasSize);

	// Calculate total height needed
    const initialHeight = Math.max(...packed.map(p => p.y + p.height)) + footerHeight;
    const initialWidth = atlasSize;

    // determine scale to fit within atlasSize
    const scale = Math.min(1.0, atlasSize / initialWidth, atlasSize / initialHeight);
    const atlasWidth = Math.floor(initialWidth * scale);
    const atlasHeight = Math.floor(initialHeight * scale);

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

    for (const pack of packed) {
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
				cropUV:frame.cropUV
			});
		}
		mcapClips.push(mcapClip);
	}

	// write in the atlas a signature that says: "by bandinopla"
	ctx.font = `${Math.max(6, Math.floor(12 * scale))}px monospace`; 
	ctx.fillStyle = "#ff0000";
	ctx.fillText("Created with MeshCap : https://bandinopla.github.io/three-mediapipe-rig/?app=meshcap", 0, atlasHeight - Math.max(2, 4 * scale));

    return { 
		canvas: atlasCanvas, 
		clips:mcapClips,
		padding,
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
		}
	};
}
 