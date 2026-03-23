import { GLTFExporter, GLTFLoader, OrbitControls } from "three/examples/jsm/Addons.js";
import type { DemoHandler } from "./demo-type";
import { Mesh } from "three";
import {
    AmbientLight,
    Color,
    MaterialNode,
    MeshPhysicalNodeMaterial,
    PointLight,
    Node,
    TextureLoader,
    SRGBColorSpace,
} from "three/webgpu";
import { Inspector } from "three/examples/jsm/inspector/Inspector.js";
import { mix, texture, uniform } from "three/tsl";
import { NormalizedLandmark } from "@mediapipe/tasks-vision";

export const faceUVDemo: DemoHandler = {
    name: "face-uv",
    trackerConfig: {
        debugVideo: import.meta.env.BASE_URL + "face.mp4",
        //debugVideo: import.meta.env.BASE_URL + "webcam4.mp4", //diferent aspect ratio
        displayScale: 1,
		onlyFace:true,
		drawLandmarksOverlay:false
    },
    setup: (renderer, camera, scene, tracker) => {
        const face = "mediapipe-canonical-face.glb";

        const controls = new OrbitControls(camera, renderer.domElement);
        camera.position.set(0, 0, 11);
        camera.fov = 22.5;
        camera.updateProjectionMatrix();
        controls.update();

        const debugLight = new PointLight(0xff0000, 8, 10);
        debugLight.position.set(0, 0, 0);
        debugLight.castShadow = true;

        scene.add(debugLight);

        scene.background = new Color(0x333333);

        let inspector = new Inspector();
        renderer.inspector = inspector;

        inspector.init();

        const lightSettings = inspector.createParameters("Light");
        const al = new AmbientLight(0xffffff, 0);
        scene.add(al);
        lightSettings.add(al, "intensity", 0, 1, 0.01).name("Ambient");

        let renderFace: ((delta: number) => void) | undefined;

        document.querySelector("#credits > div:last-child")!.innerHTML = `
	Woman video ref by <a href="https://grok.com/imagine">Grok</a>`; 
        //
        // load the model
        //
        new GLTFLoader().load(face, (gltf) => {
            scene.add(gltf.scene);

            //
            // select the canonical face mesh
            // see: https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model.fbx
            //
            const mesh = scene.getObjectByName("face_model_with_iris") as Mesh;
			 
			// scene.add(mesh.clone()); // Uncomment to see how it "deforms" in relation to the original mesh... just so you see how it morphs.

            //
            // this "binds" the geometry to be in sync with the face mesh provided by mediapipe.
            //
            const face = tracker.faceTracker!.bindGeometry(
                mesh,
                (posNode, colorNode) => {
                    //
                    // here we are using the callback to create the material ourselves because
                    // we want to use the uv texture
                    //

                    const uvFactor = uniform(0);

                    const uvTexture = new TextureLoader().load(
                        "canonical_face_model_uv_visualization.png",
                        (texture) => {
                            texture.colorSpace = SRGBColorSpace;
                            texture.flipY = false;
                            texture.generateMipmaps = false;
                            texture.needsUpdate = true;
                        },
                    );

                    mesh.material = new MeshPhysicalNodeMaterial({
                        positionNode: posNode,
                        colorNode: mix(
                            colorNode as Node<"vec4">,
                            texture(uvTexture),
                            uvFactor,
                        ),
                    });

                    shapes.add(uvFactor, "value", 0, 1, 0.01).name("UV Factor");
                },
            );

            //mesh.castShadow = true;
            //mesh.receiveShadow = true;
			mesh.scale.z *= 1.1

            const shapes = inspector.createParameters("Face");
            let vals = { ...mesh.morphTargetDictionary };

            Object.entries(mesh.morphTargetDictionary!).forEach(
                ([key, value]) => {
                    vals[key] = 0;
                    shapes
                        .add(vals, key, 0, 1, 0.001)
                        .name(key)
                        .onChange((v) => {
                            mesh.morphTargetInfluences![value] = v;
                        });
                },
            );

            renderFace = (delta: number) => {
                //
                // keep the vertices in sync so it animates
                //
                face.update(delta);
            };


			const canvases = new Map<string, HTMLCanvasElement>();
			let count = 0;

			//on space key pressed on window...
			window.addEventListener("keydown", (e) => {
				if (e.code === "Space") { 

					if( ++count>=4 )
					{
						const atlas = buildAtlas(canvases, 2048, 2);
						// Download the atlas
						// const a = document.createElement('a');
						// a.href = atlas.canvas.toDataURL();
						// a.download = 'atlas.png';
						// a.click();

						saveAtlas(atlas, 'atlas');

						return;
					}
					
					// Inside your mediapipe results callback:
					const canvas = cropFaceFromLandmarks(
					    tracker.video!,
					    tracker.faceTracker!.lastKnownLandmarks, // first detected face
					    0.5,  // half resolution
					    0.0  // 15% padding around the face
					);

					canvases.set('face_'+count, canvas);

					// // Download it
					// const a = document.createElement('a');
					// a.href = canvas.toDataURL();
					// a.download = 'face.png';
					// a.click();
				}
			});
        });

        return (delta: number) => {
            //
            // Make a light spin just for show...
            //
            debugLight.position.x = Math.sin(Date.now() * 0.01) * 3;
            debugLight.position.y = Math.cos(Date.now() * 0.01) * 3;

            //
            // Update the face
            //
            renderFace?.(delta);
        };
    },
};

