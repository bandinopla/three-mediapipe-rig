import { BufferAttribute, Mesh } from "three";

export const FACE_LANDMARKS_COUNT = 478;


/**
 * 
 * @param mesh The mesh to add the landmark index attribute to.
 * @returns 
 */
export const createFaceLandmarksIndexAttribute = ( mesh:Mesh ) =>
{

	if( mesh.geometry.hasAttribute("landmarkIndex")) return;

		const geometry = mesh.geometry;
        const posAttr = geometry.attributes.position; 

        // Build a map from unique positions to the first vertex index that has that position.
        // The canonical face mesh has FACE_LANDMARKS_COUNT landmarks (+ iris vertices). Three.js may duplicate 
        // vertices for normals/UV seams, so vertex index != landmark index.
        // We find unique positions in order of first appearance, which preserves the 
        // original canonical landmark ordering (0..467).
        const uniquePositions: number[] = []; // uniquePositions[landmarkIdx] = geometry vertex index
        const seen = new Map<string, number>(); // position key -> landmark index
		const posIndex2LandmarkIndex : number[] = []; // position index -> landmark index

        for (let i = 0; i < posAttr.count; i++) {
            const key = Math.round(posAttr.getX(i)*1e6) + "," + Math.round(posAttr.getY(i)*1e6) + "," + Math.round(posAttr.getZ(i)*1e6);
            if (!seen.has(key)) {
                seen.set(key, uniquePositions.length);
                uniquePositions.push(i); // the first vertex index for this unique position
            }
			const idx = seen.get(key)!; 
			
			posIndex2LandmarkIndex.push(idx < FACE_LANDMARKS_COUNT ? idx : 65535);
        } 

		geometry.setAttribute("landmarkIndex", new BufferAttribute(new Float32Array(posIndex2LandmarkIndex), 1));	
}