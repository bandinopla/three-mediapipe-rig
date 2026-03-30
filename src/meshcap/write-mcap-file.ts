



import { deflate } from "fflate";
import { MCAP_FILE_VERSION, MCAP_MAGIC } from "./constants";
import { MeshCapAtlas } from "./types";  
import { FACE_LANDMARKS_COUNT } from "../tracking/util/face-tracker-utils";


export async function atlasToMCap(atlas: MeshCapAtlas, useRelativeLandmarks:boolean = true ) {
    const encoder = new TextEncoder();
    const encodedIds = atlas.clips.map( clip=>encoder.encode(clip.name )); 

    // Calculate total size needed
    const headerSize = 4 + 1 + 1 + 2 + 1; // magic + version + clips count + atlasSize + atlasPadding
	const entriesSize = encodedIds.reduce((sum, id, i) => {
	    const frameCount = atlas.clips[i].frames.length;
	    const idSize = 1 + id.byteLength;           // 1 byte length + id bytes
	    const frameCountSize = 1;                    // uint16 frame count
		const fpsSize = 1;
		const scaleSize = 1;
		const aspectRatioSize = 1; 
	    const frameCropInfoSize = (2 + 2 + 2 + 2) * 2; // XYWH for: UV crop + atlast coords
	

	    let landmarksSize = FACE_LANDMARKS_COUNT * (2 + 2 + 2);    //  landmarks * (x+y+z) per frame 
		

	    return sum + idSize + frameCountSize + fpsSize + scaleSize + aspectRatioSize +
		
		( useRelativeLandmarks? 
			(frameCropInfoSize + landmarksSize) + (frameCropInfoSize + FACE_LANDMARKS_COUNT * (1+1+1)) * (frameCount-1) 

			: (frameCropInfoSize + landmarksSize ) * frameCount );
	}, 0);

	// if clip has no audio we will store a "0" byte to indicate that.
	// otherwise we store the start and duration of the audio sprite.
	const extraDataSize = atlas.clips.reduce((sum, clip) => {
		return sum + 2+2; // sound start timein atlas + duration
	}, 0);

	const framesStartTimesSize = atlas.clips.reduce((sum, clip) => {
		return sum + (clip.frames.length * 1); //1 byte for frame start time delta
	}, 0);

    const buffer = new ArrayBuffer(headerSize + entriesSize + extraDataSize + framesStartTimesSize );  

    const view = new DataView(buffer);
    let offset = 0;

    // Header
    view.setUint32(offset, MCAP_MAGIC);           offset += 4;
    view.setUint8(offset, MCAP_FILE_VERSION);         offset += 1; 
    view.setUint8(offset, atlas.clips.length);  offset += 1;
	view.setUint16(offset, atlas.atlasSize);  offset += 2;
	view.setUint8(offset, atlas.padding);  offset += 1;

	//
    // for each clip
	//
	for( let i=0; i<atlas.clips.length; i++ )
	{
		//
		// clip info
		// 
		view.setUint8(offset, encodedIds[i].byteLength);   offset += 1; 
		new Uint8Array(buffer, offset, encodedIds[i].byteLength).set(encodedIds[i]);
		offset += encodedIds[i].byteLength; 
		
		view.setUint8(offset, atlas.clips[i].frames.length);      offset += 1;
		view.setUint8(offset, atlas.clips[i].fps);                 offset += 1;
		view.setUint8(offset, Math.round(atlas.clips[i].scale * 100));         offset += 1;
		view.setUint8(offset, Math.round(atlas.clips[i].aspectRatio * 100));   offset += 1;

		const clipInfo = atlas.clips[i];

		//
		// for each frame of the clip...
		//
		for( let j=0; j<clipInfo.frames.length; j++ )
		{
			const landmarksCropUv = clipInfo.frames[j].cropUV; 
			const frameAtlasCoords = clipInfo.frames[j].frameUV;

			//
			// landmarks crop info
			//
			view.setUint16(offset, Math.round(frameAtlasCoords.u * 1000));      offset += 2;
			view.setUint16(offset, Math.round(frameAtlasCoords.v * 1000));      offset += 2;
			view.setUint16(offset, Math.round(frameAtlasCoords.w * 1000));  	offset += 2;
			view.setUint16(offset, Math.round(frameAtlasCoords.h * 1000));  	offset += 2;

			//
			// frame's crop info
			//
			view.setUint16(offset, Math.round(landmarksCropUv.u * 1000));      offset += 2;
			view.setUint16(offset, Math.round(landmarksCropUv.v * 1000));      offset += 2;
			view.setUint16(offset, Math.round(landmarksCropUv.w * 1000));  	offset += 2;
			view.setUint16(offset, Math.round(landmarksCropUv.h * 1000));  	offset += 2;

			const landmarks = clipInfo.landmarks[j];
			const prevLandmarks = j > 0 ? clipInfo.landmarks[j - 1] : null;

			const maxZ = landmarks.reduce((max, landmark) => Math.max(max, Math.abs(landmark.z)), 0);
			 
			for (let k = 0; k < FACE_LANDMARKS_COUNT; k++) {
				const x = Math.round(landmarks[k].x * 1000);
            	const y = Math.round(landmarks[k].y * 1000);
            	const z = Math.round(landmarks[k].z * 1000);
 

				if( useRelativeLandmarks )
				{
					 
					// --- RELATIVE TEST
					// here we store the landmarks on frame 1 and the rest of the frames are relative values.
					// this is to allow for the compression to apparently pack more data.
					//
					if (prevLandmarks === null) {
		                // First frame — store absolute
		                view.setUint16(offset, x); offset += 2; // 0-100 fits in Uint8
				    	view.setUint16(offset, y); offset += 2; // 0-100 fits in Uint8
				    	view.setInt16(offset,  z); offset += 2; // ~-10 to 10 fits in Int8
		            } else {
		                // Subsequent frames — store delta
		                const prevX = Math.round(prevLandmarks[k].x * 1000);
		                const prevY = Math.round(prevLandmarks[k].y * 1000);
		                const prevZ = Math.round(prevLandmarks[k].z * 1000);

		                const dx = x - prevX;
		                const dy = y - prevY;
		                const dz = z - prevZ;
	 
		                view.setInt8(offset, dx); offset += 1;
		                view.setInt8(offset, dy); offset += 1;
		                view.setInt8(offset, dz); offset += 1;
		            }
				}
				else 
				{
					view.setUint16(offset, x); offset += 2; // 0-100 fits in Uint8
				    view.setUint16(offset, y); offset += 2; // 0-100 fits in Uint8
				    view.setInt16(offset,  z); offset += 2; // ~-10 to 10 fits in Int8
				}
				/*/

				//*/

				

				/** decoding  
				 * 		x: view.getUint8(offset) / 100, offset += 1,
				 * 		y: view.getUint8(offset) / 100, offset += 1,
				 * 		z: view.getInt8(offset)  / 100, offset += 1,*/
			}
		} 
	}  

	//
	// audio sprites
	// 
	for( let i=0; i<atlas.clips.length; i++ )
	{
		const clipInfo = atlas.clips[i];

		view.setUint16(offset, Math.round(clipInfo.duration * 1000));  offset += 2;

		if( clipInfo.audioSprite )
		{  
			view.setUint16(offset, Math.round(clipInfo.audioSprite.start * 1000)); 
		}
		else
		{
			// will use 1 as sentinel value to indicate no audio clip.
			view.setUint16(offset, 1); 
		}

		offset += 2;
	}

	//
	// store frame deltas ( time spent from the last frame to this one.)
	//
	for( let i=0; i<atlas.clips.length; i++ )
	{
		const clipInfo = atlas.clips[i];
		let lastTimestamp = 0; 
		for (const frame of clipInfo.frames) {
			const delta = Math.floor((frame.startTime - lastTimestamp) * 1000); // ms
			view.setUint8(offset, delta);
			offset += 1;
			lastTimestamp = frame.startTime;
		}
	}

	return new Promise<Blob>((resolve, reject)=>{

		deflate(new Uint8Array(buffer), { level:9 }, ( err, result )=>{
		
			if( err ) return reject(err);
			
			const binBlob = new Blob([result as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' });

			resolve(binBlob); 
		});

	})
 
}
 