function cropFaceFromLandmarks(
    video: HTMLVideoElement,
    landmarks: NormalizedLandmark[], // mediapipe landmarks (normalized 0-1)
    scale: number = 1,
    padding: number = 0.1 // extra padding around the face bounding box (0.1 = 10%)
): HTMLCanvasElement {
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    // Convert normalized landmarks to pixel coordinates
    const xs = landmarks.map(l => l.x * videoWidth);
    const ys = landmarks.map(l => l.y * videoHeight);

    // Get bounding box of all landmarks
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const faceWidth = maxX - minX;
    const faceHeight = maxY - minY;

    // Apply padding
    const padX = faceWidth * padding;
    const padY = faceHeight * padding;

    // Clamp to video bounds
    const srcX = Math.max(0, minX - padX);
    const srcY = Math.max(0, minY - padY);
    const srcW = Math.min(videoWidth - srcX, faceWidth + padX * 2);
    const srcH = Math.min(videoHeight - srcY, faceHeight + padY * 2);

    // Create output canvas at desired scale
    const canvas = document.createElement('canvas');
    canvas.width = srcW * scale;
    canvas.height = srcH * scale;

    const ctx = canvas.getContext('2d')!;

    // Crop from video and draw into canvas
    ctx.drawImage(
        video,
        srcX, srcY, srcW, srcH,       // source rect (from video)
        0, 0, canvas.width, canvas.height // destination rect (into canvas)
    );

    return canvas;
}

interface AtlasEntry {
    canvas: HTMLCanvasElement;
    x: number;
    y: number;
    width: number;
    height: number;
    id: string;
}

interface Atlas {
    canvas: HTMLCanvasElement;
    entries: Map<string, Omit<AtlasEntry, 'canvas'>>;
}

// --- Shelf Bin Packer ---

interface Shelf {
    y: number;
    height: number;
    currentX: number;
}

