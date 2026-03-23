![cover](meshcap-cover.jpg)

# [MeshCap](https://bandinopla.github.io/three-mediapipe-rig/?editor=meshcap) 
### A humble [**online editor** :rocket:](https://bandinopla.github.io/three-mediapipe-rig/?editor=meshcap) 
It allow you to quickly create a set of pre-recorded face clips of a person using a video or the webcam and reproduce them on a game or application by deforming and texturing a mesh using [three.js](https://threejs.org/) ( GPU ) all powered by [Google's MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker).   

The editor will produce 2 files:
- A [.mcap file](MESHCAP-FILE.md): This is a binary file that contains the metadata of the clips.
- A .png file: This is a texture atlas that contains the recorded face clips.

See [Video example](https://x.com/bandinopla/status/2034026075362046342)

## How is this useful?
By using a webcam or video of a person's face as source for the texture, and using mediapipe to deform a mesh, you can produce more realistic faces for characters or NPCs or a floating head of a virtual assistant. The recorded face is projected onto the mesh but the mesh is also deformed to match the face so the end result is an interestic realistic face.

## Install
```
npm install three-mediapipe-rig
```
> **Peer dependency:** [three](https://www.npmjs.com/package/three) `^0.182.0` + [mediapipe](https://www.npmjs.com/package/@mediapipe/tasks-vision) `^0.10.32` + [fflate](https://www.npmjs.com/package/fflate) `^0.8.2`

## Use
After you use the online editor and save the .mcap and atlas texture, in your project you do this ( remember the faceMesh must be a variation of the [canonical mesh](https://github.com/google-ai-edge/mediapipe/tree/master/mediapipe/modules/face_geometry) since the order of the vertices matters!! )

```typescript
import * as THREE from "three/webgpu";
import { 
    loadMeshCapFile, 
	createMeshCapMaterial
} from "three-mediapipe-rig/meshcap"; 


const metadata = await loadMeshCapFile("your-metadata.mcap");
const loader = new THREE.TextureLoader();
const atlasTexture = await loader.loadAsync( 'your-atlas.png' );

//
// this will add a positionNode and a colorNode to the material of the mesh or create a brand new material.
//
const materialHandler = createMeshCapMaterial( atlasTexture, metadata.clips, yourFaceMesh );

//
// to keep the geometry updated, on your loop call...
// this is what moves the vertices of the mesh to match the pre-recorded clips and will also update the UVs to use the atlas to display the correct frame.
//
materialHandler.update( delta );

//
// to play clips call...
//
materialHandler.gotoAndLoop("smiling"); // clip's name
materialHandler.gotoAndLoop(1); // clip's Index

//
// when you finish... will dispose the material + the atlas texture
//
materialHandler.dispose();

```

## Playing the pre-recorded clips
You can pass the clip's index or the name of the clip in these methods...

```typescript  

// play a clip and loops when it reaches the end
materialHandler.gotoAndLoop:( clipIndex:number|string )=>void

// play a clip once ( stops when the end is reached )
materialHandler.gotoAndPlay:( clipIndex:number|string )=>void

```

remember to call update on every frame!

```js
materialHandler.update( delta ); //<-- this is what makes things move!
```

## Edit the clips
You can re-load the .mcap file and the atlas in the online editor to edit the file and add/remove clips, rename, etc...

# How does this work?
#### In the editor...
* MediaPipe will detect a face on a video ( you can load a video file ) or webcam stream
* This comes as a set of 478 landmarks
* the area of the detected face on the video will be cropped
* Both landmarks + cropped face are now a single frame in a clip.
* You record several frames and save them as a clip.
* You save all the clips in a .mcap file and the atlas texture.
#### In your project...
* Then in your game or project, you load the .mcap file and the atlas texture.
* The .mcap file contains the metadata of the clips ( landmarks, coordinates of the face in the atlas )
* The atlas texture contains the cropped faces.
* The library will use the landmarks to move the vertices of the mesh to match the pre-recorded clips and will also update the UVs to use the atlas to display the correct frame. 

# Caveats + Technical Details
* The mesh must be a variation of the [canonical mesh](https://github.com/google-ai-edge/mediapipe/tree/master/mediapipe/modules/face_geometry) since the order of the vertices matters! ( They ahave a 1:1 relation with the landmarks )
* Ideally, you will want to record faces looking straight at the camera. Rotating or moving back and forth will make things look weird / skewed.
* The canonical mesh is a pre made face mesh, but you CAN extrude and add more polygons to complete the face, since all new vertices won't change the position of the initial 478 ones that are in the order expected by the library. 
* This is designed to focus on the face, then you can attatch the face to a rig or a body and move it around.

# Questions?
tag me on X (twitter) [@bandinopla](https://x.com/bandinopla) so others may also benefit from the answer. Any contribution is welcome, just open an issue or a PR.