function packShelves(
    items: { id: string; width: number; height: number }[],
    atlasWidth: number
): { id: string; x: number; y: number; width: number; height: number }[] {
    const shelves: Shelf[] = [];
    const result: { id: string; x: number; y: number; width: number; height: number }[] = [];
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

// --- Atlas Builder ---

function buildAtlas(
    canvases: Map<string, HTMLCanvasElement>,
    atlasWidth: number = 2048,
    padding: number = 2
): Atlas {
    // Prepare items with padding applied
    const items = Array.from(canvases.entries()).map(([id, canvas]) => ({
        id,
        width: canvas.width + padding * 2,
        height: canvas.height + padding * 2,
    }));

    const packed = packShelves(items, atlasWidth);

    // Calculate total height needed
    const atlasHeight = Math.max(...packed.map(p => p.y + p.height));

    // Create the atlas canvas
    const atlasCanvas = document.createElement('canvas');
    atlasCanvas.width = atlasWidth;
    atlasCanvas.height = atlasHeight;
    const ctx = atlasCanvas.getContext('2d')!;

    // Draw all canvases into the atlas
    const entries = new Map<string, Omit<AtlasEntry, 'canvas'>>();

    for (const pack of packed) {
        const sourceCanvas = canvases.get(pack.id)!;
        const x = pack.x + padding;
        const y = pack.y + padding;
        const width = sourceCanvas.width;
        const height = sourceCanvas.height;

        ctx.drawImage(sourceCanvas, x, y);

        entries.set(pack.id, { x, y, width, height });
    }

    return { canvas: atlasCanvas, entries };
}


// Binary manifest format:
// [4 bytes] magic number (0x41544C53 = "ATLS")
// [2 bytes] version
// [2 bytes] atlas width
// [2 bytes] atlas height  
// [2 bytes] entry count
// Per entry:
//   [1 byte]  id length
//   [n bytes] id string (utf8)
//   [2 bytes] x
//   [2 bytes] y
//   [2 bytes] width
//   [2 bytes] height

const MAGIC = 0x41544C53; // "ATLS"
const VERSION = 1;

function serializeAtlasManifest(atlas: Atlas): ArrayBuffer {
    const encoder = new TextEncoder();
    const encodedIds = Array.from(atlas.entries.keys()).map(id => encoder.encode(id));

    // Calculate total size needed
    const headerSize = 4 + 2 + 2 + 2 + 2; // magic + version + w + h + count
    const entriesSize = encodedIds.reduce((sum, id) => {
        return sum + 1 + id.byteLength + 2 + 2 + 2 + 2; // idLen + id + x + y + w + h
    }, 0);

    const buffer = new ArrayBuffer(headerSize + entriesSize);
    const view = new DataView(buffer);
    let offset = 0;

    // Header
    view.setUint32(offset, MAGIC);           offset += 4;
    view.setUint16(offset, VERSION);         offset += 2;
    view.setUint16(offset, atlas.canvas.width);  offset += 2;
    view.setUint16(offset, atlas.canvas.height); offset += 2;
    view.setUint16(offset, atlas.entries.size);  offset += 2;

    // Entries
    const entries = Array.from(atlas.entries.entries());
    for (let i = 0; i < entries.length; i++) {
        const [id, entry] = entries[i];
        const encodedId = encodedIds[i];

        view.setUint8(offset, encodedId.byteLength);   offset += 1;
        new Uint8Array(buffer, offset, encodedId.byteLength).set(encodedId);
        offset += encodedId.byteLength;

        view.setUint16(offset, entry.x);      offset += 2;
        view.setUint16(offset, entry.y);      offset += 2;
        view.setUint16(offset, entry.width);  offset += 2;
        view.setUint16(offset, entry.height); offset += 2;
    }

    return buffer;
}

function deserializeAtlasManifest(buffer: ArrayBuffer): {
    width: number;
    height: number;
    entries: Map<string, { x: number; y: number; width: number; height: number }>;
} {
    const view = new DataView(buffer);
    const decoder = new TextDecoder();
    let offset = 0;

    // Validate magic number
    const magic = view.getUint32(offset); offset += 4;
    if (magic !== MAGIC) throw new Error('Invalid atlas manifest file');

    const version = view.getUint16(offset); offset += 2;
    if (version !== VERSION) throw new Error(`Unsupported atlas version: ${version}`);

    const width  = view.getUint16(offset); offset += 2;
    const height = view.getUint16(offset); offset += 2;
    const count  = view.getUint16(offset); offset += 2;

    const entries = new Map<string, { x: number; y: number; width: number; height: number }>();

    for (let i = 0; i < count; i++) {
        const idLen = view.getUint8(offset); offset += 1;
        const id = decoder.decode(new Uint8Array(buffer, offset, idLen)); offset += idLen;

        const x      = view.getUint16(offset); offset += 2;
        const y      = view.getUint16(offset); offset += 2;
        const width  = view.getUint16(offset); offset += 2;
        const height = view.getUint16(offset); offset += 2;

        entries.set(id, { x, y, width, height });
    }

    return { width, height, entries };
}

function saveAtlas(atlas: Atlas, baseName: string = 'atlas'): void {
    // Save binary manifest
    const manifestBuffer = serializeAtlasManifest(atlas);
    const binBlob = new Blob([manifestBuffer], { type: 'application/octet-stream' });
    const binUrl = URL.createObjectURL(binBlob);
    const binLink = document.createElement('a');
    binLink.href = binUrl;
    binLink.download = `${baseName}.atls`; // custom extension
    binLink.click();
    URL.revokeObjectURL(binUrl);

    // Save atlas image
    atlas.canvas.toBlob((blob) => {
        if (!blob) return;
        const imgUrl = URL.createObjectURL(blob);
        const imgLink = document.createElement('a');
        imgLink.href = imgUrl;
        imgLink.download = `${baseName}.png`;
        imgLink.click();
        URL.revokeObjectURL(imgUrl);
    }, 'image/png');
}

async function restoreAtlas(manifestFile: File, imageFile: File): Promise<Atlas> {
    const [manifestBuffer, bitmap] = await Promise.all([
        manifestFile.arrayBuffer(),
        createImageBitmap(imageFile),
    ]);

    const { width, height, entries } = deserializeAtlasManifest(manifestBuffer);

    const atlasCanvas = document.createElement('canvas');
    atlasCanvas.width = width;
    atlasCanvas.height = height;
    atlasCanvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    bitmap.close();

    return  {
		canvas: atlasCanvas,
		entries: entries
	} as Atlas;
}